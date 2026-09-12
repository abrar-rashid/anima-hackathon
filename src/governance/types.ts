/**
 * Protocol governance. Today the deploy control is disabled with a verbatim reason:
 *
 *   Production activation requires named clinical and operational approvers,
 *   controlled rollout and a rollback target.
 *
 * These types exist to make that sentence real. Activation must remain impossible
 * until every clause it names is actually satisfied.
 */
import type { ProtocolVersion, StaffIdentity } from '@/domain/types'

export type GovernanceRole = 'clinical-approver' | 'operational-approver'

export type PlatformRole =
  | 'ordering-clinician'
  | 'receiving-clinician'
  | 'duty-team'
  | 'governance-approver'
  | 'observer'

export interface ApprovalRecord {
  approvalId: string
  protocolId: string
  role: GovernanceRole
  approver: StaffIdentity
  /** Hash of the exact candidate protocol approved, so approval binds to content. */
  candidateHash: string
  decision: 'APPROVED' | 'REJECTED'
  reason: string
  recordedAt: number
}

export interface RolloutStage {
  stageId: string
  /** Which teams the candidate applies to at this stage. */
  teamIds: string[]
  /** Simulator minutes to hold this stage before the next may begin. */
  holdMinutes: number
  /** Invariants that must still pass to advance. Empty is not allowed. */
  requiredInvariantIds: number[]
}

export interface RolloutPlan {
  planId: string
  protocolId: string
  rollbackTargetId: string
  stages: RolloutStage[]
  currentStageId: string | null
  status: 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'HELD' | 'ROLLED_BACK' | 'COMPLETE'
}

/** Why activation is refused. An empty list is the only thing that permits activation. */
export interface ActivationBlocker {
  code:
    | 'missing-clinical-approver'
    | 'missing-operational-approver'
    | 'candidate-changed-since-approval'
    | 'no-rollback-target'
    | 'no-rollout-plan'
    | 'invariants-failing'
    | 'rejected-by-approver'
  detail: string
}

export interface ActivationDecision {
  permitted: boolean
  blockers: ActivationBlocker[]
  /** Verbatim reason surfaced to the UI when not permitted. */
  reasonText: string
}

export interface GovernanceEvaluationInput {
  candidate: ProtocolVersion
  candidateHash: string
  approvals: ApprovalRecord[]
  plan: RolloutPlan | null
  failingInvariantIds: number[]
}

export const DISABLED_ACTIVATION_REASON =
  'Production activation requires named clinical and operational approvers, controlled rollout and a rollback target.'
