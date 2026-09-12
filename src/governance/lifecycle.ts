import { validatePatch } from '@/domain/patch-grammar'
import type { ProtocolVersion, StaffIdentity } from '@/domain/types'
import { approvedForRole } from '@/governance/approvals'
import { hashCandidate } from '@/governance/candidate-hash'
import type { ActivationDecision, ApprovalRecord } from '@/governance/types'
import { proofSatisfiesCandidate, type RollbackProof } from '@/governance/rollback'
import type { AuditEntry } from '@/persistence/port'

export type LifecycleStatus = ProtocolVersion['approval']['status']

export type TransitionFailure = 'illegal-transition' | 'activation-not-permitted' | 'rollback-proof-missing'

export interface TransitionContext {
  decision?: ActivationDecision
  proof?: RollbackProof | null
  now?: number
  approvals?: readonly ApprovalRecord[]
}

const ALLOWED: Record<LifecycleStatus, readonly LifecycleStatus[]> = {
  DRAFT: ['TESTING'],
  TESTING: ['FAILED_INVARIANTS', 'PASSED'],
  FAILED_INVARIANTS: [],
  PASSED: ['PROPOSED'],
  PROPOSED: ['ACTIVE'],
  ACTIVE: [],
}

export function draftFromPatch(
  base: ProtocolVersion,
  diff: Record<string, unknown>,
):
  | { ok: true; candidate: ProtocolVersion }
  | { ok: false; reason: 'clinical-meaning-not-patchable'; rejectedFields: string[] } {
  const result = validatePatch(base, diff)
  if (!result.ok) {
    return { ok: false, reason: 'clinical-meaning-not-patchable', rejectedFields: result.rejectedFields }
  }
  return { ok: true, candidate: result.candidate }
}

function namedApprovers(candidate: ProtocolVersion, approvals: readonly ApprovalRecord[] | undefined): string[] {
  if (!approvals) return []
  const hash = hashCandidate(candidate)
  const clinical = approvedForRole(approvals, 'clinical-approver', hash)
  const operational = approvedForRole(approvals, 'operational-approver', hash)
  const ids: string[] = []
  if (clinical) ids.push(clinical.approver.id)
  if (operational) ids.push(operational.approver.id)
  return ids
}

export function transition(
  candidate: ProtocolVersion,
  to: LifecycleStatus,
  context: TransitionContext = {},
): { ok: true; candidate: ProtocolVersion } | { ok: false; reason: TransitionFailure } {
  const from = candidate.approval.status
  const allowed = ALLOWED[from] ?? []
  if (!allowed.includes(to)) {
    return { ok: false, reason: 'illegal-transition' }
  }

  if (to === 'ACTIVE') {
    if (!context.decision?.permitted) {
      return { ok: false, reason: 'activation-not-permitted' }
    }
    if (!proofSatisfiesCandidate(context.proof, candidate)) {
      return { ok: false, reason: 'rollback-proof-missing' }
    }
    const approvers = namedApprovers(candidate, context.approvals)
    return {
      ok: true,
      candidate: {
        ...candidate,
        approval: {
          ...candidate.approval,
          status: 'ACTIVE',
          approvers,
          rollbackTarget: candidate.approval.rollbackTarget,
        },
      },
    }
  }

  return {
    ok: true,
    candidate: {
      ...candidate,
      approval: { ...candidate.approval, status: to },
    },
  }
}

export function lifecycleAuditEntry(input: {
  candidate: ProtocolVersion
  candidateHash: string
  from: LifecycleStatus
  to: LifecycleStatus
  actor: StaffIdentity
  reason: string
  recordedAt: number
  simulatorTime: number
  entryId: string
}): AuditEntry {
  return {
    entryId: input.entryId,
    caseId: `protocol:${input.candidate.id}`,
    recordedAt: input.recordedAt,
    simulatorTime: input.simulatorTime,
    actor: input.actor,
    action: `protocol-lifecycle:${input.from}->${input.to}`,
    subject: { resourceId: input.candidate.id },
    detail: `${input.reason} candidateHash=${input.candidateHash}`,
  }
}
