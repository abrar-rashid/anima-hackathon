import { describe, expect, it } from 'vitest'
import {
  formatBirthDate,
  formatDeadline,
  initialsOf,
  percent,
  priorityTone,
} from '@/components/wardline/format'

const HOUR = 3_600_000
const now = Date.UTC(2026, 8, 12, 12, 0, 0)

describe('initialsOf', () => {
  it('takes the first letters of the first two name parts', () => {
    expect(initialsOf('Eleanor Chen')).toBe('EC')
    expect(initialsOf('Amira Khan Ali')).toBe('AK')
    expect(initialsOf('amira khan')).toBe('AK')
  })

  it('uses a single initial when only one part is present', () => {
    expect(initialsOf('Eleanor')).toBe('E')
  })

  it('returns ? when the name has no letters', () => {
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
  })
})

describe('formatDeadline', () => {
  it('labels a missing deadline', () => {
    expect(formatDeadline(null, now)).toBe('No deadline')
  })

  it('labels overdue work by elapsed time', () => {
    expect(formatDeadline(now - 20 * 60 * 1000, now)).toBe('Overdue')
    expect(formatDeadline(now - 3 * HOUR, now)).toBe('3h overdue')
    expect(formatDeadline(now - 72 * HOUR, now)).toBe('3d overdue')
  })

  it('labels due-soon work relative to now', () => {
    expect(formatDeadline(now + 20 * 60 * 1000, now)).toBe('Due now')
    expect(formatDeadline(now + 2 * HOUR, now)).toBe('Due in 2h')
    expect(formatDeadline(now + 72 * HOUR, now)).toBe('Due in 3d')
  })
})

describe('formatBirthDate', () => {
  it('formats a valid ISO calendar date in en-GB UTC', () => {
    expect(formatBirthDate('1990-03-15')).toBe('15 March 1990')
  })

  it('passes through an invalid date string', () => {
    expect(formatBirthDate('not-a-date')).toBe('not-a-date')
  })

  it('returns null when the date is missing', () => {
    expect(formatBirthDate(undefined)).toBeNull()
  })
})

describe('priorityTone', () => {
  it('maps known priorities, treating routine as standard', () => {
    expect(priorityTone('emergency')).toBe('emergency')
    expect(priorityTone('URGENT')).toBe('urgent')
    expect(priorityTone('standard')).toBe('standard')
    expect(priorityTone('routine')).toBe('standard')
  })

  it('returns none for missing or unknown priorities', () => {
    expect(priorityTone(null)).toBe('none')
    expect(priorityTone('unknown')).toBe('none')
  })
})

describe('percent', () => {
  it('rounds the ratio to a percentage', () => {
    expect(percent(1, 4)).toBe('25%')
    expect(percent(1, 3)).toBe('33%')
  })

  it('returns an em dash when the denominator is 0', () => {
    expect(percent(0, 0)).toBe('—')
    expect(percent(5, 0)).toBe('—')
  })
})
