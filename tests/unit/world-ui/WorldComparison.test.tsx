// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorldComparison } from '@/components/world/WorldComparison'
import { acceptedSnapshot, snapshot } from './fixtures'

const T0 = 1_789_286_400_000
const MINUTE = 60_000

afterEach(() => {
  cleanup()
})

describe('WorldComparison', () => {
  it('shows two societies from the supplied series, not hard-coded protocol numbers', () => {
    const leftEarly = snapshot({
      now: T0,
      entities: [snapshot().entities[0] ? { ...snapshot().entities[0], neglectMinutes: 0, exceptionCount: 0 } : snapshot().entities[0]!],
    })
    const leftLate = snapshot({
      now: T0 + 90 * MINUTE,
      entities: [{ ...snapshot().entities[0]!, neglectMinutes: 91, exceptionCount: 3 }],
    })
    const rightEarly = acceptedSnapshot()
    rightEarly.now = T0
    rightEarly.entities = [{ ...rightEarly.entities[0]!, neglectMinutes: 0, exceptionCount: 0 }]
    const rightLate = acceptedSnapshot()
    rightLate.now = T0 + 90 * MINUTE
    rightLate.entities = [{ ...rightLate.entities[0]!, neglectMinutes: 6, exceptionCount: 0 }]

    render(
      <WorldComparison
        left={{ heading: 'Series ochre', snapshots: [leftEarly, leftLate] }}
        right={{ heading: 'Series teal', snapshots: [rightEarly, rightLate] }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Series ochre' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Series teal' })).toBeTruthy()
    const left = screen.getByRole('region', { name: 'Series ochre' })
    const right = screen.getByRole('region', { name: 'Series teal' })
    expect(within(left).getByText('91')).toBeTruthy()
    expect(within(right).getByText('6')).toBeTruthy()
    expect(screen.queryByText('240')).toBeNull()
    expect(screen.queryByText('25')).toBeNull()

    fireEvent.change(screen.getByRole('slider'), { target: { value: String(T0) } })
    expect(within(left).getAllByText('0').length).toBeGreaterThan(0)
    expect(within(right).getAllByText('0').length).toBeGreaterThan(0)
  })
})
