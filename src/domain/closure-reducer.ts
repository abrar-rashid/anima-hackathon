import type { ClosureState, CovenantCase, DomainEvent, EventEnvelope } from '@/domain/types'

const CLOSURE_RANK: Record<ClosureState, number> = {
  RESULT_AVAILABLE: 0,
  REOPENED: 0,
  CLINICALLY_REVIEWED: 1,
  PLAN_RECORDED: 2,
  PLAN_CHANGED: 2,
  PATIENT_INFORMED: 3,
  PATIENT_UNREACHED: 3,
  ACTION_STARTED: 4,
  ACTION_NOT_BOOKED: 4,
  ACTION_MISSED: 4,
  OUTCOME_EVIDENCED: 5,
  EVIDENCE_LATE: 5,
  CLOSED: 6,
}

const REVIEW_CLAIMING: ReadonlySet<ClosureState> = new Set([
  'CLINICALLY_REVIEWED',
  'PLAN_RECORDED',
  'PATIENT_INFORMED',
  'ACTION_STARTED',
  'OUTCOME_EVIDENCED',
  'CLOSED',
])

function closureTarget(event: DomainEvent): { rank: number; minFrom: number } | null {
  switch (event.type) {
    case 'ClinicalReviewRecorded':
      return { rank: 1, minFrom: 0 }
    case 'PlanRecorded':
      return { rank: 2, minFrom: 1 }
    case 'PatientContactEvidenced':
    case 'PatientContactFailed':
      return { rank: 3, minFrom: 2 }
    case 'ActivityEvidenced':
      return { rank: 4, minFrom: 3 }
    case 'OutcomeEvidenced':
      return { rank: 5, minFrom: 0 }
    default:
      return null
  }
}

export function isBackwardClosure(state: CovenantCase, event: DomainEvent): boolean {
  const target = closureTarget(event)
  if (!target) return false
  return target.rank < CLOSURE_RANK[state.closureState]
}

export function isSkippedClosure(state: CovenantCase, event: DomainEvent): boolean {
  const target = closureTarget(event)
  if (!target) return false
  const current = CLOSURE_RANK[state.closureState]
  if (target.rank <= current) return false
  return current < target.minFrom
}

function lastReopenTime(state: CovenantCase): number | null {
  for (let i = state.eventLog.length - 1; i >= 0; i -= 1) {
    const envelope = state.eventLog[i]
    if (envelope?.event.type === 'CaseReopened') return envelope.simulatorTime
  }
  return null
}

function hasEventType(
  state: CovenantCase,
  type: DomainEvent['type'],
  versionSensitive: boolean,
): boolean {
  const reopenAt = lastReopenTime(state)
  return state.eventLog.some((envelope) => {
    if (envelope.event.type !== type) return false
    if (!versionSensitive) return true
    if (reopenAt != null) return envelope.simulatorTime > reopenAt
    return envelope.sourceVersion == null || envelope.sourceVersion === state.sourceResultVersion
  })
}

export function hasRequiredClosureEvidence(state: CovenantCase): boolean {
  return (
    hasEventType(state, 'ClinicalReviewRecorded', true) &&
    hasEventType(state, 'PlanRecorded', true) &&
    hasEventType(state, 'PatientContactEvidenced', false) &&
    hasEventType(state, 'ActionVisibleDownstream', false) &&
    hasEventType(state, 'OutcomeEvidenced', false)
  )
}

export function claimsClinicalReview(state: ClosureState): boolean {
  return REVIEW_CLAIMING.has(state)
}

export function reduceClosure(
  state: CovenantCase,
  envelope: EventEnvelope,
): { ok: true; state: CovenantCase } | { ok: false; reason: string } {
  const event = envelope.event
  switch (event.type) {
    case 'ResultAvailable': {
      const prior = state.eventLog.filter((item) => item.event.type === 'ResultAvailable').length
      if (prior > 1) return { ok: true, state }
      return { ok: true, state: { ...state, closureState: 'RESULT_AVAILABLE' } }
    }
    case 'ClinicalReviewRecorded':
      return { ok: true, state: { ...state, closureState: 'CLINICALLY_REVIEWED' } }
    case 'PlanRecorded':
      return { ok: true, state: { ...state, closureState: 'PLAN_RECORDED' } }
    case 'PatientContactEvidenced':
      return { ok: true, state: { ...state, closureState: 'PATIENT_INFORMED' } }
    case 'PatientContactFailed':
      return { ok: true, state: { ...state, closureState: 'PATIENT_UNREACHED' } }
    case 'ActivityEvidenced':
      return { ok: true, state: { ...state, closureState: 'ACTION_STARTED' } }
    case 'OutcomeEvidenced': {
      const evidenced: CovenantCase = { ...state, closureState: 'OUTCOME_EVIDENCED' }
      if (hasRequiredClosureEvidence(evidenced)) {
        return { ok: true, state: { ...evidenced, closureState: 'CLOSED' } }
      }
      return { ok: true, state: evidenced }
    }
    case 'CaseReopened':
      return {
        ok: true,
        state: {
          ...state,
          closureState: 'REOPENED',
          evidenceRefs: state.evidenceRefs.filter(
            (ref) => ref.eventType !== 'ClinicalReviewRecorded' && ref.eventType !== 'PlanRecorded',
          ),
        },
      }
    default:
      return { ok: true, state }
  }
}
