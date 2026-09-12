import { isBackwardClosure, isSkippedClosure, reduceClosure } from '@/domain/closure-reducer'
import { ELIGIBILITY_RULE_TEXT } from '@/domain/eligibility'
import { isOutstandingTransfer, lastTransferToActorId, reduceOwnership } from '@/domain/ownership-reducer'
import { rememberProtocol } from '@/domain/protocol'
import type {
  CovenantCase,
  EventEnvelope,
  EvidenceRef,
  ProtocolVersion,
  SourceClassification,
} from '@/domain/types'

export type ReduceResult =
  | { ok: true; state: CovenantCase }
  | { ok: false; state: CovenantCase; reason: string }

const UNSET_CLASSIFICATION: SourceClassification = {
  rule: 'source-reference-range',
  ruleText: ELIGIBILITY_RULE_TEXT,
  analyteId: '',
  analyteName: '',
  value: 0,
  unit: '',
  referenceLow: 0,
  referenceHigh: 0,
  direction: 'above',
}

export function initialCase(input: {
  caseId: string
  patientId: string
  protocol: ProtocolVersion
}): CovenantCase {
  rememberProtocol(input.protocol)
  return {
    caseId: input.caseId,
    patientId: input.patientId,
    sourceResultId: '',
    sourceResultVersion: 0,
    sourceClassification: UNSET_CLASSIFICATION,
    orderingTeamId: input.protocol.fallbackTeamId,
    currentAccountableOwner: { teamId: input.protocol.fallbackTeamId },
    requestedReceiver: null,
    acceptingActor: null,
    protocolVersion: input.protocol.id,
    ownershipState: 'ORDERER_OWNS',
    closureState: 'RESULT_AVAILABLE',
    submissionState: 'NOT_SUBMITTED',
    deadlines: { ackDeadlineAt: null },
    evidenceRefs: [],
    exceptionsEmitted: [],
    duplicateSuppressed: 0,
    manualChases: 0,
    eventLog: [],
  }
}

function clone(state: CovenantCase): CovenantCase {
  return {
    ...state,
    currentAccountableOwner: { ...state.currentAccountableOwner },
    deadlines: { ...state.deadlines },
    evidenceRefs: [...state.evidenceRefs],
    exceptionsEmitted: [...state.exceptionsEmitted],
    eventLog: [...state.eventLog],
  }
}

function append(state: CovenantCase, envelope: EventEnvelope): CovenantCase {
  return { ...clone(state), eventLog: [...state.eventLog, envelope] }
}

function pushEvidence(state: CovenantCase, ref: EvidenceRef): CovenantCase {
  return { ...state, evidenceRefs: [...state.evidenceRefs, ref] }
}

function canAccept(
  state: CovenantCase,
  actorTeamId: string,
  actorId: string,
  protocol: ProtocolVersion,
): boolean {
  if (!isOutstandingTransfer(state)) {
    return false
  }
  if (state.requestedReceiver == null || actorTeamId !== state.requestedReceiver) return false
  if (protocol.receiverMode === 'NAMED_ACTOR') {
    const expected = lastTransferToActorId(state)
    if (!expected || actorId !== expected) return false
  }
  return true
}

function applySubmissionAndEvidence(state: CovenantCase, envelope: EventEnvelope): CovenantCase {
  const event = envelope.event
  switch (event.type) {
    case 'ActionSubmitted':
      return { ...pushEvidence(state, event.receipt), submissionState: 'SUBMITTED' }
    case 'ActionVisibleDownstream':
      return { ...pushEvidence(state, event.evidence), submissionState: 'VISIBLE_DOWNSTREAM' }
    case 'TransferAccepted':
      return { ...state, submissionState: 'ACCEPTED' }
    case 'ActivityEvidenced':
      return { ...pushEvidence(state, event.evidence), submissionState: 'EVIDENCED' }
    case 'PlanRecorded':
      return pushEvidence(state, event.planRef)
    case 'PatientContactEvidenced':
      return pushEvidence(state, event.evidence)
    case 'OutcomeEvidenced':
      return pushEvidence(state, event.evidence)
    case 'ManualChase':
      return { ...state, manualChases: state.manualChases + 1 }
    case 'FallbackNotified':
      if (state.exceptionsEmitted.includes(event.exceptionId)) return state
      return { ...state, exceptionsEmitted: [...state.exceptionsEmitted, event.exceptionId] }
    default:
      return state
  }
}

