/**
 * Explicit metric definitions for the workflow-latency engine.
 *
 * A latency number whose start and stop events are implicit is a number nobody
 * can reproduce. The UI must render `displaySentence` next to every figure.
 *
 * These definitions measure elapsed simulator time and state transitions only.
 * They do not score risk, rank acuity, or infer that a delay caused harm.
 *
 * Ledger observations use a structural shape so a later tasks-ledger adapter
 * can map into this engine. This module does not import `src/tasks`.
 */

export const SMALL_N_THRESHOLD = 10

export const METRIC_UNIT = {
  minutes: 'minutes',
  count: 'count',
} as const

export type MetricUnit = (typeof METRIC_UNIT)[keyof typeof METRIC_UNIT]

export type LatencyMetricName =
  | 'accepted_owner_latency'
  | 'orderer_unaccepted'
  | 'time_to_clinical_review'
  | 'time_to_plan_recorded'
  | 'time_to_patient_contact'
  | 'time_to_action_evidence'
  | 'time_to_outcome_evidence'
  | 'time_to_closed'

export type CountMetricName =
  | 'timeouts'
  | 'exceptions'
  | 'duplicate_alerts'
  | 'manual_chases'
  | 'reopens'

export type WorkflowStep =
  | 'clinical_review'
  | 'plan_recorded'
  | 'accepted_owner'
  | 'patient_contact'
  | 'action_evidence'
  | 'outcome_evidence'
  | 'closed'

export type ClosureOutcome = 'closed' | 'open' | 'overdue' | 'never_closed'

export type StateTrack = 'ownership' | 'closure' | 'submission'

export interface SimulatorClock {
  /** Simulator time in milliseconds. Never wall-clock `Date.now()`. */
  now: number
}

export interface Denominator {
  cases: number
  events: number
  traces: number
}

/**
 * Structural ledger row. Another worker owns `src/tasks/types.ts`; adapt there
 * later. Nullable clinical fields stay nullable — never fabricate SNOMED,
 * sample, or clinician-level identity.
 */
export interface LedgerTaskObservation {
  episodeId: string | null
  timestamp: number
  taskId: string
  status: string
  owner: string | null
  deadline: number | null
}

export interface LatencyMetricDefinition {
  readonly kind: 'latency'
  readonly name: LatencyMetricName
  readonly startEvents: readonly string[]
  readonly stopEvents: readonly string[]
  readonly unit: 'minutes'
  readonly displaySentence: string
  readonly censoring: 'right-censor-open'
}

export interface CountMetricDefinition {
  readonly kind: 'count'
  readonly name: CountMetricName
  readonly countedEvents: readonly string[]
  readonly unit: 'count'
  readonly displaySentence: string
}

export interface DwellMetricDefinition {
  readonly kind: 'dwell'
  readonly name: 'time_in_state'
  readonly startEvents: readonly ['state-enter']
  readonly stopEvents: readonly ['state-exit']
  readonly unit: 'minutes'
  readonly displaySentence: string
  readonly censoring: 'right-censor-open'
}

