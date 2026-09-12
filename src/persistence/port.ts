/**
 * Persistence boundary. The in-memory case store is the incumbent implementation;
 * anything durable must satisfy these interfaces so services stay storage-agnostic.
 *
 * The audit log is append-only on purpose: a covenant's history is evidence, and
 * evidence that can be edited is not evidence.
 */
import type { CovenantCase, EventEnvelope, ProtocolVersion, StaffIdentity } from '@/domain/types'

export interface StoredCase {
  case: CovenantCase
  eventLog: EventEnvelope[]
  updatedAt: number
}

export interface CaseQuery {
  patientId?: string
  ownerTeamId?: string
  ownershipState?: CovenantCase['ownershipState']
  closureState?: CovenantCase['closureState']
  /** Cases with no acceptance whose acknowledgement deadline has passed this time. */
  overdueAt?: number
  limit?: number
  offset?: number
}

export interface CaseRepository {
  get(caseId: string): Promise<StoredCase | null>
  put(stored: StoredCase): Promise<void>
  list(query?: CaseQuery): Promise<{ items: StoredCase[]; total: number }>
}

/** Append-only. There is deliberately no update or delete. */
export interface AuditEntry {
  entryId: string
  caseId: string
  /** Wall-clock time the entry was recorded, distinct from simulator time. */
  recordedAt: number
  simulatorTime: number
  actor: StaffIdentity | { kind: 'system'; name: string }
  action: string
  /** Ids and versions only — never free-text clinical narrative. */
  subject: { resourceId?: string; resourceVersion?: number; activityId?: string }
  detail: string
}

export interface AuditLogRepository {
  append(entry: AuditEntry): Promise<void>
  query(filter: {
    caseId?: string
    actorId?: string
    since?: number
    limit?: number
    offset?: number
  }): Promise<{ items: AuditEntry[]; total: number }>
}

export interface ProtocolRepository {
  get(protocolId: string): Promise<ProtocolVersion | null>
  put(protocol: ProtocolVersion): Promise<void>
  list(): Promise<ProtocolVersion[]>
}

export interface PersistenceContainer {
  cases: CaseRepository
  audit: AuditLogRepository
  protocols: ProtocolRepository
}
