// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AccessibleNeighbourhood } from '@/components/neighbourhood/AccessibleNeighbourhood'
import { SiteDrawer } from '@/components/neighbourhood/SiteDrawer'
import { permittedSiteLabels } from '@/components/neighbourhood/assemble'
import { signLinesFor } from '@/components/neighbourhood/bake-layers'
import { CAPTURED_CATALOGUE } from '@/components/neighbourhood/captured-catalogue'
import { GATES } from '@/components/neighbourhood/layout'
import { FIXTURE_CATALOGUE, fixtureModel } from './fixture-town'

/**
 * The honesty test.
 *
 * No label the town renders — on a building sign, in the drawer, or in the data
 * tables — may be a site name that the catalogue input did not supply. The
 * previous town failed exactly this, inventing "St. Jude's Acute Hospital" for
 * a site the simulator calls "Northbank General".
 */

afterEach(() => {
  cleanup()
})

/** Every site string any input actually supplied. Nothing else may be shown. */
function permittedFromInputs(): Set<string> {
  const allowed = new Set<string>()
  for (const descriptor of FIXTURE_CATALOGUE) {
    allowed.add(descriptor.id)
    if (descriptor.name) allowed.add(descriptor.name)
    if (descriptor.subtitle) {
      allowed.add(descriptor.subtitle)
      for (const part of descriptor.subtitle.split('·')) allowed.add(part.trim())
    }
  }
  for (const [id, captured] of Object.entries(CAPTURED_CATALOGUE)) {
    allowed.add(id)
    allowed.add(captured.name)
    allowed.add(captured.subtitle)
    for (const part of captured.subtitle.split('·')) allowed.add(part.trim())
  }
  for (const site of ['gp', 'hospital', 'community', 'pharmacy', 'diagnostics', 'referrals', 'wearables']) {
    allowed.add(site)
  }
  return allowed
}

/** Names the previous build invented. None may reappear. */
const INVENTED = [
  "St. Jude's",
  'St. Jude',
  'City Pathology',
  'High Street GP Practice',
  'Community Care Pharmacy',
  'Remote Telemetry',
  'Telemetry Hub',
  'Khan Cottage',
  'Rehab Pavilion',
  'Specialist Referrals Center',
  'Riverside General',
  'Northbank Practice',
]

describe('rendered site labels trace to the catalogue input', () => {
  const model = fixtureModel()
  const allowed = permittedFromInputs()

  it('shows only names an input supplied, in the data tables', () => {
    const { container } = render(<AccessibleNeighbourhood model={model} />)
    const rows = container.querySelectorAll('[data-row-site]')
    expect(rows.length).toBe(7)

    for (const row of rows) {
      const cells = [...row.querySelectorAll('th, td')].map((cell) => cell.textContent?.trim() ?? '')
      const signName = cells[0]!
      const catalogueName = cells[3]!
      const subtitle = cells[4]!

      expect(allowed.has(signName)).toBe(true)
      if (catalogueName !== 'not supplied by source') expect(allowed.has(catalogueName)).toBe(true)
      if (subtitle !== 'not supplied by source') expect(allowed.has(subtitle)).toBe(true)
    }
  })

  it('shows only names an input supplied, in the drawer', () => {
    for (const site of model.sites) {
      const { container } = render(
        <SiteDrawer site={site} model={model} onClose={() => undefined} />,
      )
      const heading = container.querySelector('h2')?.textContent?.trim() ?? ''
      expect(allowed.has(heading)).toBe(true)
      cleanup()
    }
  })

  it('puts only sourced text on a building sign', () => {
    const labels = permittedSiteLabels(model)
    const uppercased = labels.map((label) => label.toUpperCase())
    for (const site of model.sites) {
      const lines = signLinesFor(site)
      if (lines.length === 0) {
        // No source named the site, so the sign carries only its real site id.
        expect(site.placeName).toBeNull()
        continue
      }
      const joined = lines.join(' ')
      expect(uppercased.some((label) => label.includes(joined))).toBe(true)
      expect(joined).toBe(site.placeName!.toUpperCase())
    }
  })

  it('never reintroduces a name the previous build invented', () => {
    render(<AccessibleNeighbourhood model={model} />)
    const text = document.body.textContent ?? ''
    for (const invented of INVENTED) {
      expect(text).not.toContain(invented)
    }
    // And the real ones are actually there.
    expect(text).toContain('Riverside Practice')
    expect(text).toContain('Northbank General')
    expect(text).toContain('High Street Pharmacy')
  })

  it('says a name is missing rather than borrowing one', () => {
    render(<AccessibleNeighbourhood model={model} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('no source named this site; showing its site id')
    const diagnostics = model.sites.find((site) => site.site === 'diagnostics')!
    expect(diagnostics.placeName).toBeNull()
  })

  it('labels a signpost with a real scope id and nothing else', () => {
    for (const [id, gate] of Object.entries(GATES)) {
      expect(gate.id).toBe(id)
      expect(id).toMatch(/^[a-z]+$/)
    }
  })

  it('carries a denominator on every count it renders', () => {
    render(<AccessibleNeighbourhood model={model} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('resources scanned')
    expect(text).toMatch(/\d[\d,]* of \d[\d,]* resources scanned/)
    expect(text).toContain('Unclosed means')
    expect(text).toContain('it carries no clinical meaning')
  })

  it('restates only real event fields in the paper trail', () => {
    const { container } = render(<AccessibleNeighbourhood model={model} />)
    const rows = container.querySelectorAll('[data-row-doc]')
    expect(rows.length).toBeGreaterThan(0)
    const byId = new Map(model.docs.map((doc) => [doc.eventId, doc]))
    for (const row of rows) {
      const id = row.getAttribute('data-row-doc')!
      const doc = byId.get(id)!
      const text = row.textContent ?? ''
      expect(text).toContain(doc.type)
      expect(text).toContain(doc.chain.join(' → '))
      if (doc.detail) expect(text).toContain(doc.detail)
      else expect(text).toContain('not supplied by source')
    }
  })

  it('renders an explicitly labelled empty town when every read failed', () => {
    const model = fixtureModel({
      catalogue: null,
      overrides: {
        gp: { resources: [], total: 0, events: [], error: 'HTTP 502' },
        hospital: { resources: [], total: 0, events: [], error: 'HTTP 502' },
        community: { resources: [], total: 0, events: [], error: 'HTTP 502' },
        pharmacy: { resources: [], total: 0, events: [], error: 'HTTP 502' },
        diagnostics: { resources: [], total: 0, events: [], error: 'HTTP 502' },
        referrals: { resources: [], total: 0, events: [], error: 'HTTP 502' },
        wearables: { resources: [], total: 0, events: [], error: 'HTTP 502' },
      },
    })
    render(<AccessibleNeighbourhood model={model} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('HTTP 502')
    expect(text).toContain('No unclosed record in the scanned windows.')
    // Still names the sites, and still refuses to invent the two it cannot name.
    expect(text).toContain('Riverside Practice')
    expect(text).toContain('no source named this site; showing its site id')
  })
})
