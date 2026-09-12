/**
 * File-backed PersistenceContainer using node:sqlite (Node 22, no extra package).
 * Default location is `.data/covenant.sqlite` (git-ignored via `.data/`).
 *
 * Concurrency: each put/append runs under a per-connection write lock and a single
 * BEGIN IMMEDIATE transaction. Two writers to the same case commit whole records;
 * last complete transaction wins. A reader never sees a torn case or a partial event log.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { EventEnvelope, ProtocolVersion } from '@/domain/types'
import { actorIdOf, assertAuditEntry, assertProtocol, assertStoredCase, cloneValue } from '@/persistence/guard'
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
import { byProtocolId } from '@/persistence/query'
import { MIGRATIONS, SCHEMA_VERSION } from '@/persistence/schema'

export const DEFAULT_SQLITE_PATH = join(process.cwd(), '.data', 'covenant.sqlite')

export interface SqlitePersistence extends PersistenceContainer {
  readonly dbPath: string
  close(): void
  [Symbol.dispose](): void
}

export function openSqlitePersistence(dbPath: string = DEFAULT_SQLITE_PATH): SqlitePersistence {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true })
  }
  const db = new DatabaseSync(dbPath, {
    timeout: 5000,
    enableForeignKeyConstraints: true,
  })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  applyMigrations(db)
  return new FilePersistence(dbPath, db)
}

export function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY
    ) STRICT;
  `)
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined
  const current = row?.version ?? 0
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    if (migration.version !== current + 1 && current !== 0) {
      throw new Error(`migration gap: have ${current}, next ${migration.version}`)
    }
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version)
      db.exec('COMMIT')
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK')
      throw error
    }
  }
  if (SCHEMA_VERSION < 1) throw new Error('SCHEMA_VERSION must be >= 1')
}

class FilePersistence implements SqlitePersistence {
  readonly cases: CaseRepository
  readonly audit: AuditLogRepository
  readonly protocols: ProtocolRepository

  constructor(
    readonly dbPath: string,
    private readonly db: DatabaseSync,
  ) {
    const lock = createWriteLock()
    this.cases = new SqliteCaseRepository(db, lock)
    this.audit = new SqliteAuditLog(db, lock)
    this.protocols = new SqliteProtocolRepository(db, lock)
  }

  close(): void {
    if (this.db.isOpen) this.db.close()
  }

  [Symbol.dispose](): void {
    this.close()
  }
}

class SqliteCaseRepository implements CaseRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly lock: WriteLock,
  ) {}

  async get(caseId: string): Promise<StoredCase | null> {
    const row = this.db.prepare('SELECT case_json, updated_at FROM cases WHERE case_id = ?').get(caseId)
    if (!row) return null
    return hydrateCase(this.db, asText(row.case_json), asInt(row.updated_at), caseId)
  }

  async put(stored: StoredCase): Promise<void> {
    assertStoredCase(stored)
    await this.lock(() => {
      withImmediateTransaction(this.db, () => writeCase(this.db, stored))
    })
  }

  async list(query: CaseQuery = {}): Promise<{ items: StoredCase[]; total: number }> {
    const { sql, params } = caseListSql(query)
    const countRow = this.db.prepare(`SELECT COUNT(*) AS total FROM cases ${sql}`).get(...params) as
      | { total: number }
      | undefined
    const total = countRow?.total ?? 0
    const limit = query.limit ?? -1
    const offset = query.offset ?? 0
    const rows = this.db
      .prepare(`SELECT case_id, case_json, updated_at FROM cases ${sql} ORDER BY case_id ASC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset)
    const items = rows.map((row) =>
      hydrateCase(this.db, asText(row.case_json), asInt(row.updated_at), asText(row.case_id)),
    )
    return { items, total }
  }
}

class SqliteAuditLog implements AuditLogRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly lock: WriteLock,
  ) {}

  async append(entry: AuditEntry): Promise<void> {
    assertAuditEntry(entry)
    await this.lock(() => {
      withImmediateTransaction(this.db, () => {
        this.db
          .prepare(
            `INSERT INTO audit_entries (
              entry_id, case_id, recorded_at, simulator_time, actor_id, actor_json, action, subject_json, detail
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            entry.entryId,
            entry.caseId,
            entry.recordedAt,
            entry.simulatorTime,
            actorIdOf(entry.actor),
            JSON.stringify(entry.actor),
            entry.action,
            JSON.stringify(entry.subject),
            entry.detail,
          )
      })
    })
  }

  async query(filter: {
    caseId?: string
    actorId?: string
    since?: number
    limit?: number
    offset?: number
  }): Promise<{ items: AuditEntry[]; total: number }> {
    const clauses: string[] = []
    const params: Array<string | number> = []
    if (filter.caseId != null) {
      clauses.push('case_id = ?')
      params.push(filter.caseId)
    }
    if (filter.actorId != null) {
      clauses.push('actor_id = ?')
      params.push(filter.actorId)
    }
    if (filter.since != null) {
      clauses.push('recorded_at >= ?')
      params.push(filter.since)
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const countRow = this.db.prepare(`SELECT COUNT(*) AS total FROM audit_entries ${where}`).get(...params) as
      | { total: number }
      | undefined
    const limit = filter.limit ?? -1
    const offset = filter.offset ?? 0
    const rows = this.db
      .prepare(
        `SELECT entry_id, case_id, recorded_at, simulator_time, actor_json, action, subject_json, detail
         FROM audit_entries ${where} ORDER BY seq ASC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset)
    return {
      total: countRow?.total ?? 0,
      items: rows.map((row) => ({
        entryId: asText(row.entry_id),
        caseId: asText(row.case_id),
        recordedAt: asInt(row.recorded_at),
        simulatorTime: asInt(row.simulator_time),
        actor: JSON.parse(asText(row.actor_json)) as AuditEntry['actor'],
        action: asText(row.action),
        subject: JSON.parse(asText(row.subject_json)) as AuditEntry['subject'],
        detail: asText(row.detail),
      })),
    }
  }
}

class SqliteProtocolRepository implements ProtocolRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly lock: WriteLock,
  ) {}

  async get(protocolId: string): Promise<ProtocolVersion | null> {
    const row = this.db.prepare('SELECT protocol_json FROM protocols WHERE protocol_id = ?').get(protocolId)
    if (!row) return null
    return JSON.parse(asText(row.protocol_json)) as ProtocolVersion
  }

  async put(protocol: ProtocolVersion): Promise<void> {
    assertProtocol(protocol)
    await this.lock(() => {
      withImmediateTransaction(this.db, () => {
        this.db
          .prepare(
            `INSERT INTO protocols (protocol_id, protocol_json) VALUES (?, ?)
             ON CONFLICT(protocol_id) DO UPDATE SET protocol_json = excluded.protocol_json`,
          )
          .run(protocol.id, JSON.stringify(protocol))
      })
    })
  }

  async list(): Promise<ProtocolVersion[]> {
    const rows = this.db.prepare('SELECT protocol_json FROM protocols').all()
    return rows
      .map((row) => JSON.parse(asText(row.protocol_json)) as ProtocolVersion)
      .sort(byProtocolId)
  }
}

function writeCase(db: DatabaseSync, stored: StoredCase): void {
  const covenant = stored.case
  db.prepare(
    `INSERT INTO cases (
      case_id, patient_id, owner_team_id, ownership_state, closure_state,
      accepting_actor_id, ack_deadline_at, updated_at, case_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(case_id) DO UPDATE SET
      patient_id = excluded.patient_id,
      owner_team_id = excluded.owner_team_id,
      ownership_state = excluded.ownership_state,
      closure_state = excluded.closure_state,
      accepting_actor_id = excluded.accepting_actor_id,
      ack_deadline_at = excluded.ack_deadline_at,
      updated_at = excluded.updated_at,
      case_json = excluded.case_json`,
  ).run(
    covenant.caseId,
    covenant.patientId,
    covenant.currentAccountableOwner.teamId,
    covenant.ownershipState,
    covenant.closureState,
    covenant.acceptingActor?.id ?? null,
    covenant.deadlines.ackDeadlineAt,
    stored.updatedAt,
    JSON.stringify(covenant),
  )
  db.prepare('DELETE FROM case_events WHERE case_id = ?').run(covenant.caseId)
  const insert = db.prepare(
    'INSERT INTO case_events (case_id, seq, event_id, envelope_json) VALUES (?, ?, ?, ?)',
  )
  stored.eventLog.forEach((envelope, seq) => {
    insert.run(covenant.caseId, seq, envelope.eventId, JSON.stringify(envelope))
  })
}

function hydrateCase(db: DatabaseSync, caseJson: string, updatedAt: number, caseId: string): StoredCase {
  const events = db
    .prepare('SELECT envelope_json FROM case_events WHERE case_id = ? ORDER BY seq ASC')
    .all(caseId)
  return cloneValue({
    case: JSON.parse(caseJson) as StoredCase['case'],
    eventLog: events.map((row) => JSON.parse(asText(row.envelope_json)) as EventEnvelope),
    updatedAt,
  })
}

function caseListSql(query: CaseQuery): { sql: string; params: Array<string | number> } {
  const clauses: string[] = []
  const params: Array<string | number> = []
  if (query.patientId != null) {
    clauses.push('patient_id = ?')
    params.push(query.patientId)
  }
  if (query.ownerTeamId != null) {
    clauses.push('owner_team_id = ?')
    params.push(query.ownerTeamId)
  }
  if (query.ownershipState != null) {
    clauses.push('ownership_state = ?')
    params.push(query.ownershipState)
  }
  if (query.closureState != null) {
    clauses.push('closure_state = ?')
    params.push(query.closureState)
  }
  if (query.overdueAt != null) {
    clauses.push('accepting_actor_id IS NULL')
    clauses.push('ack_deadline_at IS NOT NULL')
    clauses.push('ack_deadline_at <= ?')
    clauses.push("ownership_state IN ('TRANSFER_REQUESTED', 'OVERDUE', 'OWNER_UNAVAILABLE')")
    params.push(query.overdueAt)
  }
  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

function withImmediateTransaction(db: DatabaseSync, fn: () => void): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    fn()
    db.exec('COMMIT')
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw error
  }
}

function asText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('expected text column')
  return value
}

function asInt(value: unknown): number {
  if (typeof value !== 'number') throw new Error('expected integer column')
  return value
}
