import type { AnimaReadPort, VersionedRecord } from '@/ports/anima-read-port'
import {
  cloneCursor,
  type SyncCursor,
  type SyncCursorRepository,
} from '@/sync/cursor'
import { detectChanges, recordVersion, type ResourceChange } from '@/sync/diff'

export const DEFAULT_PAGE_LIMIT = 100
const MAX_PAGES_PER_PASS = 50

/** Compose on the current read port; do not depend on in-flight extras. */
export type SyncReadPort = Pick<AnimaReadPort, 'getClock' | 'getSiteRecords'>

export interface PullPageInfo {
  total: number
  offset: number
  fetched: number
  limit: number
}

export interface PullResult {
  records: VersionedRecord[]
  cursor: SyncCursor
  page: PullPageInfo
  complete: boolean
}

export interface SyncPassResult {
  records: VersionedRecord[]
  changes: ResourceChange[]
  cursor: SyncCursor
  pages: number
}

function compareRecords(a: VersionedRecord, b: VersionedRecord): number {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id)
}

function pageCursor(offset: number): string | undefined {
  return offset > 0 ? String(offset) : undefined
}

export async function pullIncremental(
  read: SyncReadPort,
  cursor: SyncCursor,
  options?: { pageLimit?: number },
): Promise<PullResult> {
  const pageLimit = options?.pageLimit ?? DEFAULT_PAGE_LIMIT
  const clock = await read.getClock()
  const page = await read.getSiteRecords(cursor.site, cursor.patientId, pageCursor(cursor.pageOffset))
  const window = page.items.slice(0, pageLimit).slice().sort(compareRecords)
  const records = window.filter((item) => (cursor.seen[item.id] ?? 0) < recordVersion(item))

  const seen = { ...cursor.seen }
  for (const item of window) {
    const version = recordVersion(item)
    const previous = seen[item.id] ?? 0
    if (version > previous) seen[item.id] = version
  }

  const nextOffset = page.offset + window.length
  const exhausted = window.length === 0 || nextOffset >= page.total
  const next: SyncCursor = {
    ...cloneCursor(cursor),
    seen,
    pageOffset: exhausted ? 0 : nextOffset,
    clock: { now: clock.now, paused: clock.paused, speed: clock.speed },
    highWaterSimulatorTime: exhausted
      ? Math.max(cursor.highWaterSimulatorTime, clock.now)
      : cursor.highWaterSimulatorTime,
  }

  return {
    records,
    cursor: next,
    complete: exhausted,
    page: {
      total: page.total,
      offset: page.offset,
      fetched: window.length,
      limit: pageLimit,
    },
  }
}

export async function runSyncPass(
  read: SyncReadPort,
  cursor: SyncCursor,
  options?: { pageLimit?: number; store?: SyncCursorRepository },
): Promise<SyncPassResult> {
  let current = cloneCursor(cursor)
  const records: VersionedRecord[] = []
  const changes: ResourceChange[] = []
  let pages = 0
  let catalog = { versions: { ...current.seen } }

  while (pages < MAX_PAGES_PER_PASS) {
    const page = await pullIncremental(read, current, options)
    pages += 1
    const detected = detectChanges(catalog, page.records)
    records.push(...page.records)
    changes.push(...detected.changes)
    catalog = detected.catalog
    current = page.cursor
    if (options?.store) await options.store.put(current)
    if (page.complete) break
  }

  return { records, changes, cursor: current, pages }
}
