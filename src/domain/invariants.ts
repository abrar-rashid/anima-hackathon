import { hasRequiredClosureEvidence, claimsClinicalReview } from '@/domain/closure-reducer'
import { initialCase, reduce } from '@/domain/case-reducer'
import type { CovenantCase, ProtocolVersion, SourceClassification } from '@/domain/types'

export interface InvariantResult {
  id: number
  name: string
  passed: boolean
  detail: string
}

function classificationKey(c: SourceClassification): string {
  return [c.rule, c.analyteId, c.analyteName, c.value, c.unit, c.referenceLow, c.referenceHigh, c.direction].join('|')
}

function ownerTeamPresent(state: CovenantCase): boolean {
  return typeof state.currentAccountableOwner.teamId === 'string' && state.currentAccountableOwner.teamId.length > 0
}

function replayProtocol(state: CovenantCase, protocol?: ProtocolVersion): ProtocolVersion {
  return (
    protocol ?? {
      id: state.protocolVersion || 'unknown',
      supersedes: null,
      receiverMode: 'ACCOUNTABLE_TEAM',
      ackDeadlineMinutes: 1,
      fallbackTeamId: state.currentAccountableOwner.teamId || state.orderingTeamId || 'gp',
      exceptionRoute: 'duty-clinician-task',
      dedupeWindowMinutes: 1,
      clinicalPolicyRefs: [],
      approval: { status: 'DRAFT', approvers: [], rollbackTarget: null },
    }
  )
}

function ownerNonEmptyAtEveryLogPoint(state: CovenantCase, protocol?: ProtocolVersion): boolean {
  if (!ownerTeamPresent(state)) return false
  const proto = replayProtocol(state, protocol)
  let cursor = initialCase({ caseId: state.caseId, patientId: state.patientId, protocol: proto })
  if (!ownerTeamPresent(cursor)) return false
  for (const envelope of state.eventLog) {
    const result = reduce(cursor, envelope, proto)
    cursor = result.state
    if (!ownerTeamPresent(cursor)) return false
  }
  return true
}

function lastReopenTime(state: CovenantCase): number | null {
  for (let i = state.eventLog.length - 1; i >= 0; i -= 1) {
    const envelope = state.eventLog[i]
    if (envelope?.event.type === 'CaseReopened') return envelope.simulatorTime
  }
  return null
}

