import { approvedForRole, hasStickyRejection } from '@/governance/approvals'
import { hashCandidate } from '@/governance/candidate-hash'
import { validatePlan } from '@/governance/rollout'
import {
  DISABLED_ACTIVATION_REASON,
  type ActivationBlocker,
  type ActivationDecision,
  type GovernanceEvaluationInput,
} from '@/governance/types'
import type { StaffIdentity } from '@/domain/types'
import type { AuditEntry } from '@/persistence/port'

/**
 * Complete set of conditions that must all hold before evaluate() may return
 * permitted: true. Shrinking this list is a product change, not a cleanup.
 */
export const ACTIVATION_REQUIREMENTS = [
  'named-clinical-approver',
  'named-operational-approver',
  'distinct-app-side-approver-identities',
  'no-unsuperseded-rejection',
  'candidate-hash-matches-content',
  'approvals-bound-to-current-candidate-hash',
  'named-rollback-target',
  'valid-controlled-rollout-plan',
  'required-invariants-passing',
] as const

export type ActivationRequirement = (typeof ACTIVATION_REQUIREMENTS)[number]

function named(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function dedupe(blockers: ActivationBlocker[]): ActivationBlocker[] {
  const seen = new Set<ActivationBlocker['code']>()
  const next: ActivationBlocker[] = []
  for (const blocker of blockers) {
    if (seen.has(blocker.code)) continue
    seen.add(blocker.code)
    next.push(blocker)
  }
  return next
}

function refused(blockers: ActivationBlocker[]): ActivationDecision {
  return {
    permitted: false,
    blockers: dedupe(blockers),
    reasonText: DISABLED_ACTIVATION_REASON,
  }
}

export function evaluate(input: GovernanceEvaluationInput): ActivationDecision {
  const blockers: ActivationBlocker[] = []

  if (!input || !input.candidate || typeof input.candidateHash !== 'string') {
    return refused([
      {
        code: 'candidate-changed-since-approval',
        detail: 'Candidate was unevaluable; activation is refused.',
      },
    ])
  }

  const approvals = Array.isArray(input.approvals) ? input.approvals : []
  if (!Array.isArray(input.approvals)) {
    blockers.push({
      code: 'missing-clinical-approver',
      detail: 'Approvals were unevaluable; named clinical approval cannot be confirmed.',
    })
    blockers.push({
      code: 'missing-operational-approver',
      detail: 'Approvals were unevaluable; named operational approval cannot be confirmed.',
    })
  }

  let actualHash: string
  try {
    actualHash = hashCandidate(input.candidate)
  } catch {
    return refused([
      {
        code: 'candidate-changed-since-approval',
        detail: 'Candidate hash could not be computed; activation is refused.',
      },
    ])
  }

  if (actualHash !== input.candidateHash) {
    blockers.push({
      code: 'candidate-changed-since-approval',
      detail: 'The supplied candidate hash does not match the canonical candidate content.',
    })
  }

  const approvedAgainstOtherHash = approvals.some(
    (row) => row.decision === 'APPROVED' && row.candidateHash !== input.candidateHash,
  )
  if (approvedAgainstOtherHash) {
    blockers.push({
      code: 'candidate-changed-since-approval',
      detail: 'An approval was recorded against a different candidate hash; prior approvals are void.',
    })
  }

  if (hasStickyRejection(approvals)) {
    blockers.push({
      code: 'rejected-by-approver',
      detail: 'An approver rejected this candidate; the rejection is sticky until explicitly superseded.',
    })
  }

  const clinical = approvedForRole(approvals, 'clinical-approver', input.candidateHash)
  const operational = approvedForRole(approvals, 'operational-approver', input.candidateHash)
  const sameStaff = Boolean(clinical && operational && clinical.approver.id === operational.approver.id)

  if (!clinical || sameStaff) {
    blockers.push({
      code: 'missing-clinical-approver',
      detail: 'No named app-side clinical approver has approved this exact candidate.',
    })
  }
  if (!operational || sameStaff) {
    blockers.push({
      code: 'missing-operational-approver',
      detail: 'No named app-side operational approver has approved this exact candidate.',
    })
  }

  const candidateTarget = input.candidate.approval?.rollbackTarget ?? null
  const planTarget = input.plan?.rollbackTargetId
  if (!named(candidateTarget) || !named(planTarget) || candidateTarget !== planTarget) {
    blockers.push({
      code: 'no-rollback-target',
      detail: 'A named rollback target is required on the candidate and must match the rollout plan.',
    })
  }

  const plan = input.plan
  const planValid =
    plan != null &&
    validatePlan(plan).ok &&
    (plan.status === 'READY' || plan.status === 'IN_PROGRESS') &&
    plan.protocolId === input.candidate.id
  if (!planValid) {
    blockers.push({
      code: 'no-rollout-plan',
      detail: 'A valid controlled rollout plan with ordered stages is required.',
    })
  }

  if (!Array.isArray(input.failingInvariantIds) || input.failingInvariantIds.length > 0) {
    blockers.push({
      code: 'invariants-failing',
      detail: 'Required invariants are failing or were unevaluable; activation stays refused.',
    })
  }

  const unique = dedupe(blockers)
  if (unique.length > 0) return refused(unique)
  return { permitted: true, blockers: [], reasonText: '' }
}

export function activationAuditEntry(
  decision: ActivationDecision,
  input: {
    entryId: string
    protocolId: string
    candidateHash: string
    actor: StaffIdentity | { kind: 'system'; name: string }
    recordedAt: number
    simulatorTime: number
  },
): AuditEntry {
  return {
    entryId: input.entryId,
    caseId: `protocol:${input.protocolId}`,
    recordedAt: input.recordedAt,
    simulatorTime: input.simulatorTime,
    actor: input.actor,
    action: decision.permitted ? 'protocol-activation-permitted' : 'protocol-activation-refused',
    subject: { resourceId: input.protocolId },
    detail: `${decision.reasonText} candidateHash=${input.candidateHash}`,
  }
}
