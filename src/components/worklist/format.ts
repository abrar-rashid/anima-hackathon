import { NOT_SUPPLIED, type BreachState, type Rate, type ScanWindow } from '@/ctl/contracts'

export function formatScanWindow(window: ScanWindow): string {
  const siteCount = window.sites.length
  const siteWord = siteCount === 1 ? 'site' : 'sites'
  return `${window.scanned} of ${window.total} resources scanned across ${siteCount} ${siteWord}`
}

export function formatRateWithWindow(rate: Rate, window: ScanWindow): string {
  return `${rate.numerator} of ${rate.denominator} · ${formatScanWindow(window)}`
}

export function formatFraction(rate: Rate): string {
  return `${rate.numerator} of ${rate.denominator} (${rate.numerator}/${rate.denominator})`
}

export function formatDuration(ms: number): string {
  const abs = Math.abs(Math.trunc(ms))
  const minutes = Math.floor(abs / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

export function formatOverdue(overdueMs: number | undefined, breach: BreachState): string {
  if (overdueMs === undefined) {
    return breach === 'no-deadline' ? 'no deadline supplied by source' : NOT_SUPPLIED
  }
  if (overdueMs < 0) return `${formatDuration(overdueMs)} until deadline`
  if (overdueMs === 0) return 'at deadline'
  return `${formatDuration(overdueMs)} past deadline`
}

export function formatSimTime(now: number): string {
  if (!Number.isFinite(now) || now <= 0) return NOT_SUPPLIED
  return new Date(now).toISOString()
}

export function formatCapturedAt(fetchedAt: number): string {
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return NOT_SUPPLIED
  return new Date(fetchedAt).toISOString()
}

export function absent(label: string): string {
  return `${label} ${NOT_SUPPLIED}`
}
