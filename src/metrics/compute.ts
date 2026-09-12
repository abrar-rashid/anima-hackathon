import { initialCase, reduce, replayAll } from '@/domain/case-reducer'
import type {
  ClosureState,
  CovenantCase,
  DomainEvent,
  EventEnvelope,
  OwnershipState,
  ProtocolVersion,
} from '@/domain/types'
import { minutesBetween, observeLatency, type LatencyObservation } from '@/metrics/censoring'
import {
  STEP_TO_LATENCY,
  WORKFLOW_STEPS,
  type ClosureOutcome,
  type LatencyMetricName,
  type LedgerTaskObservation,
  type SimulatorClock,
  type StateTrack,
  type WorkflowStep,
} from '@/metrics/definitions'

export interface ComputeCaseInput {
  events: readonly EventEnvelope[]
  protocol: ProtocolVersion
  clock: SimulatorClock
  patientId: string
  caseId?: string
  /** Structural ledger rows. Do not import `src/tasks` — adapt later. */
  ledgerObservations?: readonly LedgerTaskObservation[]
}

export interface StateDwell {
  track: StateTrack
  state: string
  enteredAt: number
  exitedAt: number | null
  minutes: number
  censored: boolean
}

export interface TaskClosureRecord {
  taskId: string
  episodeId: string | null
  outcome: ClosureOutcome
  elapsedMinutes: number
  completionMinutes: number | null
  deadlineAt: number | null
  lastStatus: string
}

export interface CaseClosureSummary {
  outcome: ClosureOutcome
  closureState: ClosureState
  ownershipState: OwnershipState
}

export interface CaseCounts {
  manualChases: number
  duplicateAlerts: number
  timeouts: number
  reopens: number
  exceptions: number
}

export interface CaseMetrics {
  caseId: string
  patientId: string
  protocolId: string
  observedAt: number
  eventCount: number
  latencies: Record<LatencyMetricName, LatencyObservation>
  counts: CaseCounts
  closure: CaseClosureSummary
  stalledStep: WorkflowStep | null
  timeInState: readonly StateDwell[]
  tasks: readonly TaskClosureRecord[]
}

const TERMINAL_NEVER_CLOSED: ReadonlySet<ClosureState> = new Set([
  'PATIENT_UNREACHED',
  'ACTION_NOT_BOOKED',
  'ACTION_MISSED',
])

const CLOSED_LEDGER = new Set(['closed', 'completed', 'done'])
const NEVER_CLOSED_LEDGER = new Set(['never_closed', 'missed', 'unexecuted', 'cancelled', 'canceled'])
const OVERDUE_LEDGER = new Set(['overdue', 'late'])

function eventTime(envelope: EventEnvelope): number {
  return envelope.event.type === 'ClockTick' ? envelope.event.now : envelope.simulatorTime
}

function firstOfType(log: readonly EventEnvelope[], type: DomainEvent['type']): EventEnvelope | undefined {
  return log.find((envelope) => envelope.event.type === type)
}

function firstOfTypes(
  log: readonly EventEnvelope[],
  types: readonly DomainEvent['type'][],
): EventEnvelope | undefined {
  for (const type of types) {
    const found = firstOfType(log, type)
    if (found) return found
  }
  return undefined
}

function countType(log: readonly EventEnvelope[], type: DomainEvent['type']): number {
  return log.filter((envelope) => envelope.event.type === type).length
}