export const LATENCY_METRIC_DEFINITIONS: readonly LatencyMetricDefinition[] = [
  {
    kind: 'latency',
    name: 'accepted_owner_latency',
    startEvents: ['TransferRequested'],
    stopEvents: ['TransferAccepted'],
    unit: 'minutes',
    censoring: 'right-censor-open',
    displaySentence:
      'Minutes from the transfer request to a recorded acceptance. If nobody has accepted yet, this is elapsed time and the handover is still open.',
  },
  {
    kind: 'latency',
    name: 'orderer_unaccepted',
    startEvents: ['ResultAvailable'],
    stopEvents: ['TransferAccepted'],
    unit: 'minutes',
    censoring: 'right-censor-open',
    displaySentence:
      'Minutes the ordering team stayed accountable before a receiver accepted. If acceptance has not been recorded, this is elapsed time and is not a completed interval.',
  },
  {
    kind: 'latency',
    name: 'time_to_clinical_review',
    startEvents: ['ResultAvailable'],
    stopEvents: ['ClinicalReviewRecorded'],
    unit: 'minutes',
    censoring: 'right-censor-open',
    displaySentence:
      'Minutes from the result becoming available to a recorded clinical review.',
  },
  {
    kind: 'latency',
    name: 'time_to_plan_recorded',
    startEvents: ['ResultAvailable'],
    stopEvents: ['PlanRecorded'],
    unit: 'minutes',
    censoring: 'right-censor-open',
    displaySentence: 'Minutes from the result becoming available to a recorded plan.',
  },
  {
    kind: 'latency',
    name: 'time_to_patient_contact',
    startEvents: ['ResultAvailable'],
    stopEvents: ['PatientContactEvidenced'],
    unit: 'minutes',
    censoring: 'right-censor-open',
    displaySentence:
      'Minutes from the result becoming available to evidenced patient contact. A submitted message alone does not stop this clock.',
  },
  {
    kind: 'latency',
    name: 'time_to_action_evidence',
    startEvents: ['ResultAvailable'],
    stopEvents: ['ActivityEvidenced', 'ActionVisibleDownstream'],
    unit: 'minutes',
    censoring: 'right-censor-open',
    displaySentence:
      'Minutes from the result becoming available to action evidence — an activity record, or downstream visibility if no activity record exists.',
  },
  {
    kind: 'latency',
    name: 'time_to_outcome_evidence',
    startEvents: ['ResultAvailable'],
    stopEvents: ['OutcomeEvidenced'],
    unit: 'minutes',
    censoring: 'right-censor-open',
    displaySentence: 'Minutes from the result becoming available to recorded outcome evidence.',
  },
  {
    kind: 'latency',
    name: 'time_to_closed',
    startEvents: ['ResultAvailable'],
    stopEvents: ['OutcomeEvidenced'],
    unit: 'minutes',
    censoring: 'right-censor-open',
    displaySentence:
      'Minutes from the result becoming available to the pathway reaching CLOSED with the required evidence. An open pathway has elapsed time, not a completion latency. CLOSED is a derived state, not a free-standing event.',
  },
]

export const COUNT_METRIC_DEFINITIONS: readonly CountMetricDefinition[] = [
  {
    kind: 'count',
    name: 'timeouts',
    countedEvents: ['TransferTimedOut'],
    unit: 'count',
    displaySentence: 'Count of recorded acknowledgement timeouts on the case.',
  },
  {
    kind: 'count',
    name: 'exceptions',
    countedEvents: ['FallbackNotified'],
    unit: 'count',
    displaySentence: 'Count of exception notifications emitted while a transfer was outstanding.',
  },
  {
    kind: 'count',
    name: 'duplicate_alerts',
    countedEvents: ['FallbackNotified'],
    unit: 'count',
    displaySentence:
      'Count of exception notifications after the first timeout exception on the same outstanding transfer.',
  },
  {
    kind: 'count',
    name: 'manual_chases',
    countedEvents: ['ManualChase'],
    unit: 'count',
    displaySentence: 'Count of recorded manual chase events on the case.',
  },
  {
    kind: 'count',
    name: 'reopens',
    countedEvents: ['CaseReopened'],
    unit: 'count',
    displaySentence: 'Count of recorded case-reopen events after a source version change.',
  },
]

export const TIME_IN_STATE_DEFINITION: DwellMetricDefinition = {
  kind: 'dwell',
  name: 'time_in_state',
  startEvents: ['state-enter'],
  stopEvents: ['state-exit'],
  unit: 'minutes',
  censoring: 'right-censor-open',
  displaySentence:
    'Minutes spent in each ownership, closure, or submission state, measured between the events that entered and left that state. The current state is still open and uses elapsed time to the observation clock.',
}

export const METRIC_DEFINITIONS: readonly (
  | LatencyMetricDefinition
  | CountMetricDefinition
  | DwellMetricDefinition
)[] = [...LATENCY_METRIC_DEFINITIONS, ...COUNT_METRIC_DEFINITIONS, TIME_IN_STATE_DEFINITION]

export const WORKFLOW_STEPS: readonly WorkflowStep[] = [
  'clinical_review',
  'plan_recorded',
  'accepted_owner',
  'patient_contact',
  'action_evidence',
  'outcome_evidence',
  'closed',
]

export const STEP_TO_LATENCY: Record<WorkflowStep, LatencyMetricName> = {
  clinical_review: 'time_to_clinical_review',
  plan_recorded: 'time_to_plan_recorded',
  accepted_owner: 'accepted_owner_latency',
  patient_contact: 'time_to_patient_contact',
  action_evidence: 'time_to_action_evidence',
  outcome_evidence: 'time_to_outcome_evidence',
  closed: 'time_to_closed',
}

export const LATENCY_DEFINITION_BY_NAME: Record<LatencyMetricName, LatencyMetricDefinition> =
  Object.fromEntries(LATENCY_METRIC_DEFINITIONS.map((row) => [row.name, row])) as Record<
    LatencyMetricName,
    LatencyMetricDefinition
  >
