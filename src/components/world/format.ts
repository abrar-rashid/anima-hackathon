import type { WorldSnapshot, WorldThread } from '@/world/types'

export function formatSimulatorTime(ms: number): string {
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return `unreadable simulator time (${String(ms)})`
  return date.toISOString()
}

export type NeglectBand = 'fresh' | 'dust' | 'crack' | 'rot'

/** Visual encoding of neglectMinutes. Thresholds are display scale, not protocol facts. */
export function neglectBand(minutes: number): NeglectBand {
  if (minutes <= 0) return 'fresh'
  if (minutes < 30) return 'dust'
  if (minutes < 120) return 'crack'
  return 'rot'
}

export function rotPixelCount(minutes: number): number {
  if (minutes <= 0) return 0
  return Math.min(18, Math.floor(minutes / 16))
}

export function directionPhrase(direction: 'above' | 'below'): string {
  return direction === 'above'
    ? 'above the source-supplied reference range'
    : 'below the source-supplied reference range'
}

export const THREAD_STATE_LABEL: Record<WorldThread['state'], string> = {
  REQUESTED: 'Transfer requested — stitch in transit',
  ACCEPTED: 'Accepted — stitch intact',
  DECLINED: 'Declined — stitch cut',
  OVERDUE: 'Overdue — stitch frayed',
  RECEIVER_UNAVAILABLE: 'Receiver unavailable — stitch gated',
  STALE: 'Stale — stitch faded',
}

export function snapshotAtOrBefore(series: WorldSnapshot[], t: number): WorldSnapshot | null {
  if (series.length === 0) return null
  let chosen: WorldSnapshot | null = null
  for (const snap of series) {
    if (snap.now <= t) chosen = snap
  }
  return chosen ?? series[0] ?? null
}

export function seriesTimeRange(seriesList: WorldSnapshot[][]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const series of seriesList) {
    for (const snap of series) {
      if (snap.now < min) min = snap.now
      if (snap.now > max) max = snap.now
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return { min, max }
}

export function clockPhrase(paused: boolean, speed: number): string {
  if (paused) return `Clock paused at speed ${String(speed)}`
  return `Clock running at speed ${String(speed)}`
}
