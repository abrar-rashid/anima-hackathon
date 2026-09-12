import { describe, expect, it } from 'vitest'
import { MemorySyncCursorRepository } from '@/sync/cursor'
import { detectChanges } from '@/sync/diff'
import { pullIncremental, runSyncPass } from '@/sync/pull'
import { FlakyRead, KEY, NOW, PageCappedRead, PATIENT_ID, record, seededRead, startCursor } from './helpers'

function fiveRecords() {
  return [1, 2, 3, 4, 5].map((n) =>
    record({
      id: `r-${n}`,
      createdAt: NOW - (6 - n) * 60_000,
    }),
  )
}

describe('incremental pull', () => {
  it('returns every record changed between two cursor positions exactly once', async () => {
    const inner = seededRead(fiveRecords())
    const read = new PageCappedRead(inner, 3)
    const first = await pullIncremental(read, startCursor(), { pageLimit: 3 })
    const second = await pullIncremental(read, first.cursor, { pageLimit: 3 })

    const firstIds = first.records.map((item) => item.id)
    const secondIds = second.records.map((item) => item.id)
    const combined = [...firstIds, ...secondIds]

    expect(first.complete).toBe(false)
    expect(second.complete).toBe(true)
    expect(firstIds).toEqual(['r-1', 'r-2', 'r-3'])
    expect(secondIds).toEqual(['r-4', 'r-5'])
    expect(combined).toEqual(['r-1', 'r-2', 'r-3', 'r-4', 'r-5'])
    expect(new Set(combined).size).toBe(5)
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([])
  })

  it('repeating a pull from the same cursor is deterministic and a same-version re-read is not downstream work', async () => {
    const read = seededRead(fiveRecords())
    const cursor = startCursor()
    const once = await pullIncremental(read, cursor)
    const twice = await pullIncremental(read, cursor)

    expect(twice.records.map((item) => ({ id: item.id, version: item.version }))).toEqual(
      once.records.map((item) => ({ id: item.id, version: item.version })),
    )
    expect(twice.cursor).toEqual(once.cursor)

    const applied = detectChanges({ versions: {} }, once.records)
    const reread = detectChanges(applied.catalog, twice.records)
    expect(reread.changes).toEqual([])

    const nextPass = await pullIncremental(read, once.cursor)
    expect(nextPass.records).toEqual([])
    const afterAdvance = detectChanges(applied.catalog, nextPass.records)
    expect(afterAdvance.changes).toEqual([])
  })

  it('resuming from a persisted cursor after a mid-pagination interrupt loses nothing', async () => {
    const inner = seededRead(fiveRecords())
    const read = new PageCappedRead(inner, 2)
    const store = new MemorySyncCursorRepository()

    const first = await pullIncremental(read, startCursor(), { pageLimit: 2 })
    await store.put(first.cursor)
    expect(first.complete).toBe(false)
    expect(first.records.map((item) => item.id)).toEqual(['r-1', 'r-2'])

    const persisted = await store.get(KEY)
    expect(persisted).not.toBeNull()
    if (!persisted) return

    const resumed = await runSyncPass(read, persisted, { pageLimit: 2, store })
    const allIds = [...first.records, ...resumed.records].map((item) => item.id)
    expect(allIds).toEqual(['r-1', 'r-2', 'r-3', 'r-4', 'r-5'])
    expect(new Set(allIds).size).toBe(5)
    expect(resumed.cursor.pageOffset).toBe(0)
    expect(resumed.cursor.highWaterSimulatorTime).toBe(NOW)
  })

  it('high-water is simulator time from the read port, not wall-clock', async () => {
    const wall = Date.now()
    const read = seededRead([record({ id: 'r-clock', createdAt: NOW })], NOW)
    const result = await pullIncremental(read, startCursor())
    expect(result.complete).toBe(true)
    expect(result.cursor.highWaterSimulatorTime).toBe(NOW)
    expect(result.cursor.clock.now).toBe(NOW)
    expect(result.cursor.clock.paused).toBe(true)
    expect(result.cursor.clock.speed).toBe(60)
    expect(result.cursor.highWaterSimulatorTime).not.toBe(wall)
    expect(Math.abs(result.cursor.highWaterSimulatorTime - wall)).toBeGreaterThan(1_000)
  })

  it('does not advance the cursor when a page fetch throws', async () => {
    const inner = seededRead(fiveRecords())
    const read = new FlakyRead(new PageCappedRead(inner, 2), { failCount: 1, status: 502 })
    const cursor = startCursor()
    await expect(pullIncremental(read, cursor, { pageLimit: 2 })).rejects.toThrow(/502/)
    expect(cursor.pageOffset).toBe(0)
    expect(cursor.seen).toEqual({})
    expect(cursor.highWaterSimulatorTime).toBe(0)
  })

  it('does not import or call a write port', async () => {
    const read = seededRead([record({ id: 'r-ro' })])
    const result = await pullIncremental(read, startCursor())
    expect(result.records).toHaveLength(1)
    expect(Object.keys(read)).not.toContain('executeApprovedAction')
  })

  it('restricts the pass to the cursor patient and site', async () => {
    const read = seededRead([
      record({ id: 'r-here', patientId: PATIENT_ID, owner: 'gp', visibleTo: ['gp'] }),
      record({ id: 'r-other', patientId: 'SIM-000002', owner: 'gp', visibleTo: ['gp'] }),
    ])
    const result = await pullIncremental(read, startCursor())
    expect(result.records.map((item) => item.id)).toEqual(['r-here'])
  })
})
