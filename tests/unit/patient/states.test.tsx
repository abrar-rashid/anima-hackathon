// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PatientLoopView } from '@/components/patient/PatientLoopView'
import { buildTimeline } from '@/components/patient/timeline'
import { DISCHARGE_SUMMARY, SITES_FIXTURE, TASK_RESOURCE, makeSourced } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('patient loop timeline ordering', () => {
  it('orders every entry chronologically and each one traces to a real provenance entry', () => {
    const timeline = buildTimeline([TASK_RESOURCE, DISCHARGE_SUMMARY])
    const flat = timeline.flatMap((day) =>
      day.items.flatMap((item) => (item.kind === 'single' ? [item.entry] : item.entries)),
    )
    for (let i = 1; i < flat.length; i += 1) {
      expect(flat[i]!.time).toBeGreaterThanOrEqual(flat[i - 1]!.time)
    }

    const provenanceEntries = [TASK_RESOURCE, DISCHARGE_SUMMARY].flatMap((r) =>
      [r.provenance.created, ...r.provenance.changes].filter(Boolean),
    )
    expect(flat).toHaveLength(provenanceEntries.length)
    for (const entry of flat) {
      const source = provenanceEntries.find(
        (p) => p!.time === entry.time && p!.actor.name === entry.actorName && p!.version === entry.version,
      )
      expect(source).toBeDefined()
    }
  })
})

describe('patient loop first-class states', () => {
  it('renders without throwing when the patient has no findings, tasks or documents', () => {
    const sourced = makeSourced({ tasks: [], findings: [], documents: [], resources: [], timeline: [] })
    expect(() => render(<PatientLoopView initial={sourced} />)).not.toThrow()
  })

  it('renders a stale banner with capture time and a retry control, without throwing', () => {
    const sourced = { ...makeSourced(), stale: true, error: 'HTTP 502 for /api/clock' }
    let container: HTMLElement | undefined
    expect(() => {
      container = render(<PatientLoopView initial={sourced} />).container
    }).not.toThrow()
    const text = container?.textContent ?? ''
    expect(text).toContain('Showing the last successful read')
    expect(text.toLowerCase()).toContain('retry')
  })

  it('names the failed sites and still renders what did return, without throwing', () => {
    const sourced = makeSourced({
      window: { scanned: 1, total: 300, sites: ['gp'], now: 0, failedSites: ['hospital'] },
    })
    let container: HTMLElement | undefined
    expect(() => {
      container = render(<PatientLoopView initial={sourced} />).container
    }).not.toThrow()
    const text = container?.textContent ?? ''
    expect(text).toContain('Some sites did not return')
    expect(text).toContain(SITES_FIXTURE.find((s) => s.id === 'hospital')?.name as string)
  })

  it('renders a hard read failure without throwing and without inventing a record', () => {
    const sourced = makeSourced({ resources: [], tasks: [], findings: [], documents: [] })
    const failed = { ...sourced, error: 'HTTP 502 for /api/sites/gp/view' }
    let container: HTMLElement | undefined
    expect(() => {
      container = render(<PatientLoopView initial={failed} />).container
    }).not.toThrow()
    const text = container?.textContent ?? ''
    expect(text).toContain('could not be read')
    expect(text).toContain('No invented record was substituted')
  })

  it('renders an unmatched free-text candidate without a highlight rather than guessing a location', () => {
    const badQuote = {
      tag: 'contact-patient' as const,
      summary: 'A candidate whose quote does not appear verbatim',
      patientId: 'SIM-000001',
      citation: {
        resourceId: DISCHARGE_SUMMARY.id,
        version: 1,
        site: 'hospital' as const,
        field: 'data.sections.followUp',
        quote: 'this exact text is not present in the section',
      },
      priority: 'standard' as const,
      snomedId: 'not-supplied-by-source' as const,
    }
    const sourced = makeSourced({ extraction: { tasks: [badQuote], reason: null, spansRead: 7, resourcesRead: 1 } })
    let container: HTMLElement | undefined
    expect(() => {
      container = render(<PatientLoopView initial={sourced} />).container
    }).not.toThrow()
    expect(container?.querySelectorAll('a[href^="#discharge-summary-example"]')).toHaveLength(0)
    const text = container?.textContent ?? ''
    expect(text).toContain(badQuote.summary)
  })
})
