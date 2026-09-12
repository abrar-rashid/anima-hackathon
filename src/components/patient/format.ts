import { NOT_SUPPLIED } from '@/ctl/contracts'
import { humanInterval } from '@/ctl/detect'

/**
 * Small, pure display helpers for the patient loop.
 *
 * No fallback here is a plausible-looking value: every function either
 * formats a real input or returns the literal `NOT_SUPPLIED` marker so the UI
 * can render an explicit absence rather than a default.
 */

export function absent(label: string): string {
  return `${label} ${NOT_SUPPLIED}`
}

export function formatAge(age: number | undefined): string {
  return age === undefined ? absent('age') : String(age)
}

/** Time relative to the simulator clock, never wall clock. */
export function relativeToNow(time: number | undefined, now: number): string {
  if (time === undefined || !Number.isFinite(time) || !Number.isFinite(now)) return NOT_SUPPLIED
  const diff = now - time
  if (diff === 0) return 'at simulator now'
  return diff > 0 ? `${humanInterval(diff)} ago` : `in ${humanInterval(-diff)}`
}

export function formatSimTime(time: number | undefined): string {
  if (time === undefined || !Number.isFinite(time)) return NOT_SUPPLIED
  return new Date(time).toISOString()
}

export function formatDayLabel(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return dayKey
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatLocalIdLabel(key: string): string {
  return key.length === 0 ? key : key[0]!.toUpperCase() + key.slice(1)
}

export function formatCapturedAt(fetchedAt: number): string {
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0) return NOT_SUPPLIED
  return new Date(fetchedAt).toISOString()
}

/** Coarse plain-language label for a hard stop reason. Never a raw enum on screen. */
const HARD_STOP_LABELS: Record<string, string> = {
  'patient-mismatch': 'This proposal is not built for this patient.',
  'destination-mismatch': 'The destination site does not match the source record.',
  'missing-staff-identity': 'No staff identity is available to attribute this action to.',
  'source-absent': 'The record this proposal was built from could not be found.',
  'source-not-current': 'The source record has changed since this proposal was built.',
  'unsupported-action': 'This action type is not available in the live API right now.',
  'missing-required-field': 'A field this action requires is missing.',
  'idempotency-conflict': 'This action was already submitted with different values.',
  'stale-source-version': 'The source version this proposal used is out of date.',
  'requires-clinical-interpretation':
    'Completing this would require clinical judgement the agent will not make.',
}

export function formatHardStop(stop: string): string {
  return HARD_STOP_LABELS[stop] ?? `Blocked: ${stop}`
}
