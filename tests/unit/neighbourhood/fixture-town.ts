import {
  SITES,
  type Site,
  type SimEvent,
  type SimPatient,
  type SimResource,
  type SiteDescriptor,
} from '@/ctl/contracts'
import { normaliseEvent, normalisePatient, normaliseResource } from '@/ctl/normalise/resources'
import { assembleTown, type SiteReadResult } from '@/components/neighbourhood/assemble'
import type { TownModel } from '@/components/neighbourhood/model'

import catalogue from '../../fixtures/live/catalogue.json'
import clock from '../../fixtures/live/clock.json'
import patientsPage from '../../fixtures/live/patients-page1.json'
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
 *
 * Expectations are derived from the fixtures rather than hardcoded, because
 * these files are re-captured from a running simulator and its resource and
 * event ids move between captures.
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

/** The catalogue exactly as the simulator returned it. */
export const FIXTURE_CATALOGUE: SiteDescriptor[] =
  (catalogue as { sites?: SiteDescriptor[] }).sites ?? []

export function fixtureView(site: Site): RawView {
  return VIEWS[site]
}

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

export function fixtureSiteReads(
  overrides: Partial<Record<Site, Partial<SiteReadResult>>> = {},
): SiteReadResult[] {
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

/** A real directory page, as `GET /api/sites/gp/patients` returned it. */
export function fixtureDirectory(): SimPatient[] {
  return ((patientsPage as { items?: unknown[] }).items ?? [])
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
  const cat = options.catalogue === undefined ? FIXTURE_CATALOGUE : options.catalogue
  return assembleTown({
    now: FIXTURE_NOW,
    paused: Boolean((clock as { paused?: boolean }).paused),
    speed: (clock as { speed?: number }).speed ?? 1,
    catalogue: cat === null ? null : { data: cat, fetchedAt: 1, stale: false },
    clockEvents: fixtureClockEvents(),
    siteReads: fixtureSiteReads(options.overrides),
    directory: options.directory ?? fixtureDirectory(),
    fetchedAt: 1,
    stale: false,
  })
}
