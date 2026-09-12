import { SITES, type Site, type SimEvent, type SimPatient, type SimResource, type SiteDescriptor } from '@/ctl/contracts'
import { normaliseEvent, normalisePatient, normaliseResource } from '@/ctl/normalise/resources'
import { assembleTown, type SiteReadResult } from '@/components/neighbourhood/assemble'
import type { TownModel } from '@/components/neighbourhood/model'

import clock from '../../fixtures/live/clock.json'
import vGp from '../../fixtures/live/v-gp.json'
import vHospital from '../../fixtures/live/v-hospital.json'
import vDiagnostics from '../../fixtures/live/v-diagnostics.json'
import vReferrals from '../../fixtures/live/v-referrals.json'
import vPharmacy from '../../fixtures/live/v-pharmacy.json'
import vCommunity from '../../fixtures/live/v-community.json'
import vWearables from '../../fixtures/live/v-wearables.json'

/**
 * Shared fixture wiring: the real captured payloads, normalised exactly the way
 * the server readers normalise them, so the tests exercise the same mapping the
 * page does.
 */

interface RawView {
  resources?: unknown[]
  resourceTotal?: number
  events?: unknown[]
  staffing?: Record<string, number>
  now?: number
}

const VIEWS: Record<Site, RawView> = {
  gp: vGp as RawView,
  hospital: vHospital as RawView,
  diagnostics: vDiagnostics as RawView,
  referrals: vReferrals as RawView,
  pharmacy: vPharmacy as RawView,
  community: vCommunity as RawView,
  wearables: vWearables as RawView,
}

/** Simulator `now` as the site views report it. */
export const FIXTURE_NOW: number = (vGp as RawView).now ?? 0

/**
 * The catalogue as the live simulator returned it on 2026-09-12.
 *
 * `diagnostics` and `referrals` are deliberately absent: the capture does not
 * cover them, and the town must show their site ids rather than inventing a
 * name.
 */
export const FIXTURE_CATALOGUE: SiteDescriptor[] = [
  { id: 'gp', name: 'Riverside Practice', color: '#315b82' },
  { id: 'hospital', name: 'Northbank General', color: '#63516f' },
  { id: 'pharmacy', name: 'High Street Pharmacy', color: '#11675e' },
  { id: 'community', name: 'Community visiting team', color: '#976039' },
  { id: 'wearables', name: 'Home Health', color: '#6d71cb' },
]

export function fixtureResources(site: Site): SimResource[] {
  return (VIEWS[site].resources ?? [])
    .map((raw) => normaliseResource(raw, site))
    .filter((resource): resource is SimResource => resource !== null)
}

export function fixtureClockEvents(): SimEvent[] {
  return ((clock as { events?: unknown[] }).events ?? [])
    .map(normaliseEvent)
    .filter((event): event is SimEvent => event !== null)
}

export function fixtureSiteReads(overrides: Partial<Record<Site, Partial<SiteReadResult>>> = {}): SiteReadResult[] {
  return SITES.map((site) => {
    const view = VIEWS[site]
    const base: SiteReadResult = {
      site,
      resources: fixtureResources(site),
      total: view.resourceTotal ?? 0,
      events: (view.events ?? [])
        .map(normaliseEvent)
        .filter((event): event is SimEvent => event !== null),
      staffing: view.staffing,
    }
    return { ...base, ...overrides[site] }
  })
}

/** A directory page containing the patients the curated head resources cite. */
export function fixtureDirectory(): SimPatient[] {
  return [
    { id: 'SIM-000001', name: 'Amira Khan' },
    { id: 'SIM-000002', name: 'Tomas Beckett' },
  ]
    .map(normalisePatient)
    .filter((patient): patient is SimPatient => patient !== null)
}

export function fixtureModel(
  options: {
    catalogue?: SiteDescriptor[] | null
    overrides?: Partial<Record<Site, Partial<SiteReadResult>>>
    directory?: SimPatient[]
  } = {},
): TownModel {
  const catalogue = options.catalogue === undefined ? FIXTURE_CATALOGUE : options.catalogue
  return assembleTown({
    now: FIXTURE_NOW,
    paused: Boolean((clock as { paused?: boolean }).paused),
    speed: (clock as { speed?: number }).speed ?? 1,
    catalogue: catalogue === null ? null : { data: catalogue, fetchedAt: 1, stale: false },
    clockEvents: fixtureClockEvents(),
    siteReads: fixtureSiteReads(options.overrides),
    directory: options.directory ?? fixtureDirectory(),
    fetchedAt: 1,
    stale: false,
  })
}
