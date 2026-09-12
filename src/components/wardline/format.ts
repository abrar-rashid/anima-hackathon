import type { WardlineTask } from './types'

export function initialsOf(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0]! + (parts[1] ?? '')).toUpperCase()
}

export function formatDeadline(dueAt: number | null, now: number): string {
  if (!dueAt) return 'No deadline'
  const delta = dueAt - now
  const abs = Math.abs(delta)
  const hours = Math.round(abs / 3_600_000)
  if (hours < 1) return delta < 0 ? 'Overdue' : 'Due now'
  if (hours < 48) return delta < 0 ? `${hours}h overdue` : `Due in ${hours}h`
  const days = Math.round(hours / 24)
  return delta < 0 ? `${days}d overdue` : `Due in ${days}d`
}

export function formatBirthDate(value: string | undefined): string | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function priorityTone(priority: string | null): 'emergency' | 'urgent' | 'standard' | 'none' {
  const value = (priority ?? '').toLowerCase()
  if (value === 'emergency') return 'emergency'
  if (value === 'urgent') return 'urgent'
  if (value === 'standard' || value === 'routine') return 'standard'
  return 'none'
}

export function siteLabel(site: string): string {
  return site.replace(/-/g, ' ')
}

export function evidenceText(task: WardlineTask): string {
  const citation = task.citations[0]
  if (!citation) return 'No source citation on this finding.'
  const quote = citation.quote?.trim()
  if (quote) return quote
  return `${citation.site} record ${citation.resourceId} v${citation.version}${
    citation.field ? ` · ${citation.field}` : ''
  }`
}

export function percent(numerator: number, denominator: number): string {
  if (denominator === 0) return '—'
  return `${Math.round((numerator / denominator) * 100)}%`
}
