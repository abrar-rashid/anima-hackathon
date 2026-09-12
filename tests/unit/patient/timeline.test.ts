import { describe, expect, it } from 'vitest'
import { buildTimeline, buildTimelineEntries, collapseRuns, groupByDay } from '@/components/patient/timeline'
import { DISCHARGE_SUMMARY, NOW, TASK_RESOURCE, makeObservation } from './fixtures'

describe('buildTimelineEntries', () => {
  it('flattens every created and changed provenance entry, ordered chronologically', () => {
    const entries = buildTimelineEntries([TASK_RESOURCE, DISCHARGE_SUMMARY])

    // TASK_RESOURCE has a `created` (v1) and one `change` (accept, v2).
    // DISCHARGE_SUMMARY has only a `created` (v1). Three entries total.
    expect(entries).toHaveLength(3)
    expect(entries.every((e, i) => i === 0 || e.time >= entries[i - 1]!.time)).toBe(true)

    const dischargeCreated = entries.find((e) => e.resourceId === DISCHARGE_SUMMARY.id)
    expect(dischargeCreated?.actorName).toBe('Dr Morgan Bell')
    expect(dischargeCreated?.action).toBe('seed')

    const taskAccept = entries.find((e) => e.resourceId === TASK_RESOURCE.id && e.version === 2)
    expect(taskAccept?.actorName).toBe('team12')
    expect(taskAccept?.action).toBe('accept')
  })

  it('every entry traces back to its exact resource id and version', () => {
    const entries = buildTimelineEntries([TASK_RESOURCE])
    for (const entry of entries) {
      expect(entry.resourceId).toBe(TASK_RESOURCE.id)
      expect([1, 2]).toContain(entry.version)
    }
  })

  it('produces nothing for a resource with no provenance entries', () => {
    const bare = { ...TASK_RESOURCE, provenance: { changes: [] } }
    expect(buildTimelineEntries([bare])).toHaveLength(0)
  })
})

describe('collapseRuns', () => {
  it('collapses four or more consecutive routine observations from the same site into one run', () => {
    const observations = [
      makeObservation('o-1', 4000),
      makeObservation('o-2', 3000),
      makeObservation('o-3', 2000),
      makeObservation('o-4', 1000),
    ]
    const items = collapseRuns(buildTimelineEntries(observations))
    expect(items).toHaveLength(1)
    expect(items[0]?.kind).toBe('run')
    if (items[0]?.kind === 'run') {
      expect(items[0].count).toBe(4)
      expect(items[0].entries).toHaveLength(4)
    }
  })

  it('leaves short runs of the same low-signal kind as individual entries', () => {
    const observations = [makeObservation('o-1', 2000), makeObservation('o-2', 1000)]
    const items = collapseRuns(buildTimelineEntries(observations))
    expect(items).toHaveLength(2)
    expect(items.every((item) => item.kind === 'single')).toBe(true)
  })

  it('never collapses a task or a discharge summary, however many there are', () => {
    const items = collapseRuns(buildTimelineEntries([TASK_RESOURCE, DISCHARGE_SUMMARY]))
    expect(items.every((item) => item.kind === 'single')).toBe(true)
  })
})

describe('groupByDay', () => {
  it('groups items under the UTC day their time falls on', () => {
    const items = collapseRuns(buildTimelineEntries([TASK_RESOURCE, DISCHARGE_SUMMARY]))
    const groups = groupByDay(items)
    const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0)
    expect(totalItems).toBe(items.length)
    // Day keys must be sorted ascending.
    const keys = groups.map((g) => g.dayKey)
    expect(keys).toEqual([...keys].sort())
  })
})

describe('buildTimeline', () => {
  it('is stable and traceable end to end for a realistic small resource set', () => {
    const timeline = buildTimeline([TASK_RESOURCE, DISCHARGE_SUMMARY])
    const flatEntries = timeline.flatMap((day) =>
      day.items.flatMap((item) => (item.kind === 'single' ? [item.entry] : item.entries)),
    )
    expect(flatEntries).toHaveLength(3)
    for (const entry of flatEntries) {
      expect(entry.time).toBeLessThanOrEqual(NOW)
      expect(entry.key).toBe(`${entry.resourceId}:${entry.version}`)
    }
  })

  it('returns no days for an empty resource list, never a placeholder day', () => {
    expect(buildTimeline([])).toHaveLength(0)
  })
})
