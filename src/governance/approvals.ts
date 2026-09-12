import type { StaffIdentity } from '@/domain/types'
import type { ApprovalRecord, GovernanceRole } from '@/governance/types'
import type { AuditEntry } from '@/persistence/port'

export type RecordDecisionFailure =
  | 'same-staff-both-roles'
  | 'approver-not-app-side'
  | 'empty-reason'
  | 'empty-staff-id'
  | 'duplicate-approval-id'

export type RecordDecisionResult =
  | { ok: true; record: ApprovalRecord }
  | { ok: false; reason: RecordDecisionFailure }

function otherRole(role: GovernanceRole): GovernanceRole {
  return role === 'clinical-approver' ? 'operational-approver' : 'clinical-approver'
}

function isAppSideStaff(staff: StaffIdentity): boolean {
  return staff.attribution === 'app-side' && typeof staff.id === 'string' && staff.id.length > 0
}

export function latestForRole(
  approvals: readonly ApprovalRecord[],
  role: GovernanceRole,
): ApprovalRecord | undefined {
  let latest: ApprovalRecord | undefined
  for (const row of approvals) {
    if (row.role !== role) continue
    if (!latest || row.recordedAt >= latest.recordedAt) latest = row
  }
  return latest
}

export function approvedForRole(
  approvals: readonly ApprovalRecord[],
  role: GovernanceRole,
  candidateHash: string,
): ApprovalRecord | undefined {
  const latest = latestForRole(approvals, role)
  if (latest?.decision === 'REJECTED') return undefined
  let found: ApprovalRecord | undefined
  for (const row of approvals) {
    if (row.role !== role) continue
    if (row.decision !== 'APPROVED') continue
    if (row.candidateHash !== candidateHash) continue
    if (!isAppSideStaff(row.approver)) continue
    if (!found || row.recordedAt >= found.recordedAt) found = row
  }
  return found
}

export function hasStickyRejection(approvals: readonly ApprovalRecord[]): boolean {
  return (
    latestForRole(approvals, 'clinical-approver')?.decision === 'REJECTED' ||
    latestForRole(approvals, 'operational-approver')?.decision === 'REJECTED'
  )
}

export function recordDecision(
  existing: readonly ApprovalRecord[],
  input: ApprovalRecord,
): RecordDecisionResult {
  if (!isAppSideStaff(input.approver)) {
    return { ok: false, reason: input.approver.id ? 'approver-not-app-side' : 'empty-staff-id' }
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length === 0) {
    return { ok: false, reason: 'empty-reason' }
  }
  if (existing.some((row) => row.approvalId === input.approvalId)) {
    return { ok: false, reason: 'duplicate-approval-id' }
  }
  if (input.decision === 'APPROVED') {
    const conflict = existing.some(
      (row) =>
        row.role === otherRole(input.role) &&
        row.decision === 'APPROVED' &&
        row.approver.id === input.approver.id,
    )
    if (conflict) return { ok: false, reason: 'same-staff-both-roles' }
  }

  const record: ApprovalRecord = {
    approvalId: input.approvalId,
    protocolId: input.protocolId,
    role: input.role,
    approver: input.approver,
    candidateHash: input.candidateHash,
    decision: input.decision,
    reason: input.reason,
    recordedAt: input.recordedAt,
  }
  return { ok: true, record }
}

export function approvalAuditEntry(record: ApprovalRecord, simulatorTime: number): AuditEntry {
  return {
    entryId: record.approvalId,
    caseId: `protocol:${record.protocolId}`,
    recordedAt: record.recordedAt,
    simulatorTime,
    actor: record.approver,
    action: `protocol-decision:${record.decision}`,
    subject: { resourceId: record.protocolId },
    detail: `${record.reason} candidateHash=${record.candidateHash} role=${record.role}`,
  }
}
