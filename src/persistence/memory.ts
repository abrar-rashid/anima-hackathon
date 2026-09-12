/**
 * In-memory PersistenceContainer. Deterministic: no Date.now(), no randomness.
 * updatedAt and recordedAt arrive on the stored values.
 */
import type { ProtocolVersion } from '@/domain/types'
import { assertAuditEntry, assertProtocol, assertStoredCase, cloneValue } from '@/persistence/guard'
import { createWriteLock, type WriteLock } from '@/persistence/lock'
import type {
  AuditEntry,
  AuditLogRepository,
  CaseQuery,
  CaseRepository,
  PersistenceContainer,
  ProtocolRepository,
  StoredCase,
} from '@/persistence/port'
import { auditMatchesFilter, byCaseId, byProtocolId, caseMatchesQuery, paginate } from '@/persistence/query'

export function createMemoryPersistence(): PersistenceContainer {
  const lock = createWriteLock()
  const cases = new Map<string, StoredCase>()
  const audit: AuditEntry[] = []
  const protocols = new Map<string, ProtocolVersion>()
  return {
    cases: new MemoryCaseRepository(cases, lock),
    audit: new MemoryAuditLog(audit, lock),
    protocols: new MemoryProtocolRepository(protocols, lock),
  }
}

class MemoryCaseRepository implements CaseRepository {
  constructor(
    private readonly rows: Map<string, StoredCase>,
    private readonly lock: WriteLock,
  ) {}

  async get(caseId: string): Promise<StoredCase | null> {
    const row = this.rows.get(caseId)
    return row ? cloneValue(row) : null
  }

  async put(stored: StoredCase): Promise<void> {
    assertStoredCase(stored)
    await this.lock(() => {
      this.rows.set(stored.case.caseId, cloneValue(stored))
    })
  }

  async list(query: CaseQuery = {}): Promise<{ items: StoredCase[]; total: number }> {
    const matched = [...this.rows.values()].filter((row) => caseMatchesQuery(row, query)).sort(byCaseId)
    const page = paginate(matched, query.limit, query.offset)
    return { items: page.items.map((row) => cloneValue(row)), total: page.total }
  }
}

class MemoryAuditLog implements AuditLogRepository {
  constructor(
    private readonly entries: AuditEntry[],
    private readonly lock: WriteLock,
  ) {}

  async append(entry: AuditEntry): Promise<void> {
    assertAuditEntry(entry)
    await this.lock(() => {
      if (this.entries.some((existing) => existing.entryId === entry.entryId)) {
        throw new Error('audit entryId already recorded')
      }
      this.entries.push(Object.freeze(cloneValue(entry)))
    })
  }

  async query(filter: {
    caseId?: string
    actorId?: string
    since?: number
    limit?: number
    offset?: number
  }): Promise<{ items: AuditEntry[]; total: number }> {
    const matched = this.entries.filter((entry) => auditMatchesFilter(entry, filter))
    const page = paginate(matched, filter.limit, filter.offset)
    return { items: page.items.map((entry) => cloneValue(entry)), total: page.total }
  }
}

class MemoryProtocolRepository implements ProtocolRepository {
  constructor(
    private readonly rows: Map<string, ProtocolVersion>,
    private readonly lock: WriteLock,
  ) {}

  async get(protocolId: string): Promise<ProtocolVersion | null> {
    const row = this.rows.get(protocolId)
    return row ? cloneValue(row) : null
  }

  async put(protocol: ProtocolVersion): Promise<void> {
    assertProtocol(protocol)
    await this.lock(() => {
      this.rows.set(protocol.id, cloneValue(protocol))
    })
  }

  async list(): Promise<ProtocolVersion[]> {
    return [...this.rows.values()].sort(byProtocolId).map((row) => cloneValue(row))
  }
}
