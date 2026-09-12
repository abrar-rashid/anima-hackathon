// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { InsightsView } from '@/components/insights'
import { BREAKAGE_HANDOVERS, STEP_ACCEPT_TO_COMPLETE, STEP_SENT_TO_REVIEW, makeInsights } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('insights honesty', () => {
  it('renders only step labels, counts and rates present in the fixture, never a bare percentage', () => {
    const { container } = render(<InsightsView initial={makeInsights()} />)
    const text = container.textContent ?? ''

    expect(text).toContain(STEP_ACCEPT_TO_COMPLETE.label)
    expect(text).toContain(`n = ${STEP_ACCEPT_TO_COMPLETE.n}`)
    expect(text).toContain(STEP_SENT_TO_REVIEW.label)
    expect(text).toContain(`n = ${STEP_SENT_TO_REVIEW.n}`)

    // Loop breakage is a cited fraction, never a computed percentage.
    expect(text).toContain(
      `${BREAKAGE_HANDOVERS.numerator} of ${BREAKAGE_HANDOVERS.denominator} (${BREAKAGE_HANDOVERS.numerator}/${BREAKAGE_HANDOVERS.denominator})`,
    )
    expect(text).not.toMatch(/\d+(\.\d+)?%/)
  })

  it('ranks bottlenecks worst-median-first, matching the fixture ordering', () => {
    const { container } = render(<InsightsView initial={makeInsights()} />)
    const rankItems = [...container.querySelectorAll('[class*="rank"]')].map((el) => el.textContent ?? '')
    const sentIndex = rankItems.findIndex((text) => text.includes(STEP_SENT_TO_REVIEW.label))
    const acceptIndex = rankItems.findIndex((text) => text.includes(STEP_ACCEPT_TO_COMPLETE.label))
    expect(sentIndex).toBeGreaterThanOrEqual(0)
    expect(acceptIndex).toBeGreaterThanOrEqual(0)
    expect(sentIndex).toBeLessThan(acceptIndex)
  })

  it('states the scan window and the synthetic nature of the world', () => {
    const { container } = render(<InsightsView initial={makeInsights()} />)
    const text = container.textContent ?? ''
    expect(text).toContain('512')
    expect(text).toContain('375868')
    expect(text.toLowerCase()).toContain('synthetic')
    expect(text.toLowerCase()).toContain('fictional')
  })
})
