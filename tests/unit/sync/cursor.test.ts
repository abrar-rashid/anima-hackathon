import { describe, expect, it } from 'vitest'
import {
  cursorStorageKey,
  emptyCursor,
  MemorySyncCursorRepository,
  SIMULATOR_EPOCH_MS,
} from '@/sync/cursor'
import { KEY, NOW, PATIENT_ID, SITE, TEAM, WORLD } from './helpers'

describe('sync cursor', () => {
  it('starts at simulator time zero, not wall-clock', () => {
    const wall = Date.now()
    const cursor = emptyCursor(KEY)
    expect(cursor.highWaterSimulatorTime).toBe(0)
    expect(cursor.pageOffset).toBe(0)
    expect(cursor.seen).toEqual({})
    expect(cursor.clock.now).toBe(0)
    expect(cursor.clock.paused).toBe(true)
    expect(cursor.world).toBe(WORLD)
    expect(cursor.team).toBe(TEAM)
    expect(cursor.site).toBe(SITE)
    expect(cursor.patientId).toBe(PATIENT_ID)
    expect(cursor.highWaterSimulatorTime).not.toBe(wall)
    expect(SIMULATOR_EPOCH_MS).toBe(1_789_286_400_000)
    // Captured world is PAUSED at the epoch; that instant is not Date.now().
    expect(SIMULATOR_EPOCH_MS).not.toBe(wall)
  })

  it('stores cursors through a repository instance, not a module global', async () => {
    const first = new MemorySyncCursorRepository()
    const second = new MemorySyncCursorRepository()
    const cursor = emptyCursor(KEY, { now: NOW, paused: true, speed: 60 })
    await first.put({ ...cursor, highWaterSimulatorTime: NOW, seen: { 'r-2': 1 } })
    expect(await first.get(KEY)).toMatchObject({
      highWaterSimulatorTime: NOW,
      seen: { 'r-2': 1 },
    })
    expect(await second.get(KEY)).toBeNull()
    expect(cursorStorageKey(KEY)).toBe(`${WORLD}|${TEAM}|${SITE}|${PATIENT_ID}`)
  })

  it('get returns a clone so callers cannot mutate stored state', async () => {
    const repo = new MemorySyncCursorRepository()
    await repo.put(emptyCursor(KEY, { now: NOW, paused: true, speed: 60 }))
    const loaded = await repo.get(KEY)
    expect(loaded).not.toBeNull()
    if (!loaded) return
    loaded.seen = { mutated: 9 }
    loaded.pageOffset = 99
    const again = await repo.get(KEY)
    expect(again?.seen).toEqual({})
    expect(again?.pageOffset).toBe(0)
  })
})
