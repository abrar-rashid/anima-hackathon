import { describe, expect, it } from 'vitest'
import { GATES, anchorFor, isSiteScope, routeBetween, SITE_PLOTS } from '@/components/neighbourhood/layout'
import { documentsFrom } from '@/components/neighbourhood/assemble'
import { OPEN_STATUSES } from '@/components/neighbourhood/model'
import {
  FIXTURE_CATALOGUE,
  FIXTURE_NOW,
  fixtureClockEvents,
  fixtureModel,
  fixtureResources,
  fixtureSiteReads,
} from './fixture-town'

/**
 * These assert the mapping from real captured payloads to buildings, which is
 * where a silent error would put one site's work above another site's roof.
 * Rendering internals and animation timing are deliberately not tested.
 */

describe('town assembly from real fixture payloads', () => {
  const model = fixtureModel()

  it('draws exactly the seven catalogue sites, in map order', () => {
    expect(model.sites.map((site) => site.site)).toEqual([
      'gp',
      'hospital',
      'community',
      'pharmacy',
      'diagnostics',
      'referrals',
      'wearables',
    ])
    for (const site of model.sites) {
      expect(SITE_PLOTS[site.site]).toBeDefined()
    }
  })

  it('puts each site view resource on the building that returned it', () => {
    const gp = model.sites.find((site) => site.site === 'gp')!
    const hospital = model.sites.find((site) => site.site === 'hospital')!

    const gpIds = new Set(fixtureResources('gp').map((resource) => resource.id))
    const hospitalIds = new Set(fixtureResources('hospital').map((resource) => resource.id))

    for (const item of gp.work) {
      expect(gpIds.has(item.resourceId)).toBe(true)
      expect(hospitalIds.has(item.resourceId)).toBe(false)
    }
    for (const item of hospital.work) {
      expect(hospitalIds.has(item.resourceId)).toBe(true)
    }
  })

  it('carries each site total alongside what it actually scanned', () => {
    const gp = model.sites.find((site) => site.site === 'gp')!
    expect(gp.scanned).toBe(fixtureResources('gp').length)
    expect(gp.total).toBe(378389)
    expect(gp.total).toBeGreaterThan(gp.scanned)
    expect(model.scan.scanned).toBeLessThan(model.scan.total)
  })

  it('counts resource kinds from the scanned window', () => {
    const referrals = model.sites.find((site) => site.site === 'referrals')!
    const kinds = new Map(referrals.kinds.map((entry) => [entry.kind, entry.count]))
    expect(kinds.get('referral')).toBe(16)
    expect(kinds.get('capacity')).toBe(12)
  })

  it('treats only declared open statuses as unclosed', () => {
    for (const site of model.sites) {
      for (const item of site.work) {
        expect(OPEN_STATUSES).toContain(item.status.toLowerCase())
      }
    }
    // The pharmacy head window is a good check: plenty of `available` stock
    // records that must not be mistaken for outstanding work.
    const pharmacy = model.sites.find((site) => site.site === 'pharmacy')!
    expect(pharmacy.work.every((item) => item.status !== 'available')).toBe(true)
    expect(pharmacy.work.length).toBeGreaterThan(0)
  })

  it('derives breach state from the record dueAt only', () => {
    const gp = model.sites.find((site) => site.site === 'gp')!
    const task = gp.work.find((item) => item.resourceId === 'r-2')
    expect(task).toBeDefined()
    expect(task!.dueAt).toBe(1789286400000)
    expect(task!.dueAt! < FIXTURE_NOW).toBe(true)
    expect(task!.breach).toBe('breached')
    expect(task!.overdueMs).toBe(FIXTURE_NOW - 1789286400000)
    // Source-supplied priority is carried, never replaced or inferred.
    expect(task!.priority).toBe('urgent')
  })

  it('never invents an owner or a priority the source omitted', () => {
    const source = new Map(
      fixtureResources('community').map((resource) => [resource.id, resource]),
    )
    const community = model.sites.find((site) => site.site === 'community')!
    for (const item of community.work) {
      const original = source.get(item.resourceId)!
      expect(item.owner).toBe(original.owner ?? null)
      expect(item.priority).toBe(original.priority ?? null)
    }
  })

  it('orders markers worst deadline first', () => {
    const rank = { breached: 0, 'due-soon': 1, 'on-time': 2, 'no-deadline': 3 } as const
    for (const site of model.sites) {
      const ranks = site.work.map((item) => rank[item.breach])
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    }
  })

  it('names sites from the catalogue and shows the site id when it has none', () => {
    const gp = model.sites.find((site) => site.site === 'gp')!
    expect(gp.name).toBe('Riverside Practice')
    expect(gp.nameSource).toBe('catalogue')
    expect(gp.colorHex).toBe('#315b82')

    // The capture does not cover diagnostics, so there is no name to show.
    const diagnostics = model.sites.find((site) => site.site === 'diagnostics')!
    expect(diagnostics.name).toBeNull()
    expect(diagnostics.nameSource).toBe('site-id')
    expect(diagnostics.colorSource).toBe('palette')
  })

  it('falls back to the recorded capture when the catalogue read failed', () => {
    const degraded = fixtureModel({ catalogue: null })
    const hospital = degraded.sites.find((site) => site.site === 'hospital')!
    expect(hospital.name).toBe('Northbank General')
    expect(hospital.nameSource).toBe('capture')
    expect(degraded.catalogueSource).toBe('capture')
  })

  it('names a failed site read instead of drawing it as empty', () => {
    const degraded = fixtureModel({
      overrides: { pharmacy: { resources: [], total: 0, events: [], error: 'HTTP 502' } },
    })
    const pharmacy = degraded.sites.find((site) => site.site === 'pharmacy')!
    expect(pharmacy.readFailed).toBe(true)
    expect(pharmacy.readError).toBe('HTTP 502')
    expect(degraded.scan.failedSites).toEqual(['pharmacy'])
    expect(degraded.scan.sites).not.toContain('pharmacy')
    // Everything else still renders.
    expect(degraded.sites.find((site) => site.site === 'gp')!.scanned).toBeGreaterThan(0)
  })

  it('only names patients the directory page actually returned', () => {
    const gp = model.sites.find((site) => site.site === 'gp')!
    const known = gp.patients.find((patient) => patient.patientId === 'SIM-000001')
    expect(known?.name).toBe('Amira Khan')
    const unknown = gp.patients.find((patient) => patient.patientId === 'SIM-035638')
    if (unknown) expect(unknown.name).toBeNull()
    for (const patient of gp.patients) {
      expect(patient.patientId).toMatch(/^SIM-\d+$/)
    }
  })
})