export function evaluateInvariants(
  state: CovenantCase,
  baseline?: CovenantCase,
  protocol?: ProtocolVersion,
): InvariantResult[] {
  const classificationPresent =
    state.sourceClassification.rule === 'source-reference-range' &&
    state.sourceClassification.analyteId.length > 0 &&
    state.sourceClassification.analyteName.length > 0 &&
    state.sourceClassification.ruleText.length > 0

  const acceptedOk =
    state.ownershipState !== 'ACCEPTED' ||
    (!!state.currentAccountableOwner.actorId &&
      state.currentAccountableOwner.teamId === state.requestedReceiver)

  const reopenAt = lastReopenTime(state)
  const reviewEvent = [...state.eventLog].reverse().find((envelope) => {
    if (envelope.event.type !== 'ClinicalReviewRecorded') return false
    return reopenAt == null || envelope.simulatorTime > reopenAt
  })
  const humanReview =
    reviewEvent?.event.type === 'ClinicalReviewRecorded' &&
    reviewEvent.event.actor.id.length > 0 &&
    reviewEvent.event.actor.attribution === 'app-side'
  const reviewOk = !claimsClinicalReview(state.closureState) || humanReview

  const resultClassifications = state.eventLog
    .filter((envelope) => envelope.event.type === 'ResultAvailable')
    .map((envelope) => (envelope.event.type === 'ResultAvailable' ? envelope.event.classification : null))
    .filter((value): value is SourceClassification => value != null)
  const classificationUnchanged =
    resultClassifications.length === 0 ||
    resultClassifications.every((item) => classificationKey(item) === classificationKey(state.sourceClassification))

  const informedStates = new Set(['PATIENT_INFORMED', 'ACTION_STARTED', 'OUTCOME_EVIDENCED', 'CLOSED'])
  const informedOk =
    !informedStates.has(state.closureState) ||
    state.eventLog.some((envelope) => envelope.event.type === 'PatientContactEvidenced')

  const closedOk = state.closureState !== 'CLOSED' || hasRequiredClosureEvidence(state)

  const actionKeys = state.eventLog
    .filter((envelope) => envelope.event.type === 'ActionSubmitted')
    .map((envelope) => (envelope.event.type === 'ActionSubmitted' ? envelope.event.idempotencyKey : ''))
  const uniqueActions = new Set(actionKeys).size === actionKeys.length

  const unavailableOk = state.ownershipState !== 'OWNER_UNAVAILABLE' || ownerTeamPresent(state)

  const baselineOk = !baseline
    ? true
    : state.manualChases <= baseline.manualChases &&
      state.exceptionsEmitted.length <= baseline.exceptionsEmitted.length &&
      state.duplicateSuppressed <= baseline.duplicateSuppressed

  const reopens = state.eventLog.filter((envelope) => envelope.event.type === 'CaseReopened')
  const reopenOnlyReviewPlan = reopens.every((envelope) => {
    if (envelope.event.type !== 'CaseReopened') return false
    const steps = envelope.event.affectedSteps
    return (
      steps.length === 2 &&
      steps[0] === 'CLINICALLY_REVIEWED' &&
      steps[1] === 'PLAN_RECORDED'
    )
  })
  const hadContact = state.eventLog.some((envelope) => envelope.event.type === 'PatientContactEvidenced')
  const hadAction = state.eventLog.some((envelope) => envelope.event.type === 'ActionVisibleDownstream')
  const contactKept =
    !reopens.length ||
    !hadContact ||
    state.evidenceRefs.some((ref) => ref.eventType === 'PatientContactEvidenced')
  const actionKept =
    !reopens.length ||
    !hadAction ||
    state.evidenceRefs.some((ref) => ref.eventType === 'ActionVisibleDownstream')
  const reopenOk = reopenOnlyReviewPlan && contactKept && actionKept

  const approvalOk = !protocol
    ? false
    : protocol.approval.status !== 'ACTIVE' ||
      (protocol.approval.approvers.length > 0 &&
        protocol.approval.rollbackTarget != null &&
        protocol.approval.rollbackTarget.length > 0)

  const ownerEveryPoint = ownerNonEmptyAtEveryLogPoint(state, protocol)

  return [
    {
      id: 1,
      name: 'source-classification-present',
      passed: classificationPresent,
      detail: classificationPresent
        ? 'Source classification is present from the laboratory rule.'
        : 'Source classification is missing or incomplete.',
    },
    {
      id: 2,
      name: 'owner-team-non-empty-at-every-log-point',
      passed: ownerEveryPoint,
      detail: ownerEveryPoint
        ? 'Accountable owner team is present at every log point.'
        : 'An owner team was blank at the current state or a replayed log point.',
    },
    {
      id: 3,
      name: 'accepted-owner-has-actor-on-receiver-team',
      passed: acceptedOk,
      detail: acceptedOk
        ? 'Accepted owner is a named actor on the requested receiver team, or the case is not accepted.'
        : 'Accepted owner is missing actorId or is not the requested receiver team.',
    },
    {
      id: 4,
      name: 'clinically-reviewed-after-human-review',
      passed: reviewOk,
      detail: reviewOk
        ? 'Clinical review state is backed by a human ClinicalReviewRecorded event.'
        : 'CLINICALLY_REVIEWED (or later) lacks a human ClinicalReviewRecorded event.',
    },
    {
      id: 5,
      name: 'classification-unchanged-across-log',
      passed: classificationUnchanged,
      detail: classificationUnchanged
        ? 'Source classification is unchanged across the log.'
        : 'A ResultAvailable event changed the source classification.',
    },
    {
      id: 6,
      name: 'patient-informed-only-with-contact-evidence',
      passed: informedOk,
      detail: informedOk
        ? 'PATIENT_INFORMED is backed by PatientContactEvidenced, or is not claimed.'
        : 'PATIENT_INFORMED (or later) has no PatientContactEvidenced event.',
    },
    {
      id: 7,
      name: 'closed-only-with-full-evidence',
      passed: closedOk,
      detail: closedOk
        ? 'CLOSED is backed by review, plan, contact, action and outcome evidence, or is not claimed.'
        : 'CLOSED is missing required evidence for the current source version.',
    },
    {
      id: 8,
      name: 'no-duplicate-action-submitted-keys',
      passed: uniqueActions,
      detail: uniqueActions
        ? 'ActionSubmitted idempotency keys are unique.'
        : 'Two ActionSubmitted events share an idempotency key.',
    },
    {
      id: 9,
      name: 'owner-unavailable-never-blanked',
      passed: unavailableOk,
      detail: unavailableOk
        ? 'OWNER_UNAVAILABLE keeps a non-empty owner team, or the case is not in that state.'
        : 'OWNER_UNAVAILABLE blanked the accountable owner team.',
    },
    {
      id: 10,
      name: 'candidate-not-worse-than-baseline',
      passed: baselineOk,
      detail: baseline
        ? baselineOk
          ? 'manualChases, exceptionsEmitted and duplicateSuppressed are not worse than baseline.'
          : 'Candidate worsens manualChases, exceptionsEmitted.length or duplicateSuppressed versus baseline.'
        : 'No baseline provided; comparison skipped.',
    },
    {
      id: 11,
      name: 'reopen-affected-only-review-and-plan',
      passed: reopenOk,
      detail: reopenOk
        ? 'CaseReopened affects only CLINICALLY_REVIEWED and PLAN_RECORDED.'
        : 'A CaseReopened event affected steps beyond review and plan.',
    },
    {
      id: 12,
      name: 'active-protocol-requires-approvers-and-rollback',
      passed: approvalOk,
      detail: protocol
        ? approvalOk
          ? 'Protocol is not ACTIVE, or ACTIVE with named approvers and a rollback target.'
          : 'ACTIVE protocol is missing named approvers or a rollback target.'
        : 'Protocol was not supplied and the approval gate therefore could not be evaluated.',
    },
  ]
}
