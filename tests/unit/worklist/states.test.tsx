// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorklistHeader, WorklistView } from '@/components/worklist'
import { FINDING_TASK, SITES_FIXTURE, makeWindow, makeWorklist } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('worklist header counters', () => {
  it('always shows a denominator and scan window, whether or not a matching rate exists', () => {
    const window = makeWindow()
    const { container: withoutRates } = render(<WorklistHeader rates={[]} window={window} />)
    const withoutText = withoutRates.textContent ?? ''
    // No summariseFindings rate matched any counter, but the window figures
    // still carry a real denominator rather than a bare number.
    expect(withoutText).toContain(`${window.scanned}`)
    expect(withoutText).toContain(`${window.total}`)
    expect(withoutText).toContain('resources scanned across')
    cleanup()

    const { container: withRates } = render(
      <WorklistHeader
        rates={[{ label: 'breached deadlines', numerator: 3, denominator: 40 }]}
        window={window}
      />,
    )
    const withText = withRates.textContent ?? ''
    expect(withText).toContain('3 of 40')
    expect(withText).toContain('resources scanned across')
  })
})

describe('worklist first-class states', () => {
  it('renders an explicit empty state naming the scan window, without throwing', () => {
    const worklist = makeWorklist({ findings: [] })
    expect(() => render(<WorklistView initial={worklist} />)).not.toThrow()
  })

  it('renders a stale banner with capture time and a retry control, without throwing', () => {
    const worklist = makeWorklist()
    const stale = { ...worklist, stale: true, error: 'HTTP 502 for /api/clock' }
    let container: HTMLElement | undefined
    expect(() => {
      container = render(<WorklistView initial={stale} />).container
    }).not.toThrow()
    const text = container?.textContent ?? ''
    expect(text).toContain('Showing the last successful scan')
    expect(text.toLowerCase()).toContain('retry')
  })

  it('names the failed sites and still renders the findings that did return, without throwing', () => {
    const worklist = makeWorklist({ window: makeWindow({ failedSites: ['pharmacy'] }) })
    let container: HTMLElement | undefined
    expect(() => {
      container = render(<WorklistView initial={worklist} />).container
    }).not.toThrow()
    const text = container?.textContent ?? ''
    expect(text).toContain('Some sites did not return')
    expect(text).toContain(SITES_FIXTURE.find((site) => site.id === 'pharmacy')?.name)
    expect(text).toContain(FINDING_TASK.summary)
  })

  it('renders a hard scan failure without throwing and without inventing a worklist', () => {
    const worklist = makeWorklist({ findings: [], rates: [] })
    const failed = { ...worklist, error: 'HTTP 502 for /api/sites/gp/view' }
    let container: HTMLElement | undefined
    expect(() => {
      container = render(<WorklistView initial={failed} />).container
    }).not.toThrow()
    const text = container?.textContent ?? ''
    expect(text).toContain('could not be read')
    expect(text).toContain('No invented worklist was substituted')
  })
})