describe('the paper trail follows real visibleTo chains', () => {
  const docs = documentsFrom(fixtureClockEvents(), 200)

  it('keeps each event chain in the order the API returned it', () => {
    const arrival = docs.find((doc) => doc.eventId === 'e-5271')
    expect(arrival).toBeDefined()
    expect(arrival!.type).toBe('request.arrived')
    expect(arrival!.chain).toEqual(['triage', 'gp', 'patient'])
    expect(arrival!.routed).toEqual(['triage', 'gp', 'patient'])
    expect(arrival!.patientId).toBe('SIM-028410')
    expect(arrival!.resourceId).toBe('r-5270')
  })

  it('routes a home observation from the wearables site to the community site', () => {
    const observation = docs.find((doc) => doc.type === 'observation.received')
    expect(observation).toBeDefined()
    expect(observation!.chain.slice(0, 2)).toEqual(['wearables', 'community'])
    expect(isSiteScope(observation!.routed[0]!)).toBe(true)
    expect(isSiteScope(observation!.routed[1]!)).toBe(true)
    const route = routeBetween(anchorFor('wearables')!, anchorFor('community')!)
    expect(route.length).toBeGreaterThan(2)
  })

  it('does not draw an event whose chain has fewer than two places on the map', () => {
    const clockChange = docs.find((doc) => doc.type === 'clock.changed')
    expect(clockChange).toBeDefined()
    expect(clockChange!.chain).toEqual(['control'])
    expect(clockChange!.routed).toHaveLength(1)
  })

  it('anchors every scope the fixtures actually use', () => {
    const scopes = new Set<string>()
    for (const event of fixtureClockEvents()) for (const scope of event.visibleTo) scopes.add(scope)
    for (const read of fixtureSiteReads()) {
      for (const resource of read.resources) for (const scope of resource.visibleTo) scopes.add(scope)
    }

    // Every signpost on the map is a scope the data really uses; none invented.
    for (const gate of Object.keys(GATES)) {
      expect(scopes.has(gate)).toBe(true)
    }
    // And the scopes that matter have somewhere to be.
    for (const scope of ['gp', 'hospital', 'wearables', 'community', 'ambulance', 'triage']) {
      expect(anchorFor(scope)).not.toBeNull()
    }
  })

  it('reports every displayed site colour as sourced or as presentation', () => {
    const model = fixtureModel()
    for (const site of model.sites) {
      const descriptor = FIXTURE_CATALOGUE.find((entry) => entry.id === site.site)
      if (descriptor?.color) {
        expect(site.colorSource).toBe('catalogue')
        expect(site.colorHex).toBe(descriptor.color)
      } else {
        expect(['capture', 'palette']).toContain(site.colorSource)
      }
    }
  })
})
