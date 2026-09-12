import type { SimResource } from '@/ctl/contracts'
import type { TimelineDayGroup, TimelineEntry, TimelineItem } from './types'
import { formatDayLabel } from './format'

/**
 * Turns this patient's resources into one chronological spine.
 *
 * Pure: no I/O, no clock reads. `buildTimeline` is the only entry point other
 * modules should call; the rest is exported for direct unit testing.
 */

/** Kinds that generate enough routine volume to need collapsing. */
const LOW_SIGNAL_KINDS = new Set(['observation'])

/** A run of this many or more consecutive matching entries collapses. */
const COLLAPSE_THRESHOLD = 4

/** Every `created` and `changes[]` entry, flattened and traceable to its resource. */
export function buildTimelineEntries(resources: SimResource[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const resource of resources) {
    const push = (time: number, actorName: string, actorKind: string, action: string, version: number): void => {
      entries.push({
        key: `${resource.id}:${version}`,
        time,
        site: resource.site,
        actorName,
        actorKind,
        action,
        version,
        resourceId: resource.id,
        resourceKind: resource.kind,
        resourceTitle: resource.title,
      })
    }

    const created = resource.provenance.created
    if (created) push(created.time, created.actor.name, created.actor.kind, created.action, created.version)

    for (const change of resource.provenance.changes) {
      push(change.time, change.actor.name, change.actor.kind, change.action, change.version)
    }
  }

  return entries.sort((a, b) => a.time - b.time || a.resourceId.localeCompare(b.resourceId) || a.version - b.version)
}

/** Collapse consecutive low-signal repeats (same site, kind, action) behind one run. */
export function collapseRuns(entries: TimelineEntry[]): TimelineItem[] {
  const items: TimelineItem[] = []
  let i = 0

  while (i < entries.length) {
    const start = entries[i]!
    if (!LOW_SIGNAL_KINDS.has(start.resourceKind)) {
      items.push({ kind: 'single', entry: start })
      i += 1
      continue
    }

    let j = i + 1
    while (
      j < entries.length &&
      entries[j]!.site === start.site &&
      entries[j]!.resourceKind === start.resourceKind &&
      entries[j]!.action === start.action
    ) {
      j += 1
    }

    const run = entries.slice(i, j)
    if (run.length >= COLLAPSE_THRESHOLD) {
      items.push({
        kind: 'run',
        groupKey: `${start.site}:${start.resourceKind}:${start.action}:${start.time}`,
        site: start.site,
        resourceKind: start.resourceKind,
        action: start.action,
        count: run.length,
        firstTime: run[0]!.time,
        lastTime: run[run.length - 1]!.time,
        entries: run,
      })
    } else {
      for (const entry of run) items.push({ kind: 'single', entry })
    }
    i = j
  }

  return items
}

function timeOf(item: TimelineItem): number {
  return item.kind === 'single' ? item.entry.time : item.firstTime
}

function dayKeyOf(timeMs: number): string {
  return new Date(timeMs).toISOString().slice(0, 10)
}

export function groupByDay(items: TimelineItem[]): TimelineDayGroup[] {
  const groups = new Map<string, TimelineItem[]>()
  for (const item of items) {
    const key = dayKeyOf(timeOf(item))
    const bucket = groups.get(key)
    if (bucket) bucket.push(item)
    else groups.set(key, [item])
  }

  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dayKey, groupItems]) => ({
      dayKey,
      dayLabel: formatDayLabel(dayKey),
      items: groupItems,
    }))
}

export function buildTimeline(resources: SimResource[]): TimelineDayGroup[] {
  return groupByDay(collapseRuns(buildTimelineEntries(resources)))
}
