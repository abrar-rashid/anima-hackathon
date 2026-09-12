/**
 * Display helpers.
 *
 * All times render in UTC. The simulator's `now` is an absolute instant and
 * formatting it in the viewer's local zone would make two people describing the
 * same screen disagree about what time the town says it is.
 */

export function formatSimTime(ms: number): string {
  const iso = new Date(ms).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

export function formatClockTime(ms: number): string {
  return `${new Date(ms).toISOString().slice(11, 16)} UTC`
}

/** Elapsed time, largest two units. Returns null rather than guessing at zero. */
export function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'under a minute'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-GB')
}

/** "12 of 300 scanned" — a count is never shown without its denominator. */
export function withDenominator(numerator: number, denominator: number, noun: string): string {
  return `${formatCount(numerator)} of ${formatCount(denominator)} ${noun}`
}

export const BREACH_LABEL: Record<string, string> = {
  breached: 'past its deadline',
  'due-soon': 'due within 12h',
  'on-time': 'deadline ahead',
  'no-deadline': 'no deadline supplied',
}

/** How a site's displayed name was sourced. Shown next to the name, always. */
export const SOURCE_LABEL: Record<string, string> = {
  catalogue: 'live from /api/catalogue',
  capture: 'last-known capture of /api/catalogue',
  'site-id': 'name not supplied by source; showing site id',
  palette: 'presentation colour, not from source',
}
