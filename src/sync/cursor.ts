import type { SiteId } from '@/domain/types'
import type { SimulatorClock } from '@/ports/anima-read-port'

/**
 * Simulator epoch for the captured team world (`team-ea32f6302052`).
 * The world runs PAUSED at speed 60 from this base; wall-clock is not
 * a valid high-water for "what changed since we last looked".
 */
export const SIMULATOR_EPOCH_MS = 1_789_286_400_000

export const SYNC_SITES: SiteId[] = [
  'gp',
  'hospital',
  'community',
  'pharmacy',
  'diagnostics',
  'referrals',
  'wearables',
]

export interface SyncCursorKey {
  world: string
  team: string
  site: SiteId
  patientId: string
}

export type SyncClockSnapshot = SimulatorClock

/**
 * Per-site, per-patient resume state. `highWaterSimulatorTime` is the last
 * completed pass's simulator `now`. `pageOffset` + `seen` let a mid-pagination
 * interrupt resume without losing or re-emitting work.
 */
export interface SyncCursor {
  world: string
  team: string
  site: SiteId
  patientId: string
  highWaterSimulatorTime: number
  pageOffset: number
  seen: Record<string, number>
  clock: SyncClockSnapshot
}

export interface SyncCursorRepository {
  get(key: SyncCursorKey): Promise<SyncCursor | null>
  put(cursor: SyncCursor): Promise<void>
}

export function cursorStorageKey(key: SyncCursorKey): string {
  return `${key.world}|${key.team}|${key.site}|${key.patientId}`
}

export function emptyCursor(key: SyncCursorKey, clock?: SyncClockSnapshot): SyncCursor {
  return {
    world: key.world,
    team: key.team,
    site: key.site,
    patientId: key.patientId,
    highWaterSimulatorTime: 0,
    pageOffset: 0,
    seen: {},
    clock: clock ? { ...clock } : { now: 0, paused: true, speed: 0 },
  }
}

export function cloneCursor(cursor: SyncCursor): SyncCursor {
  return {
    ...cursor,
    seen: { ...cursor.seen },
    clock: { ...cursor.clock },
  }
}

export class MemorySyncCursorRepository implements SyncCursorRepository {
  private readonly store = new Map<string, SyncCursor>()

  async get(key: SyncCursorKey): Promise<SyncCursor | null> {
    const stored = this.store.get(cursorStorageKey(key))
    return stored ? cloneCursor(stored) : null
  }

  async put(cursor: SyncCursor): Promise<void> {
    this.store.set(cursorStorageKey(cursor), cloneCursor(cursor))
  }
}

export function isSyncSite(value: string): value is SiteId {
  return (SYNC_SITES as string[]).includes(value)
}
