import type { AuditEntry, CaseQuery, StoredCase } from '@/persistence/port'
import { actorIdOf } from '@/persistence/guard'

const OUTSTANDING_ACK: ReadonlySet<StoredCase['case']['ownershipState']> = new Set([
  'TRANSFER_REQUESTED',
  'OVERDUE',
  'OWNER_UNAVAILABLE',
])

export function caseMatchesQuery(stored: StoredCase, query: CaseQuery): boolean {
  if (query.patientId != null && stored.case.patientId !== query.patientId) return false
  if (query.ownerTeamId != null && stored.case.currentAccountableOwner.teamId !== query.ownerTeamId) {
    return false
  }
  if (query.ownershipState != null && stored.case.ownershipState !== query.ownershipState) return false
  if (query.closureState != null && stored.case.closureState !== query.closureState) return false
  if (query.overdueAt != null && !isOverdueAt(stored, query.overdueAt)) return false
  return true
}

/** Outstanding acknowledgement whose deadline has passed this simulator time (now >= deadline). */
export function isOverdueAt(stored: StoredCase, overdueAt: number): boolean {
  if (stored.case.acceptingActor != null) return false
  const deadline = stored.case.deadlines.ackDeadlineAt
  if (deadline == null) return false
  if (deadline > overdueAt) return false
  return OUTSTANDING_ACK.has(stored.case.ownershipState)
}

export function auditMatchesFilter(
  entry: AuditEntry,
  filter: { caseId?: string; actorId?: string; since?: number },
): boolean {
  if (filter.caseId != null && entry.caseId !== filter.caseId) return false
  if (filter.actorId != null && actorIdOf(entry.actor) !== filter.actorId) return false
  if (filter.since != null && entry.recordedAt < filter.since) return false
  return true
}

export function paginate<T>(items: T[], limit?: number, offset?: number): { items: T[]; total: number } {
  const start = offset ?? 0
  const sliced = limit == null ? items.slice(start) : items.slice(start, start + limit)
  return { items: sliced, total: items.length }
}

export function byCaseId(a: StoredCase, b: StoredCase): number {
  return a.case.caseId < b.case.caseId ? -1 : a.case.caseId > b.case.caseId ? 1 : 0
}

export function byProtocolId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
