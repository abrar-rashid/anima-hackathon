import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { openSqlitePersistence } from '@/persistence/sqlite'
import type { PersistenceContainer } from '@/persistence/port'
import { SCHEMA_VERSION } from '@/persistence/schema'
import { runPersistenceContract } from './contract'
import { T0, auditEntry, protocol, storedCase } from './fixtures'

const dirs: string[] = []

function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'covenant-persist-'))
  dirs.push(dir)
  return join(dir, 'covenant.sqlite')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

runPersistenceContract('sqlite', () => {
  const store = openSqlitePersistence(tempDb())
  return {
    container: store,
    dispose() {
      store.close()
    },
  }
})

describe('sqlite durability and schema', () => {
  it('write, close, reopen from the same file, and read the same data including event order', async () => {
    const path = tempDb()
    const first = openSqlitePersistence(path)
    const record = storedCase()
    const entry = auditEntry({ entryId: 'aud-durable' })
    await first.cases.put(record)
    await first.audit.append(entry)
    await first.protocols.put(protocol)
    first.close()

    const second = openSqlitePersistence(path)
    try {
      const loaded = await second.cases.get(record.case.caseId)
      expect(loaded).toEqual(record)
      expect(loaded?.eventLog.map((e) => e.eventId)).toEqual(record.eventLog.map((e) => e.eventId))
      const audit = await second.audit.query({ caseId: entry.caseId })
      expect(audit.items).toEqual([entry])
      expect(await second.protocols.get(protocol.id)).toEqual(protocol)
    } finally {
      second.close()
    }
  })

  it('applies schema version 1 once and is idempotent on reopen', () => {
    const path = tempDb()
    const first = openSqlitePersistence(path)
    first.close()
    const second = openSqlitePersistence(path)
    second.close()
    const db = new DatabaseSync(path)
    try {
      const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
        | { version: number }
        | undefined
      expect(row?.version).toBe(SCHEMA_VERSION)
      expect(SCHEMA_VERSION).toBe(1)
    } finally {
      db.close()
    }
  })

  it('database rejects UPDATE and DELETE on audit_entries', async () => {
    const path = tempDb()
    const store = openSqlitePersistence(path)
    await store.audit.append(auditEntry({ entryId: 'aud-locked' }))
    store.close()

    const db = new DatabaseSync(path)
    try {
      expect(() => db.exec("UPDATE audit_entries SET detail = 'tampered'")).toThrow(/append-only/)
      expect(() => db.exec('DELETE FROM audit_entries')).toThrow(/append-only/)
      const row = db.prepare('SELECT detail FROM audit_entries WHERE entry_id = ?').get('aud-locked') as
        | { detail: string }
        | undefined
      expect(row?.detail).toBe('handover-proposed')
    } finally {
      db.close()
    }
  })

  it('two connections writing the same case never leave a torn mix of events and snapshot', async () => {
    const path = tempDb()
    const a = openSqlitePersistence(path)
    const b = openSqlitePersistence(path)
    const caseId = 'case-SIM-000001-dual'
    const writerA = storedCase({
      caseId,
      ownershipState: 'TRANSFER_REQUESTED',
      eventLog: [
        { eventId: 'conn-a-1', caseId, simulatorTime: T0, actor: 'a', event: { type: 'ClockTick', now: T0 } },
        { eventId: 'conn-a-2', caseId, simulatorTime: T0 + 1, actor: 'a', event: { type: 'ClockTick', now: T0 + 1 } },
      ],
    }, 1)
    const writerB = storedCase({
      caseId,
      ownershipState: 'OVERDUE',
      eventLog: [
        { eventId: 'conn-b-1', caseId, simulatorTime: T0, actor: 'b', event: { type: 'TransferTimedOut' } },
      ],
    }, 2)

    await Promise.all([a.cases.put(writerA), b.cases.put(writerB)])
    a.close()
    b.close()

    const reader = openSqlitePersistence(path)
    try {
      const loaded = await reader.cases.get(caseId)
      const ids = loaded!.eventLog.map((e) => e.eventId)
      const isA = ids.join(',') === 'conn-a-1,conn-a-2' && loaded!.case.ownershipState === 'TRANSFER_REQUESTED'
      const isB = ids.join(',') === 'conn-b-1' && loaded!.case.ownershipState === 'OVERDUE'
      expect(isA || isB).toBe(true)
    } finally {
      reader.close()
    }
  })

  it('satisfies PersistenceContainer on the opened store', () => {
    const store = openSqlitePersistence(tempDb())
    const container: PersistenceContainer = store
    expect(container.cases).toBe(store.cases)
    expect(container.audit).toBe(store.audit)
    expect(container.protocols).toBe(store.protocols)
    store.close()
  })
})
