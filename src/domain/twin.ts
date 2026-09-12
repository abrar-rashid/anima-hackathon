import { createHash } from 'node:crypto'

import { initialCase, replayAll } from '@/domain/case-reducer'
import { evaluateInvariants, type InvariantResult } from '@/domain/invariants'
import type { CovenantCase, DomainEvent, EventEnvelope, ProtocolVersion } from '@/domain/types'

const MS_PER_MIN = 60_000
const SYNTHESIZED_TYPES = new Set<DomainEvent['type']>(['TransferTimedOut', 'FallbackNotified'])

export interface TwinMetrics {
  acceptedOwnerLatencyMin: number | null
  ordererUnacceptedMinutes: number
  timeToClinicalReviewMin: number | null
  timeToPatientContactMin: number | null
  timeToActionEvidenceMin: number | null
  timeToOutcomeEvidenceMin: number | null
  manualChases: number
  duplicateAlerts: number
  timeouts: number
  reopens: number
}

export interface TwinRun {
  protocolId: string
  protocol?: ProtocolVersion
  finalState: CovenantCase
  acceptedLog: EventEnvelope[]
  rejected: { envelope: EventEnvelope; reason: string }[]
  metrics: TwinMetrics
  invariants: InvariantResult[]
}

type TwinRunWithHash = TwinRun & { traceHash: string }

function minutesBetween(from: number, to: number): number {
  return (to - from) / MS_PER_MIN
}

function firstOfType(log: EventEnvelope[], type: DomainEvent['type']): EventEnvelope | undefined {
  return log.find((envelope) => envelope.event.type === type)
}

function countType(log: EventEnvelope[], type: DomainEvent['type']): number {
  return log.filter((envelope) => envelope.event.type === type).length
}

function hashTrace(trace: EventEnvelope[]): string {
  return createHash('sha256').update(JSON.stringify(trace)).digest('hex')
}

function inputFingerprint(run: TwinRun): string {
  const envelopes = [...run.acceptedLog, ...run.rejected.map((row) => row.envelope)].filter(
    (envelope) => !SYNTHESIZED_TYPES.has(envelope.event.type),
  )
  const canonical = envelopes
    .map((envelope) => `${envelope.eventId}:${envelope.simulatorTime}:${envelope.event.type}`)
    .sort()
    .join('|')
  return createHash('sha256').update(canonical).digest('hex')
}

function runTraceHash(run: TwinRun): string {
  if ('traceHash' in run && typeof (run as TwinRunWithHash).traceHash === 'string') {
    return (run as TwinRunWithHash).traceHash
  }
  return inputFingerprint(run)
}

function acceptedTransfer(state: CovenantCase, acceptedLog: EventEnvelope[]): EventEnvelope | undefined {
  const accepts = acceptedLog.filter(
    (envelope): envelope is EventEnvelope<Extract<DomainEvent, { type: 'TransferAccepted' }>> =>
      envelope.event.type === 'TransferAccepted',
  )
  if (state.acceptingActor) {
    const matched = accepts.find((envelope) => envelope.event.actor.id === state.acceptingActor?.id)
    if (matched) return matched
  }
  return accepts[0]
}

