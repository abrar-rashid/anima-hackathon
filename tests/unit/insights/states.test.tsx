// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { InsightsView } from '@/components/insights'
import { LoopBreakage } from '@/components/insights'
import { makeInsights, makeWindow, SITES_FIXTURE } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('insights loop breakage counters', () => {
  it('always renders each rate as a numerator-of-denominator fraction, never a bare count', () => {
    const { container } = render(
      <LoopBreakage rates={[{ label: 'referrals never accepted', numerator: 5, denominator: 60 }]} />,
    )
    expect(container.textContent).toContain('5 of 60 (5/60)')
  })

  it('renders an explicit message rather than a blank panel when no breakage rates were returned', () => {
    expect(() => render(<LoopBreakage rates={[]} />)).not.toThrow()
  })
})

describe('insights first-class states', () => {
  it('renders an explicit empty state for step latency and loop breakage, without throwing', () => {
    const insights = makeInsights({
      report: { steps: [], breakage: [], window: makeWindow() },
    })
    let container: HTMLElement | undefined
    expect(() => {
      container = render(<InsightsView initial={insights} />).container
    }).not.toThrow()
    const text = container?.textContent ?? ''
    expect(text).toContain('No provenance transitions were observed in this scan window')
    expect(text).toContain('No breakage rates were returned for this scan window')
  })

  it('renders a stale banner with capture time and a retry control, without throwing', () => {
    const insights = makeInsights()
    const stale = { ...insights, stale: true, error: 'HTTP 502 for /api/clock' }
    let container: HTMLElement | undefined
    expect(() => {
      container = render(<InsightsView initial={stale} />).container
    }).not.toThrow()
    const text = container?.textContent ?? ''
    expect(text).toContain('Showing the last successful scan')
    expect(text.toLowerCase()).toContain('retry')
  })

  it('names the failed sites and still renders the steps that did return, without throwing', () => {
    const insights = makeInsights({
      report: {
        steps: makeInsights().data.report.steps,
        breakage: makeInsights().data.report.breakage,
        window: makeWindow({ failedSites: ['hospital'] }),
      },
    })
    let container: HTMLElement | undefined
    expect(() => {
      container = render(<InsightsView initial={insights} />).container
    }).not.toThrow()
    const text = container?.textContent ?? ''
    expect(text).toContain('Some sites did not return')
    expect(text).toContain(SITES_FIXTURE.find((site) => site.id === 'hospital')?.name)
  })
})