function generatedEnvelope(
  parent: EventEnvelope,
  state: CovenantCase,
  event: EventEnvelope['event'],
  suffix: string,
): EventEnvelope {
  const now = parent.event.type === 'ClockTick' ? parent.event.now : parent.simulatorTime
  return {
    eventId: `${parent.eventId}:${suffix}`,
    caseId: state.caseId,
    simulatorTime: now,
    actor: 'protocol',
    sourceVersion: state.sourceResultVersion,
    event,
  }
}

function lastFallbackTime(state: CovenantCase): number | null {
  for (let i = state.eventLog.length - 1; i >= 0; i -= 1) {
    const envelope = state.eventLog[i]
    if (envelope?.event.type === 'FallbackNotified') return envelope.simulatorTime
  }
  return null
}

function applyClockTick(
  state: CovenantCase,
  envelope: EventEnvelope,
  protocol: ProtocolVersion,
): ReduceResult {
  const now = envelope.event.type === 'ClockTick' ? envelope.event.now : envelope.simulatorTime
  const deadline = state.deadlines.ackDeadlineAt
  if (deadline == null || now < deadline) return { ok: true, state }

  if (!isOutstandingTransfer(state)) return { ok: true, state }

  const lastFallbackAt = lastFallbackTime(state)
  const windowMs = protocol.dedupeWindowMinutes * 60_000
  const withinWindow =
    protocol.dedupeWindowMinutes > 0 &&
    lastFallbackAt != null &&
    now - lastFallbackAt <= windowMs

  let next = state
  if (state.ownershipState !== 'OVERDUE') {
    const afterTimeout = reduce(
      next,
      generatedEnvelope(envelope, next, { type: 'TransferTimedOut' }, 'TransferTimedOut'),
      protocol,
    )
    next = afterTimeout.state
  }

  if (withinWindow) {
    return { ok: true, state: { ...next, duplicateSuppressed: next.duplicateSuppressed + 1 } }
  }

  const exceptionId = `${envelope.eventId}:exception`
  const afterFallback = reduce(
    next,
    generatedEnvelope(
      envelope,
      next,
      { type: 'FallbackNotified', toTeam: protocol.fallbackTeamId, exceptionId },
      'FallbackNotified',
    ),
    protocol,
  )
  return { ok: true, state: afterFallback.state }
}

export function reduce(
  state: CovenantCase,
  envelope: EventEnvelope,
  protocol: ProtocolVersion,
): ReduceResult {
  rememberProtocol(protocol)
  if (state.eventLog.some((item) => item.eventId === envelope.eventId)) {
    return { ok: false, state, reason: 'duplicate-event' }
  }

  const event = envelope.event

  if (event.type === 'TransferAccepted') {
    if (!canAccept(state, event.actor.teamId, event.actor.id, protocol)) {
      return { ok: false, state, reason: 'invalid-acceptance' }
    }
  }

  if (event.type === 'ActionSubmitted') {
    if (state.ownershipState === 'STALE') {
      return { ok: false, state, reason: 'stale-source' }
    }
    const duplicateKey = state.eventLog.some(
      (item) =>
        item.event.type === 'ActionSubmitted' && item.event.idempotencyKey === event.idempotencyKey,
    )
    if (duplicateKey) return { ok: false, state, reason: 'duplicate-action' }
  }

  if (isBackwardClosure(state, event)) {
    return { ok: false, state, reason: 'backward-transition' }
  }

  if (isSkippedClosure(state, event)) {
    return { ok: false, state, reason: 'invalid-closure-transition' }
  }

  let next = append(state, envelope)
  next = reduceOwnership(next, envelope, protocol)
  const closure = reduceClosure(next, envelope)
  if (!closure.ok) return { ok: false, state, reason: closure.reason }
  next = applySubmissionAndEvidence(closure.state, envelope)

  if (event.type === 'ClockTick') {
    return applyClockTick(next, envelope, protocol)
  }

  if (event.type === 'SourceVersionChanged') {
    const reopen = generatedEnvelope(
      envelope,
      next,
      { type: 'CaseReopened', affectedSteps: ['CLINICALLY_REVIEWED', 'PLAN_RECORDED'] },
      'CaseReopened',
    )
    return reduce(next, reopen, protocol)
  }

  return { ok: true, state: next }
}

export function replayAll(
  start: CovenantCase,
  log: EventEnvelope[],
  protocol: ProtocolVersion,
): { state: CovenantCase; rejected: { envelope: EventEnvelope; reason: string }[] } {
  let state = start
  const rejected: { envelope: EventEnvelope; reason: string }[] = []
  for (const envelope of log) {
    const result = reduce(state, envelope, protocol)
    if (result.ok) {
      state = result.state
    } else {
      rejected.push({ envelope, reason: result.reason })
    }
  }
  return { state, rejected }
}
