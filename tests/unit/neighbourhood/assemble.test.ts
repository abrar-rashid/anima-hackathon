import { describe, expect, it } from 'vitest'
import type { Site } from '@/ctl/contracts'
import { GATES, SITE_PLOTS, anchorFor, isSiteScope, routeBetween } from '@/components/neighbourhood/layout'
import { documentsFrom } from '@/components/neighbourhood/assemble'
import { OPEN_STATUSES, breachOf } from '@/components/neighbourhood/model'
import {
  FIXTURE_CATALOGUE,
  FIXTURE_NOW,
  fixtureClockEvents,
  fixtureDirectory,
  fixtureModel,
  fixtureResources,
  fixtureSiteReads,
  fixtureView,
} from './fixture-town'

/**
 * These assert the mapping from real captured payloads onto buildings, which is
 * where a silent error would hang one site's work above another site's roof, or
 * put a name on a sign that no source ever supplied.
 *
 * Rendering internals and animation timing are deliberately not tested.
 */

const SITES_IN_MAP_ORDER: Site[] = [
  'gp',
  'hospital',
  'community',
  'pharmacy',
  'diagnostics',
  'referrals',
  'wearables',
]

describe('town assembly from real fixture payloads', () => {
  const model = fixtureModel()

  it('draws exactly the seven service sites, each with a plot on the map', () => {
    expect(model.sites.map((site) => site.site)).toEqual(SITES_IN_MAP_ORDER)
    for (const site of model.sites) {
      expect(SITE_PLOTS[site.site]).toBeDefined()
    }
  })

  it('places every unclosed record on the building whose view returned it', () => {
    for (const site of model.sites) {
      const returned = new Set(fixtureResources(site.site).map((resource) => resource.id))
      for (const item of site.work) {
        expect(returned.has(item.resourceId)).toBe(true)
      }
    }
  })

  it('does not leak a resource onto a site that never returned it', () => {
    const gpOnly = new Set(fixtureResources('gp').map((r) => r.id))
    for (const site of fixtureSiteReads()) {
      if (site.site === 'gp') continue
      for (const resource of site.resources) gpOnly.delete(resource.id)
    }
    expect(gpOnly.size).toBeGreaterThan(0)

    for (const site of model.sites) {
      if (site.site === 'gp') continue
      for (const item of site.work) {
        expect(gpOnly.has(item.resourceId)).toBe(false)
      }
    }
  })

  it('carries each site total alongside what it actually scanned', () => {
    for (const site of model.sites) {
      const view = fixtureView(site.site)
      expect(site.scanned).toBe(fixtureResources(site.site).length)
      expect(site.total).toBe(view.resourceTotal ?? 0)
    }
    const gp = model.sites.find((site) => site.site === 'gp')!
    expect(gp.total).toBeGreaterThan(gp.scanned)
    expect(model.scan.scanned).toBeLessThan(model.scan.total)
  })

  it('counts resource kinds from the scanned window only', () => {
    for (const site of model.sites) {
      const expected = new Map<string, number>()
      for (const resource of fixtureResources(site.site)) {
        expected.set(resource.kind, (expected.get(resource.kind) ?? 0) + 1)
      }
      for (const entry of site.kinds) {
        expect(entry.count).toBe(expected.get(entry.kind))
      }
      expect(site.kinds.reduce((sum, entry) => sum + entry.count, 0)).toBe(site.scanned)
    }
  })

  it('treats only declared open statuses as unclosed', () => {
    for (const site of model.sites) {
      for (const item of site.work) {
        expect(OPEN_STATUSES).toContain(item.status.toLowerCase())
      }
    }
    // The pharmacy window is the useful check: it is mostly `available` stock
    // records, which must not be mistaken for outstanding work.
    const pharmacy = model.sites.find((site) => site.site === 'pharmacy')!
    expect(pharmacy.work.every((item) => item.status !== 'available')).toBe(true)
    expect(pharmacy.work.length).toBeGreaterThan(0)
    expect(pharmacy.work.length).toBeLessThan(pharmacy.scanned)
  })

  it('derives breach state and overdue time from the record dueAt alone', () => {
    let checked = 0
    for (const site of model.sites) {
      const source = new Map(fixtureResources(site.site).map((r) => [r.id, r]))
      for (const item of site.work) {
        const original = source.get(item.resourceId)!
        expect(item.dueAt).toBe(original.dueAt ?? null)
        expect(item.breach).toBe(breachOf(original.dueAt, FIXTURE_NOW))
        expect(item.overdueMs).toBe(
          original.dueAt !== undefined && original.dueAt < FIXTURE_NOW
            ? FIXTURE_NOW - original.dueAt
            : null,
        )
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('never invents an owner, a priority or a title the source omitted', () => {
    for (const site of model.sites) {
      const source = new Map(fixtureResources(site.site).map((r) => [r.id, r]))
      for (const item of site.work) {
        const original = source.get(item.resourceId)!
        expect(item.owner).toBe(original.owner ?? null)
        expect(item.priority).toBe(original.priority ?? null)
        expect(item.title).toBe(original.title)
        expect(item.patientId).toBe(original.patientId ?? null)
        expect(item.version).toBe(original.version)
      }
    }
  })

  it('orders markers worst deadline first', () => {
    const rank = { breached: 0, 'due-soon': 1, 'on-time': 2, 'no-deadline': 3 } as const
    for (const site of model.sites) {
      const ranks = site.work.map((item) => rank[item.breach])
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    }
  })

  it('reads the sign name from the catalogue subtitle, verbatim', () => {
    const gp = model.sites.find((site) => site.site === 'gp')!
    const descriptor = FIXTURE_CATALOGUE.find((entry) => entry.id === 'gp')!
    expect(gp.name).toBe(descriptor.name)
    expect(gp.subtitle).toBe(descriptor.subtitle)
    expect(gp.placeName).toBe('Riverside Practice')
    expect(descriptor.subtitle).toContain(gp.placeName!)
    expect(gp.placeNameSource).toBe('catalogue-subtitle')
    expect(gp.nameSource).toBe('catalogue')
    expect(gp.colorHex).toBe(descriptor.color)
    expect(gp.colorSource).toBe('catalogue')
  })

  it('shows the site id for sites the catalogue does not list', () => {
    // The real catalogue has no entry at all for diagnostics or referrals.
    for (const id of ['diagnostics', 'referrals'] as const) {
      expect(FIXTURE_CATALOGUE.some((entry) => entry.id === id)).toBe(false)
      const site = model.sites.find((entry) => entry.site === id)!
      expect(site.name).toBeNull()
      expect(site.subtitle).toBeNull()
      expect(site.placeName).toBeNull()
      expect(site.placeNameSource).toBe('site-id')
      expect(site.colorSource).toBe('palette')
    }
  })

  it('falls back to the recorded capture when the catalogue read fails', () => {
    const degraded = fixtureModel({ catalogue: null })
    const hospital = degraded.sites.find((site) => site.site === 'hospital')!
    expect(hospital.placeName).toBe('Northbank General')
    expect(hospital.placeNameSource).toBe('capture-subtitle')
    expect(hospital.nameSource).toBe('capture')
    expect(degraded.catalogueSource).toBe('capture')
  })

  it('names a failed site read instead of drawing it as an empty site', () => {
    const degraded = fixtureModel({
      overrides: { pharmacy: { resources: [], total: 0, events: [], error: 'HTTP 502' } },
    })
    const pharmacy = degraded.sites.find((site) => site.site === 'pharmacy')!
    expect(pharmacy.readFailed).toBe(true)
    expect(pharmacy.readError).toBe('HTTP 502')
    expect(degraded.scan.failedSites).toEqual(['pharmacy'])
    expect(degraded.scan.sites).not.toContain('pharmacy')
    expect(degraded.sites.find((site) => site.site === 'gp')!.scanned).toBeGreaterThan(0)
  })

  it('only puts a name on a patient the directory page actually returned', () => {
    const directory = new Map(fixtureDirectory().map((patient) => [patient.id, patient.name]))
    expect(directory.size).toBeGreaterThan(0)
    let named = 0
    for (const site of model.sites) {
      for (const patient of site.patients) {
        expect(patient.name).toBe(directory.get(patient.patientId) ?? null)
        if (patient.name !== null) named += 1
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('counts a patient by the resources that actually cite them', () => {
    const gp = model.sites.find((site) => site.site === 'gp')!
    const expected = new Map<string, number>()
    for (const resource of fixtureResources('gp')) {
      if (!resource.patientId) continue
      expected.set(resource.patientId, (expected.get(resource.patientId) ?? 0) + 1)
    }
    for (const patient of gp.patients) {
      expect(patient.resourceCount).toBe(expected.get(patient.patientId))
    }
  })

  it('reports every displayed colour as sourced or as presentation', () => {
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

describe('the paper trail follows real visibleTo chains', () => {
  const events = fixtureClockEvents()
  const docs = documentsFrom(events, 500)

  it('keeps each chain exactly as the API ordered it', () => {
    const byId = new Map(events.map((event) => [event.id, event]))
    expect(docs.length).toBeGreaterThan(0)
    for (const doc of docs) {
      const source = byId.get(doc.eventId)!
      expect(doc.chain).toEqual(source.visibleTo)
      expect(doc.type).toBe(source.type)
      expect(doc.actor).toBe(source.actor ?? null)
      expect(doc.detail).toBe(source.detail ?? null)
      expect(doc.patientId).toBe(source.patientId ?? null)
      expect(doc.resourceId).toBe(source.resourceId ?? null)
      // Routed is a filter of the chain, never a reordering or an addition.
      expect(doc.routed).toEqual(doc.chain.filter((scope) => anchorFor(scope) !== null))
    }
  })

  it('routes a home observation from the wearables site to the community site', () => {
    const observation = docs.find((doc) => doc.type === 'observation.received')
    expect(observation).toBeDefined()
    expect(observation!.chain.slice(0, 2)).toEqual(['wearables', 'community'])
    expect(isSiteScope(observation!.routed[0]!)).toBe(true)
    expect(isSiteScope(observation!.routed[1]!)).toBe(true)
    // And there is a real road route between those two buildings to walk.
    const route = routeBetween(anchorFor('wearables')!, anchorFor('community')!)
    expect(route.length).toBeGreaterThan(2)
  })

  it('routes an emergency arrival from the ambulance scope into the hospital', () => {
    const arrival = docs.find((doc) => doc.type === 'emergency.arrived')
    expect(arrival).toBeDefined()
    expect(arrival!.chain).toContain('ambulance')
    expect(arrival!.chain).toContain('hospital')
    expect(arrival!.routed.length).toBeGreaterThanOrEqual(2)
  })

  it('does not draw an event whose chain has fewer than two places on the map', () => {
    const single = docs.filter((doc) => doc.routed.length < 2)
    for (const doc of single) {
      expect(doc.chain.filter((scope) => anchorFor(scope) !== null).length).toBeLessThan(2)
    }
    const clockChange = docs.find((doc) => doc.type === 'clock.changed')
    if (clockChange) expect(clockChange.routed.length).toBeLessThan(2)
  })

  it('signposts only scopes the data really uses', () => {
    const scopes = new Set<string>()
    for (const event of events) for (const scope of event.visibleTo) scopes.add(scope)
    for (const read of fixtureSiteReads()) {
      for (const resource of read.resources) for (const scope of resource.visibleTo) scopes.add(scope)
    }
    for (const gate of Object.keys(GATES)) {
      expect(scopes.has(gate)).toBe(true)
    }
  })

  it('gives every scope in the data either a building or a signpost, or draws nothing', () => {
    const unanchored = new Set<string>()
    for (const event of events) {
      for (const scope of event.visibleTo) {
        if (anchorFor(scope) === null) unanchored.add(scope)
      }
    }
    // Anything we cannot place is simply not drawn; it is never rehomed onto a
    // building it does not belong to.
    for (const scope of unanchored) {
      expect(Object.keys(SITE_PLOTS)).not.toContain(scope)
      expect(Object.keys(GATES)).not.toContain(scope)
    }
  })
})
