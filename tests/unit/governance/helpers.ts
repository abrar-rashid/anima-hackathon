import type { ApprovalRecord, RolloutPlan } from '@/governance/types'
import type { ProtocolVersion, StaffIdentity } from '@/domain/types'
import type { AuditEntry, AuditLogRepository, ProtocolRepository } from '@/persistence/port'

export const NOW = 1_789_286_400_000

export const v3: ProtocolVersion = {
  id: 'v3',
  supersedes: 'v2',
  receiverMode: 'NAMED_ACTOR',
  ackDeadlineMinutes: 120,
  fallbackTeamId: 'hospital',
  exceptionRoute: 'orderer-task',
  dedupeWindowMinutes: 0,
  clinicalPolicyRefs: ['local-abnormal-result-policy-2026'],
  approval: { status: 'ACTIVE', approvers: ['seed'], rollbackTarget: 'v2' },
}

export const v4: ProtocolVersion = {
  id: 'v4',
  supersedes: 'v3',
  receiverMode: 'ACCOUNTABLE_TEAM',
  ackDeadlineMinutes: 30,
  fallbackTeamId: 'gp-duty',
  exceptionRoute: 'duty-clinician-task',
  dedupeWindowMinutes: 60,
  clinicalPolicyRefs: ['local-abnormal-result-policy-2026'],
  approval: { status: 'DRAFT', approvers: [], rollbackTarget: 'v3' },
}

export const clinicalStaff: StaffIdentity = {
  id: 'staff-clinical-1',
  name: 'Dr Clinical Approver',
  role: 'governance-approver',
  teamId: 'gp',
  attribution: 'app-side',
}

export const operationalStaff: StaffIdentity = {
  id: 'staff-operational-1',
  name: 'Operational Approver',
  role: 'governance-approver',
  teamId: 'hospital',
  attribution: 'app-side',
}

export function approval(
  role: ApprovalRecord['role'],
  approver: StaffIdentity,
  candidateHash: string,
  decision: ApprovalRecord['decision'] = 'APPROVED',
  recordedAt = NOW,
): ApprovalRecord {
  return {
    approvalId: `${role}:${approver.id}:${recordedAt}`,
    protocolId: 'v4',
    role,
    approver,
    candidateHash,
    decision,
    reason: decision === 'APPROVED' ? 'Named app-side approval of this exact candidate.' : 'Rejected this exact candidate.',
    recordedAt,
  }
}

export function validPlan(overrides: Partial<RolloutPlan> = {}): RolloutPlan {
  return {
    planId: 'rollout-v4',
    protocolId: 'v4',
    rollbackTargetId: 'v3',
    currentStageId: null,
    status: 'READY',
    stages: [
      {
        stageId: 'stage-canary',
        teamIds: ['gp'],
        holdMinutes: 60,
        requiredInvariantIds: [10, 12],
      },
      {
        stageId: 'stage-all',
        teamIds: ['gp', 'hospital'],
        holdMinutes: 120,
        requiredInvariantIds: [2, 10, 12],
      },
    ],
    ...overrides,
  }
}

export class MemoryProtocols implements ProtocolRepository {
  private readonly items = new Map<string, ProtocolVersion>()

  async get(protocolId: string): Promise<ProtocolVersion | null> {
    return this.items.get(protocolId) ?? null
  }

  async put(protocol: ProtocolVersion): Promise<void> {
    this.items.set(protocol.id, protocol)
  }

  async list(): Promise<ProtocolVersion[]> {
    return [...this.items.values()]
  }
}

export class MemoryAudit implements AuditLogRepository {
  readonly entries: AuditEntry[] = []

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry)
  }

  async query(filter: {
    caseId?: string
    actorId?: string
    since?: number
    limit?: number
    offset?: number
  }): Promise<{ items: AuditEntry[]; total: number }> {
    let items = this.entries
    if (filter.caseId) items = items.filter((entry) => entry.caseId === filter.caseId)
    if (filter.actorId) {
      items = items.filter((entry) => ('id' in entry.actor ? entry.actor.id === filter.actorId : false))
    }
    if (filter.since != null) items = items.filter((entry) => entry.recordedAt >= filter.since!)
    const offset = filter.offset ?? 0
    const limit = filter.limit ?? items.length
    return { items: items.slice(offset, offset + limit), total: items.length }
  }
}
