import type { ProtocolVersion, StaffIdentity } from '@/domain/types'
import type { AuditEntry, AuditLogRepository, ProtocolRepository } from '@/persistence/port'

export interface RollbackProof {
  targetId: string
  protocol: ProtocolVersion
  verifiedAt: number
  reachable: true
}

export type ProveRollbackResult =
  | { ok: true; proof: RollbackProof }
  | { ok: false; reason: 'target-unspecified' | 'target-unreachable' }

export function proofSatisfiesCandidate(
  proof: RollbackProof | null | undefined,
  candidate: ProtocolVersion,
): boolean {
  if (!proof || proof.reachable !== true) return false
  if (proof.targetId !== candidate.approval.rollbackTarget) return false
  return proof.protocol.id === proof.targetId
}

export async function proveRollbackTarget(
  repo: ProtocolRepository,
  targetId: string | null,
  verifiedAt: number,
): Promise<ProveRollbackResult> {
  if (typeof targetId !== 'string' || targetId.length === 0) {
    return { ok: false, reason: 'target-unspecified' }
  }
  const protocol = await repo.get(targetId)
  if (!protocol) {
    return { ok: false, reason: 'target-unreachable' }
  }
  return {
    ok: true,
    proof: { targetId, protocol, verifiedAt, reachable: true },
  }
}

export function rollbackAuditEntry(input: {
  entryId: string
  protocolId: string
  targetId: string
  candidateHash: string
  actor: StaffIdentity
  reason: string
  recordedAt: number
  simulatorTime: number
}): AuditEntry {
  return {
    entryId: input.entryId,
    caseId: `protocol:${input.protocolId}`,
    recordedAt: input.recordedAt,
    simulatorTime: input.simulatorTime,
    actor: input.actor,
    action: 'protocol-rollback',
    subject: { resourceId: input.targetId },
    detail: `${input.reason} candidateHash=${input.candidateHash} restored=${input.targetId}`,
  }
}

export async function rollbackToTarget(
  repos: { protocols: ProtocolRepository; audit: AuditLogRepository },
  input: {
    candidate: ProtocolVersion
    candidateHash: string
    proof: RollbackProof
    actor: StaffIdentity
    reason: string
    recordedAt: number
    simulatorTime: number
    entryId: string
  },
): Promise<
  | { ok: true; restored: ProtocolVersion; entry: AuditEntry }
  | { ok: false; reason: 'rollback-proof-mismatch' | 'target-unreachable' }
> {
  if (!proofSatisfiesCandidate(input.proof, input.candidate)) {
    return { ok: false, reason: 'rollback-proof-mismatch' }
  }
  const current = await repos.protocols.get(input.proof.targetId)
  if (!current || current.id !== input.proof.protocol.id) {
    return { ok: false, reason: 'target-unreachable' }
  }
  await repos.protocols.put(current)
  const entry = rollbackAuditEntry({
    entryId: input.entryId,
    protocolId: input.candidate.id,
    targetId: current.id,
    candidateHash: input.candidateHash,
    actor: input.actor,
    reason: input.reason,
    recordedAt: input.recordedAt,
    simulatorTime: input.simulatorTime,
  })
  await repos.audit.append(entry)
  return { ok: true, restored: current, entry }
}
