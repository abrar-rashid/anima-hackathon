import { describe, expect, it } from 'vitest'
import { append, deriveTaskState } from '@/tasks/ledger'
import { makeEntry, T0 } from './helpers'

describe('task ledger', () => {
  it('append adds an entry without mutating the input array', () => {
    const first = makeEntry({ entryId: 'e1', timestamp: T0 })
    const start: typeof first[] = []
    const result = append(start, first)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected append to succeed')
    expect(result.entries).toHaveLength(1)
    expect(start).toHaveLength(0)
    expect(result.entries[0]).toBe(first)
  })

  it('append rejects duplicate entry ids with duplicate-entry', () => {
    const first = makeEntry({ entryId: 'e1' })
    const once = append([], first)
    expect(once.ok).toBe(true)
    if (!once.ok) throw new Error('expected first append')
    const dup = append(once.entries, makeEntry({ entryId: 'e1', status: 'accepted' }))
    expect(dup.ok).toBe(false)
    if (dup.ok) throw new Error('expected duplicate-entry')
    expect(dup.reason).toBe('duplicate-entry')
    expect(dup.entries).toHaveLength(1)
  })

  it('deriveTaskState replays entries in timestamp order', () => {
    const later = makeEntry({ entryId: 'e-late', timestamp: T0 + 60_000, status: 'accepted' })
    const earlier = makeEntry({ entryId: 'e-early', timestamp: T0, status: 'open' })
    const derived = deriveTaskState([later, earlier])
    expect(derived.ok).toBe(true)
    expect(derived.tasks).toHaveLength(1)
    const task = derived.tasks[0]
    expect(task?.status).toBe('accepted')
    expect(task?.historyEntryIds).toEqual(['e-early', 'e-late'])
    expect(task?.stepLatencies).toEqual([
      {
        fromStatus: 'open',
        toStatus: 'accepted',
        fromTimestamp: T0,
        toTimestamp: T0 + 60_000,
        durationMs: 60_000,
      },
    ])
  })

  it('deriveTaskState rejects duplicate entry ids with duplicate-entry', () => {
    const a = makeEntry({ entryId: 'same', timestamp: T0 })
    const b = makeEntry({ entryId: 'same', timestamp: T0 + 1, status: 'accepted' })
    const derived = deriveTaskState([a, b])
    expect(derived.ok).toBe(false)
    expect(derived.rejected.map((row) => row.reason)).toContain('duplicate-entry')
    expect(derived.tasks[0]?.lastEntryId).toBe('same')
    expect(derived.tasks[0]?.status).toBe('open')
  })

  it('deriveTaskState rejects backward status transitions with backward-transition', () => {
    const closed = makeEntry({
      entryId: 'e-closed',
      timestamp: T0,
      status: 'closed',
      closureEvidence: [
        { kind: 'source-task-completed', citation: { resourceId: 'r-2', resourceVersion: 1, fieldPath: 'status' } },
      ],
    })
    const reopen = makeEntry({ entryId: 'e-open', timestamp: T0 + 1, status: 'open' })
    const derived = deriveTaskState([closed, reopen])
    expect(derived.ok).toBe(false)
    expect(derived.rejected).toEqual([
      expect.objectContaining({ reason: 'backward-transition', entry: reopen }),
    ])
    expect(derived.tasks[0]?.status).toBe('closed')
  })

  it('append rejects a backward transition with backward-transition', () => {
    const closed = makeEntry({
      entryId: 'e-closed',
      status: 'closed',
      closureEvidence: [
        { kind: 'source-task-completed', citation: { resourceId: 'r-2', resourceVersion: 1, fieldPath: 'status' } },
      ],
    })
    const seeded = append([], closed)
    expect(seeded.ok).toBe(true)
    if (!seeded.ok) throw new Error('expected seed')
    const result = append(
      seeded.entries,
      makeEntry({ entryId: 'e-back', timestamp: T0 + 1, status: 'open' }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected backward-transition')
    expect(result.reason).toBe('backward-transition')
  })

  it('allows same-rank transitions such as open to overdue and overdue to accepted', () => {
    const open = makeEntry({ entryId: 'e1', timestamp: T0, status: 'open' })
    const overdue = makeEntry({ entryId: 'e2', timestamp: T0 + 10, status: 'overdue' })
    const accepted = makeEntry({ entryId: 'e3', timestamp: T0 + 20, status: 'accepted' })
    const derived = deriveTaskState([open, overdue, accepted])
    expect(derived.ok).toBe(true)
    expect(derived.tasks[0]?.status).toBe('accepted')
    expect(derived.rejected).toEqual([])
  })

  it('identical entries derive identical state', () => {
    const entries = [
      makeEntry({ entryId: 'e1', timestamp: T0, status: 'open' }),
      makeEntry({ entryId: 'e2', timestamp: T0 + 5_000, status: 'overdue' }),
    ]
    expect(deriveTaskState(entries)).toEqual(deriveTaskState([...entries].reverse()))
  })

  it('derives independent tasks and never blanks the owner', () => {
    const a = makeEntry({ entryId: 'a1', taskId: 'r-2', ownerTeamId: 'gp' })
    const b = makeEntry({ entryId: 'b1', taskId: 'gap:order-1', resourceId: 'ord-1', ownerTeamId: 'diagnostics' })
    const derived = deriveTaskState([a, b])
    expect(derived.ok).toBe(true)
    expect(derived.tasks).toHaveLength(2)
    for (const task of derived.tasks) {
      expect(task.owner.teamId.length).toBeGreaterThan(0)
    }
  })

  it('uses only entry timestamps, not a clock', () => {
    const entries = [makeEntry({ entryId: 'e1', timestamp: 42 })]
    const derived = deriveTaskState(entries)
    expect(derived.tasks[0]?.lastTimestamp).toBe(42)
  })
})