function computeMetrics(state: CovenantCase, acceptedLog: EventEnvelope[]): TwinMetrics {
  const origin =
    firstOfType(acceptedLog, 'ResultAvailable')?.simulatorTime ??
    firstOfType(state.eventLog, 'ResultAvailable')?.simulatorTime ??
    acceptedLog[0]?.simulatorTime ??
    0

  const transferRequested = firstOfType(acceptedLog, 'TransferRequested')
  const accepted = acceptedTransfer(state, acceptedLog)
  const acceptedAt = accepted?.simulatorTime
  const latencyOrigin = transferRequested?.simulatorTime ?? origin

  const timeoutEvents = countType(acceptedLog, 'TransferTimedOut')
  const exceptionCount = state.exceptionsEmitted.length
  const timeouts = timeoutEvents > 0 ? timeoutEvents : exceptionCount > 0 ? 1 : 0
  const duplicateAlerts = Math.max(0, exceptionCount - (timeouts > 0 ? 1 : 0))

  const reviewAt = firstOfType(acceptedLog, 'ClinicalReviewRecorded')?.simulatorTime
  const contactAt = firstOfType(acceptedLog, 'PatientContactEvidenced')?.simulatorTime
  const actionAt =
    firstOfType(acceptedLog, 'ActivityEvidenced')?.simulatorTime ??
    firstOfType(acceptedLog, 'ActionVisibleDownstream')?.simulatorTime
  const outcomeAt = firstOfType(acceptedLog, 'OutcomeEvidenced')?.simulatorTime
  const lastAt = acceptedLog.at(-1)?.simulatorTime ?? origin

  return {
    acceptedOwnerLatencyMin: acceptedAt === undefined ? null : minutesBetween(latencyOrigin, acceptedAt),
    ordererUnacceptedMinutes: minutesBetween(origin, acceptedAt ?? lastAt),
    timeToClinicalReviewMin: reviewAt === undefined ? null : minutesBetween(origin, reviewAt),
    timeToPatientContactMin: contactAt === undefined ? null : minutesBetween(origin, contactAt),
    timeToActionEvidenceMin: actionAt === undefined ? null : minutesBetween(origin, actionAt),
    timeToOutcomeEvidenceMin: outcomeAt === undefined ? null : minutesBetween(origin, outcomeAt),
    manualChases: state.manualChases,
    duplicateAlerts,
    timeouts,
    reopens: countType(acceptedLog, 'CaseReopened'),
  }
}

export function replayTrace(
  trace: EventEnvelope[],
  protocol: ProtocolVersion,
  caseSeed: { caseId: string; patientId: string },
): TwinRun {
  const start = initialCase({ caseId: caseSeed.caseId, patientId: caseSeed.patientId, protocol })
  const { state, rejected } = replayAll(start, trace, protocol)
  const rejectedIds = new Set(rejected.map((row) => row.envelope.eventId))
  const acceptedFromInput = trace.filter((envelope) => !rejectedIds.has(envelope.eventId))
  const synthesized = state.eventLog.filter(
    (envelope) => !trace.some((input) => input.eventId === envelope.eventId),
  )
  const acceptedLog = [...acceptedFromInput, ...synthesized].sort((a, b) => {
    if (a.simulatorTime !== b.simulatorTime) return a.simulatorTime - b.simulatorTime
    return a.eventId.localeCompare(b.eventId)
  })

  const run: TwinRunWithHash = {
    protocolId: protocol.id,
    protocol,
    finalState: state,
    acceptedLog,
    rejected,
    metrics: computeMetrics(state, acceptedLog),
    invariants: evaluateInvariants(state, undefined, protocol),
    traceHash: hashTrace(trace),
  }
  return run
}

function metricDelta(baseline: number | null, candidate: number | null): number | null {
  if (baseline === null || candidate === null) return null
  return candidate - baseline
}

export function compare(
  baseline: TwinRun,
  candidate: TwinRun,
): {
  baseline: TwinRun
  candidate: TwinRun
  deltas: Record<keyof TwinMetrics, number | null>
  candidateStatus: 'PASSED' | 'FAILED_INVARIANTS'
  sameTrace: boolean
} {
  const invariants = evaluateInvariants(candidate.finalState, baseline.finalState, candidate.protocol)
  const candidateWithInvariants: TwinRun = { ...candidate, invariants }
  const keys = Object.keys(baseline.metrics) as (keyof TwinMetrics)[]
  const deltas = Object.fromEntries(
    keys.map((key) => [key, metricDelta(baseline.metrics[key], candidate.metrics[key])]),
  ) as Record<keyof TwinMetrics, number | null>

  return {
    baseline,
    candidate: candidateWithInvariants,
    deltas,
    candidateStatus: invariants.every((row) => row.passed) ? 'PASSED' : 'FAILED_INVARIANTS',
    sameTrace: runTraceHash(baseline) === runTraceHash(candidate),
  }
}