function acceptedTransfer(
  state: CovenantCase,
  acceptedLog: readonly EventEnvelope[],
): EventEnvelope | undefined {
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

function sortLog(events: readonly EventEnvelope[]): EventEnvelope[] {
  return [...events].sort((a, b) => {
    if (a.simulatorTime !== b.simulatorTime) return a.simulatorTime - b.simulatorTime
    return a.eventId.localeCompare(b.eventId)
  })
}

function replayCase(
  events: readonly EventEnvelope[],
  protocol: ProtocolVersion,
  caseId: string,
  patientId: string,
): { state: CovenantCase; acceptedLog: EventEnvelope[] } {
  const start = initialCase({ caseId, patientId, protocol })
  const { state, rejected } = replayAll(start, [...events], protocol)
  const rejectedIds = new Set(rejected.map((row) => row.envelope.eventId))
  const acceptedFromInput = events.filter((envelope) => !rejectedIds.has(envelope.eventId))
  const inputIds = new Set(events.map((envelope) => envelope.eventId))
  const synthesized = state.eventLog.filter((envelope) => !inputIds.has(envelope.eventId))
  return { state, acceptedLog: sortLog([...acceptedFromInput, ...synthesized]) }
}

function collectDwells(
  events: readonly EventEnvelope[],
  protocol: ProtocolVersion,
  caseId: string,
  patientId: string,
  observedAt: number,
): { dwells: StateDwell[]; closedAt: number | undefined } {
  const start = initialCase({ caseId, patientId, protocol })
  if (events.length === 0) {
    return {
      dwells: [
        {
          track: 'ownership',
          state: start.ownershipState,
          enteredAt: observedAt,
          exitedAt: null,
          minutes: 0,
          censored: true,
        },
        {
          track: 'closure',
          state: start.closureState,
          enteredAt: observedAt,
          exitedAt: null,
          minutes: 0,
          censored: true,
        },
        {
          track: 'submission',
          state: start.submissionState,
          enteredAt: observedAt,
          exitedAt: null,
          minutes: 0,
          censored: true,
        },
      ],
      closedAt: undefined,
    }
  }

  const origin = eventTime(events[0]!)
  let state = start
  let ownership: { state: string; enteredAt: number } = {
    state: start.ownershipState,
    enteredAt: origin,
  }
  let closure: { state: string; enteredAt: number } = {
    state: start.closureState,
    enteredAt: origin,
  }
  let submission: { state: string; enteredAt: number } = {
    state: start.submissionState,
    enteredAt: origin,
  }
  const dwells: StateDwell[] = []
  let closedAt: number | undefined

  const emitIfChanged = (
    track: StateTrack,
    open: { state: string; enteredAt: number },
    nextState: string,
    at: number,
  ): { state: string; enteredAt: number } => {
    if (nextState === open.state) return open
    dwells.push({
      track,
      state: open.state,
      enteredAt: open.enteredAt,
      exitedAt: at,
      minutes: minutesBetween(open.enteredAt, at),
      censored: false,
    })
    return { state: nextState, enteredAt: at }
  }

  for (const envelope of events) {
    const result = reduce(state, envelope, protocol)
    if (!result.ok) continue
    const at = eventTime(envelope)
    ownership = emitIfChanged('ownership', ownership, result.state.ownershipState, at)
    closure = emitIfChanged('closure', closure, result.state.closureState, at)
    submission = emitIfChanged('submission', submission, result.state.submissionState, at)
    if (result.state.closureState === 'CLOSED' && closedAt === undefined) {
      closedAt = at
    }
    state = result.state
  }

  const censor = (track: StateTrack, open: { state: string; enteredAt: number }): void => {
    dwells.push({
      track,
      state: open.state,
      enteredAt: open.enteredAt,
      exitedAt: null,
      minutes: minutesBetween(open.enteredAt, observedAt),
      censored: true,
    })
  }
  censor('ownership', ownership)
  censor('closure', closure)
  censor('submission', submission)
  return { dwells, closedAt }
}

function classifyCaseOutcome(state: CovenantCase, observedAt: number): ClosureOutcome {
  if (state.closureState === 'CLOSED') return 'closed'
  if (TERMINAL_NEVER_CLOSED.has(state.closureState) || state.ownershipState === 'DECLINED') {
    return 'never_closed'
  }
  const deadline = state.deadlines.ackDeadlineAt
  const accepted = state.ownershipState === 'ACCEPTED'
  if (
    state.ownershipState === 'OVERDUE' ||
    state.closureState === 'EVIDENCE_LATE' ||
    (deadline != null && observedAt > deadline && !accepted)
  ) {
    return 'overdue'
  }
  return 'open'
}

function stalledStepOf(latencies: Record<LatencyMetricName, LatencyObservation>): WorkflowStep | null {
  const anyStarted = Object.values(latencies).some((row) => row.status !== 'missing')
  if (!anyStarted) return null
  if (latencies.time_to_closed.status === 'completed') return null
  for (const step of WORKFLOW_STEPS) {
    if (latencies[STEP_TO_LATENCY[step]].status === 'open') return step
  }
  for (const step of WORKFLOW_STEPS) {
    if (latencies[STEP_TO_LATENCY[step]].status === 'missing') return step
  }
  return null
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase()
}

function classifyLedgerTask(
  taskId: string,
  rows: readonly LedgerTaskObservation[],
  all: readonly LedgerTaskObservation[],
  now: number,
): TaskClosureRecord {
  const ordered = [...rows].sort((a, b) => a.timestamp - b.timestamp)
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  if (!first || !last) {
    return {
      taskId,
      episodeId: null,
      outcome: 'open',
      elapsedMinutes: 0,
      completionMinutes: null,
      deadlineAt: null,
      lastStatus: 'missing',
    }
  }

  const openedAt = first.timestamp
  const closedRow = ordered.find((row) => CLOSED_LEDGER.has(normalizeStatus(row.status)))
  const deadlineAt = last.deadline ?? first.deadline
  const episodeId = last.episodeId ?? first.episodeId
  const lastStatus = last.status

  if (closedRow) {
    const minutes = minutesBetween(openedAt, closedRow.timestamp)
    return {
      taskId,
      episodeId,
      outcome: 'closed',
      elapsedMinutes: minutes,
      completionMinutes: minutes,
      deadlineAt,
      lastStatus: closedRow.status,
    }
  }

  const elapsedMinutes = minutesBetween(openedAt, now)
  const subsequentOnEpisode =
    episodeId != null &&
    all.some((row) => row.episodeId === episodeId && row.taskId !== taskId && row.timestamp > last.timestamp)

  if (NEVER_CLOSED_LEDGER.has(normalizeStatus(lastStatus)) || subsequentOnEpisode) {
    return {
      taskId,
      episodeId,
      outcome: 'never_closed',
      elapsedMinutes,
      completionMinutes: null,
      deadlineAt,
      lastStatus,
    }
  }

  if (OVERDUE_LEDGER.has(normalizeStatus(lastStatus)) || (deadlineAt != null && now > deadlineAt)) {
    return {
      taskId,
      episodeId,
      outcome: 'overdue',
      elapsedMinutes,
      completionMinutes: null,
      deadlineAt,
      lastStatus,
    }
  }

  return {
    taskId,
    episodeId,
    outcome: 'open',
    elapsedMinutes,
    completionMinutes: null,
    deadlineAt,
    lastStatus,
  }
}

export function computeLedgerTaskOutcomes(
  observations: readonly LedgerTaskObservation[],
  clock: SimulatorClock,
): TaskClosureRecord[] {
  const byTask = new Map<string, LedgerTaskObservation[]>()
  for (const row of observations) {
    const list = byTask.get(row.taskId)
    if (list) list.push(row)
    else byTask.set(row.taskId, [row])
  }

  return [...byTask.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([taskId, rows]) => classifyLedgerTask(taskId, rows, observations, clock.now))
}

export function computeCaseMetrics(input: ComputeCaseInput): CaseMetrics {
  const caseId = input.caseId ?? input.events[0]?.caseId ?? 'unknown'
  const observedAt = input.clock.now
  const { state, acceptedLog } = replayCase(input.events, input.protocol, caseId, input.patientId)
  const { dwells, closedAt } = collectDwells(input.events, input.protocol, caseId, input.patientId, observedAt)

  const origin = firstOfType(acceptedLog, 'ResultAvailable')?.simulatorTime
  const transferRequested = firstOfType(acceptedLog, 'TransferRequested')
  const accepted = acceptedTransfer(state, acceptedLog)

  const timeoutEvents = countType(acceptedLog, 'TransferTimedOut')
  const exceptions = state.exceptionsEmitted.length
  const timeouts = timeoutEvents > 0 ? timeoutEvents : exceptions > 0 ? 1 : 0
  const duplicateAlerts = Math.max(0, exceptions - (timeouts > 0 ? 1 : 0))

  const actionEvidence = firstOfTypes(acceptedLog, ['ActivityEvidenced', 'ActionVisibleDownstream'])
  const review = firstOfType(acceptedLog, 'ClinicalReviewRecorded')
  const plan = firstOfType(acceptedLog, 'PlanRecorded')
  const contact = firstOfType(acceptedLog, 'PatientContactEvidenced')
  const outcome = firstOfType(acceptedLog, 'OutcomeEvidenced')

  const latencies: Record<LatencyMetricName, LatencyObservation> = {
    accepted_owner_latency: observeLatency({
      startedAt: transferRequested?.simulatorTime,
      stoppedAt: accepted?.simulatorTime,
      observedAt,
    }),
    orderer_unaccepted: observeLatency({
      startedAt: origin,
      stoppedAt: accepted?.simulatorTime,
      observedAt,
    }),
    time_to_clinical_review: observeLatency({
      startedAt: origin,
      stoppedAt: review?.simulatorTime,
      observedAt,
    }),
    time_to_plan_recorded: observeLatency({
      startedAt: origin,
      stoppedAt: plan?.simulatorTime,
      observedAt,
    }),
    time_to_patient_contact: observeLatency({
      startedAt: origin,
      stoppedAt: contact?.simulatorTime,
      observedAt,
    }),
    time_to_action_evidence: observeLatency({
      startedAt: origin,
      stoppedAt: actionEvidence?.simulatorTime,
      observedAt,
    }),
    time_to_outcome_evidence: observeLatency({
      startedAt: origin,
      stoppedAt: outcome?.simulatorTime,
      observedAt,
    }),
    time_to_closed: observeLatency({
      startedAt: origin,
      stoppedAt: state.closureState === 'CLOSED' ? closedAt : undefined,
      observedAt,
    }),
  }

  const outcomeKind = classifyCaseOutcome(state, observedAt)
  const originOrNow = origin ?? observedAt
  const closedStop = state.closureState === 'CLOSED' ? closedAt : undefined
  const pathwayTask: TaskClosureRecord = {
    taskId: caseId,
    episodeId: null,
    outcome: outcomeKind,
    elapsedMinutes: minutesBetween(originOrNow, closedStop ?? observedAt),
    completionMinutes: closedStop === undefined ? null : minutesBetween(originOrNow, closedStop),
    deadlineAt: state.deadlines.ackDeadlineAt,
    lastStatus: state.closureState,
  }

  const ledgerTasks = input.ledgerObservations
    ? computeLedgerTaskOutcomes(input.ledgerObservations, input.clock)
    : []

  return {
    caseId,
    patientId: input.patientId,
    protocolId: input.protocol.id,
    observedAt,
    eventCount: input.events.length,
    latencies,
    counts: {
      manualChases: state.manualChases,
      duplicateAlerts,
      timeouts,
      reopens: countType(acceptedLog, 'CaseReopened'),
      exceptions,
    },
    closure: {
      outcome: outcomeKind,
      closureState: state.closureState,
      ownershipState: state.ownershipState,
    },
    stalledStep: stalledStepOf(latencies),
    timeInState: dwells,
    tasks: [...ledgerTasks, pathwayTask],
  }
}
