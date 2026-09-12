import { describe, expect, it } from 'vitest'
import { MemorySyncCursorRepository } from '@/sync/cursor'
import { detectChanges } from '@/sync/diff'
import { runSyncPass } from '@/sync/pull'
import { SyncScheduler } from '@/sync/scheduler'
import {
  FlakyRead,
  KEY,
  NOW,
  PageCappedRead,
  record,
  seededRead,
  startCursor,
} from './helpers'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((ok) => {
    resolve = ok
  })
  return { promise, resolve }
}

describe('sync scheduler', () => {
  it('a 502 retries with backoff and does not advance the cursor past unprocessed work', async () => {
    const inner = seededRead([
      record({ id: 'r-1', createdAt: NOW - 3_000 }),
      record({ id: 'r-2', createdAt: NOW - 2_000 }),
      record({ id: 'r-3', createdAt: NOW - 1_000 }),
      record({ id: 'r-4', createdAt: NOW }),
    ])
    const paged = new PageCappedRead(inner, 2)
    const flaky = new FlakyRead(paged, { failCount: 1, status: 502, whenOffset: 2 })
    const store = new MemorySyncCursorRepository()
    const sleeps: number[] = []
    let midCursorSeen: string[] | null = null

    const scheduler = new SyncScheduler({
      intervalMs: 1_000,
      clock: { now: () => 10_000 },
      sleep: async (ms) => {
        sleeps.push(ms)
        const mid = await store.get(KEY)
        midCursorSeen = mid ? Object.keys(mid.seen).sort() : []
      },
      maxAttempts: 3,
      backoffMs: (attempt) => attempt * 25,
      run: async () => {
        const cursor = (await store.get(KEY)) ?? startCursor()
        return runSyncPass(flaky, cursor, { pageLimit: 2, store })
      },
    })

    const result = await scheduler.tick()
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.status).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(sleeps).toEqual([25])
    expect(midCursorSeen).toEqual(['r-1', 'r-2'])
    expect(flaky.lastThrownAtOffset).toBe(2)

    const final = await store.get(KEY)
    expect(final?.pageOffset).toBe(0)
    expect(final?.highWaterSimulatorTime).toBe(NOW)
    expect(Object.keys(final?.seen ?? {}).sort()).toEqual(['r-1', 'r-2', 'r-3', 'r-4'])
    // The successful retry resumes from the persisted page, so it only
    // pulls the two records that had not been processed when the 502 fired.
    expect(result.pulled).toBe(2)
    expect(result.changed).toBe(2)
  })

  it('a tick arriving while a run is in progress does not start a second run', async () => {
    let runs = 0
    const gate = deferred<void>()
    const scheduler = new SyncScheduler({
      intervalMs: 1,
      clock: { now: () => 1 },
      sleep: async () => undefined,
      run: async () => {
        runs += 1
        await gate.promise
        return { records: [], changes: [], cursor: startCursor(), pages: 0 }
      },
    })

    const first = scheduler.tick()
    const second = await scheduler.tick()
    expect(scheduler.inFlight).toBe(true)
    expect(second).toBeNull()
    expect(runs).toBe(1)
    gate.resolve()
    const finished = await first
    expect(finished?.status).toBe('ok')
    expect(runs).toBe(1)
    expect(scheduler.inFlight).toBe(false)
  })

  it('skips a tick that arrives before the interval has elapsed', async () => {
    let now = 0
    let runs = 0
    const scheduler = new SyncScheduler({
      intervalMs: 60_000,
      clock: { now: () => now },
      sleep: async () => undefined,
      run: async () => {
        runs += 1
        return { records: [], changes: [], cursor: startCursor(), pages: 1 }
      },
    })

    const first = await scheduler.tick()
    now = 59_999
    const early = await scheduler.tick()
    now = 60_000
    const later = await scheduler.tick()

    expect(first?.status).toBe('ok')
    expect(early).toBeNull()
    expect(later?.status).toBe('ok')
    expect(runs).toBe(2)
  })

  it('does not retry a non-transient failure and leaves the cursor unadvanced', async () => {
    const inner = seededRead([record({ id: 'r-1' })])
    const flaky = new FlakyRead(inner, { failCount: 3, status: 400 })
    const store = new MemorySyncCursorRepository()
    const sleeps: number[] = []
    const scheduler = new SyncScheduler({
      intervalMs: 1_000,
      clock: { now: () => 1 },
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      maxAttempts: 3,
      backoffMs: (attempt) => attempt * 10,
      run: async () => runSyncPass(flaky, startCursor(), { store }),
    })

    const result = await scheduler.tick()
    expect(result?.status).toBe('failed')
    expect(result?.attempts).toBe(1)
    expect(sleeps).toEqual([])
    expect(await store.get(KEY)).toBeNull()
  })

  it('records what a successful run saw', async () => {
    const read = seededRead([record({ id: 'r-seen', version: 1 })])
    const store = new MemorySyncCursorRepository()
    const scheduler = new SyncScheduler({
      intervalMs: 1,
      clock: { now: () => 5 },
      sleep: async () => undefined,
      run: async () => runSyncPass(read, startCursor(), { store }),
    })
    const result = await scheduler.tick()
    expect(result).toMatchObject({
      status: 'ok',
      pulled: 1,
      changed: 1,
      attempts: 1,
    })
    expect(result?.startedAt).toBe(5)
    expect(result?.finishedAt).toBe(5)
    const again = detectChanges({ versions: result?.cursor?.seen ?? {} }, [
      record({ id: 'r-seen', version: 1 }),
    ])
    expect(again.changes).toEqual([])
  })
})
