export type SiteId =
  | 'gp'
  | 'hospital'
  | 'community'
  | 'pharmacy'
  | 'diagnostics'
  | 'referrals'
  | 'wearables'
  | 'patient'

export type TeamId = SiteId | 'gp-duty'

export type OwnershipState =
  | 'ORDERER_OWNS'
  | 'TRANSFER_REQUESTED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'OVERDUE'
  | 'OWNER_UNAVAILABLE'
  | 'STALE'

export type ClosureState =
  | 'RESULT_AVAILABLE'
  | 'CLINICALLY_REVIEWED'
  | 'PLAN_RECORDED'
  | 'PATIENT_INFORMED'
  | 'ACTION_STARTED'
  | 'OUTCOME_EVIDENCED'
  | 'CLOSED'
  | 'PATIENT_UNREACHED'
  | 'ACTION_NOT_BOOKED'
  | 'ACTION_MISSED'
  | 'PLAN_CHANGED'
  | 'EVIDENCE_LATE'
  | 'REOPENED'

export type SubmissionState =
  | 'NOT_SUBMITTED'
  | 'SUBMITTED'
  | 'VISIBLE_DOWNSTREAM'
  | 'ACCEPTED'
  | 'EVIDENCED'

export interface StaffIdentity {
  id: string
  name: string
  role: string
  teamId: TeamId
  attribution: 'app-side'
}

export interface EvidenceRef {
  site: SiteId | 'clock'
  resourceId: string
  resourceVersion: number
  observedAtSimulatorTime: number
  activityId?: string
  eventType: string
}

export interface SourceClassification {
  rule: 'source-reference-range'
  ruleText: string
  analyteId: string
  analyteName: string
  value: number
  unit: string
  referenceLow: number
  referenceHigh: number
  direction: 'below' | 'above'
}

export interface ProtocolVersion {
  id: string
  supersedes: string | null
  receiverMode: 'NAMED_ACTOR' | 'ACCOUNTABLE_TEAM'
  ackDeadlineMinutes: number
  fallbackTeamId: TeamId
  exceptionRoute: 'duty-clinician-task' | 'orderer-task'
  dedupeWindowMinutes: number
  clinicalPolicyRefs: readonly string[]
  approval: {
    status: 'ACTIVE' | 'DRAFT' | 'TESTING' | 'FAILED_INVARIANTS' | 'PASSED' | 'PROPOSED'
    approvers: string[]
    rollbackTarget: string | null
  }
}

export type DomainEvent =
  | {
      type: 'ResultAvailable'
      resultId: string
      resultVersion: number
      orderingTeamId: TeamId
      requestedReceiver: TeamId
      classification: SourceClassification
    }
  | { type: 'ClinicalReviewRecorded'; actor: StaffIdentity }
  | { type: 'PlanRecorded'; actor: StaffIdentity; planRef: EvidenceRef }
  | { type: 'TransferRequested'; toTeam: TeamId; toActorId?: string; ackDeadlineAt: number }
  | { type: 'TransferAccepted'; actor: StaffIdentity }
  | { type: 'TransferDeclined'; actor: StaffIdentity; reason: string }
  | { type: 'TransferTimedOut' }
  | { type: 'ReceiverUnavailable'; actorId: string }
  | { type: 'FallbackNotified'; toTeam: TeamId; exceptionId: string }
  | { type: 'ManualChase'; byTeam: TeamId }
  | { type: 'PatientMessageSubmitted'; messageId: string }
  | { type: 'PatientContactEvidenced'; evidence: EvidenceRef }
  | { type: 'PatientContactFailed'; messageId: string }
  | { type: 'ActionSubmitted'; actionKind: string; idempotencyKey: string; receipt: EvidenceRef }
  | { type: 'ActionVisibleDownstream'; evidence: EvidenceRef }
  | { type: 'ActivityEvidenced'; evidence: EvidenceRef }
  | { type: 'OutcomeEvidenced'; evidence: EvidenceRef }
  | { type: 'SourceVersionChanged'; newVersion: number }
  | { type: 'CaseReopened'; affectedSteps: ClosureState[] }
  | { type: 'ClockTick'; now: number }

export interface EventEnvelope<E extends DomainEvent = DomainEvent> {
  eventId: string
  caseId: string
  simulatorTime: number
  actor: string
  sourceVersion?: number
  activityId?: string
  event: E
}

export interface CovenantCase {
  caseId: string
  patientId: string
  sourceResultId: string
  sourceResultVersion: number
  sourceClassification: SourceClassification
  orderingTeamId: TeamId
  currentAccountableOwner: { teamId: TeamId; actorId?: string }
  requestedReceiver: TeamId | null
  acceptingActor: StaffIdentity | null
  protocolVersion: string
  ownershipState: OwnershipState
  closureState: ClosureState
  submissionState: SubmissionState
  deadlines: { ackDeadlineAt: number | null }
  evidenceRefs: EvidenceRef[]
  exceptionsEmitted: string[]
  duplicateSuppressed: number
  manualChases: number
  eventLog: EventEnvelope[]
}
