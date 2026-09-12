import 'server-only'

import { createAnimaClient, type AnimaClient } from '@/adapters/anima/client'
import {
  SITES,
  type Site,
  type SiteDescriptor,
  type SimClock,
  type SimEvent,
  type SimPatient,
  type SimResource,
  type Sourced,
} from '@/ctl/contracts'
import { normaliseResource, normalisePatient, normaliseEvent } from '@/ctl/normalise/resources'

/**
 * Server-only readers for the Anima simulator.
 *
 * Two properties matter more than speed here:
 *
 * 1. A failed read never throws into a page. Callers get a `Sourced<T>` that
 *    says whether the data is live or stale and why, so every surface can
 *    degrade with an honest label instead of blanking. The simulator returned
 *    502 for ten minutes during development; that must not end a demo.
 * 2. Nothing is invented. A missing field stays missing.
 */

const DEFAULT_TIMEOUT_MS = 12_000
const RETRIES = 2

function client(): AnimaClient {
  return createAnimaClient()
}

/** One request with a timeout and a couple of retries on transport/5xx. */
async function attempt<T>(path: string): Promise<T> {
  let lastError: unknown
  for (let i = 0; i <= RETRIES; i += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    try {
      const { status, body } = await client().request<T>(path, { signal: controller.signal })
      if (status >= 200 && status < 300) return body
      // 4xx is a real answer about our request; retrying will not help.
      if (status < 500) throw new Error(`HTTP ${status} for ${path}`)
      lastError = new Error(`HTTP ${status} for ${path}`)
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(timer)
    }
    if (i < RETRIES) await new Promise((r) => setTimeout(r, 250 * (i + 1)))
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

// ---------------------------------------------------------------------------
// Cache keyed on simulator time
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: unknown
  fetchedAt: number
  simNow: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 15_000

/**
 * Serve from cache when fresh, refresh when not, and fall back to a stale
 * entry when the refresh fails. The last branch is what keeps the product
 * usable while the simulator is down.
 */
async function cached<T>(key: string, simNow: number, load: () => Promise<T>): Promise<Sourced<T>> {
  const hit = cache.get(key)
  const fresh = hit && Date.now() - hit.fetchedAt < TTL_MS && hit.simNow === simNow
  if (fresh) {
    return { data: hit.value as T, fetchedAt: hit.fetchedAt, stale: false }
  }
  try {
    const value = await load()
    cache.set(key, { value, fetchedAt: Date.now(), simNow })
    return { data: value, fetchedAt: Date.now(), stale: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (hit) {
      return { data: hit.value as T, fetchedAt: hit.fetchedAt, stale: true, error: message }
    }
    throw error
  }
}

/** Drop everything. Call after a write or a clock change. */
export function invalidateCache(): void {
  cache.clear()
}

// ---------------------------------------------------------------------------
// Primitive reads
// ---------------------------------------------------------------------------

export interface TeamInfo {
  team: string
  world: string
  scopes: string[]
}

export async function readTeam(): Promise<TeamInfo> {
  return attempt<TeamInfo>('/api/team')
}

interface RawClock {
  now?: number
  paused?: boolean
  speed?: number
  events?: unknown[]
}

/**
 * The clock is the anchor for everything else: `now` drives every breach
 * calculation and keys the cache. Read it first.
 */
export async function readClock(): Promise<{ clock: SimClock; events: SimEvent[] }> {
  const body = await attempt<RawClock>('/api/clock')
  return {
    clock: {
      now: typeof body.now === 'number' ? body.now : Date.now(),
      paused: Boolean(body.paused),
      speed: typeof body.speed === 'number' ? body.speed : 1,
    },
    events: (body.events ?? []).map(normaliseEvent).filter((e): e is SimEvent => e !== null),
  }
}

interface RawCatalogue {
  sites?: SiteDescriptor[]
  apis?: unknown[]
}

/**
 * Real site names live here. The UI must use these rather than any hardcoded
 * label — the simulator calls them "Riverside Practice" and "Northbank
 * General", and inventing prettier names is exactly the dishonesty we removed.
 */
export async function readCatalogue(simNow: number): Promise<Sourced<SiteDescriptor[]>> {
  return cached('catalogue', simNow, async () => {
    const body = await attempt<RawCatalogue>('/api/catalogue')
    return body.sites ?? []
  })
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

interface RawPatients {
  total?: number
  items?: unknown[]
}

export interface PatientPage {
  total: number
  items: SimPatient[]
  offset: number
}

/**
 * Search the directory. `q` matches name, ID, condition, need and care goal.
 * Page size is fixed at 30 by the API, so `offset` is the only lever.
 */
export async function searchPatients(
  opts: { q?: string; offset?: number; site?: Site } = {},
): Promise<PatientPage> {
  const site = opts.site ?? 'gp'
  const params = new URLSearchParams()
  if (opts.q) params.set('q', opts.q)
  if (opts.offset) params.set('offset', String(opts.offset))
  const qs = params.toString()
  const body = await attempt<RawPatients>(`/api/sites/${site}/patients${qs ? `?${qs}` : ''}`)
  return {
    total: body.total ?? 0,
    offset: opts.offset ?? 0,
    items: (body.items ?? []).map(normalisePatient).filter((p): p is SimPatient => p !== null),
  }
}

/**
 * Resolve one patient by exact ID via the directory search.
 *
 * Cached because the directory search costs about 2.7 seconds upstream and a
 * patient's demographics do not change as the simulator clock advances.
 */
export async function findPatient(patientId: string, site: Site = 'gp'): Promise<SimPatient | null> {
  const key = `patient:${site}:${patientId}`
  const hit = cache.get(key)
  if (hit) return hit.value as SimPatient | null

  const page = await searchPatients({ q: patientId, site })
  const found = page.items.find((p) => p.id === patientId) ?? null
  cache.set(key, { value: found, fetchedAt: Date.now(), simNow: 0 })
  return found
}

// ---------------------------------------------------------------------------
// Site views
// ---------------------------------------------------------------------------

interface RawView {
  resources?: unknown[]
  resourceTotal?: number
  events?: unknown[]
  now?: number
  staffing?: Record<string, number>
  counters?: Record<string, number>
}

export interface SiteViewSlice {
  site: Site
  resources: SimResource[]
  total: number
  events: SimEvent[]
  staffing?: Record<string, number>
}

/** One page of a site's resources. */
export async function readSiteView(
  site: Site,
  opts: { patient?: string; limit?: number; offset?: number } = {},
): Promise<SiteViewSlice> {
  const params = new URLSearchParams()
  if (opts.patient) params.set('patient', opts.patient)
  params.set('limit', String(opts.limit ?? 300))
  params.set('offset', String(opts.offset ?? 0))
  const body = await attempt<RawView>(`/api/sites/${site}/view?${params.toString()}`)
  return {
    site,
    total: body.resourceTotal ?? 0,
    resources: (body.resources ?? [])
      .map((r) => normaliseResource(r, site))
      .filter((r): r is SimResource => r !== null),
    events: (body.events ?? []).map(normaliseEvent).filter((e): e is SimEvent => e !== null),
    staffing: body.staffing,
  }
}

/**
 * Everything recorded for one patient, across every site we can read.
 *
 * Sites are read in parallel and failures are isolated: a dead pharmacy read
 * must not cost us the GP timeline. The caller gets whatever succeeded plus
 * the list of sites that did not.
 */
export async function readPatientAcrossSites(
  patientId: string,
): Promise<{ slices: SiteViewSlice[]; failedSites: Site[] }> {
  const results = await Promise.allSettled(
    SITES.map((site) => readSiteView(site, { patient: patientId, limit: 300 })),
  )
  const slices: SiteViewSlice[] = []
  const failedSites: Site[] = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') slices.push(result.value)
    else failedSites.push(SITES[i]!)
  })
  return { slices, failedSites }
}

/**
 * The worklist scan.
 *
 * Resource ordering is insertion order, not chronological: curated scenario
 * resources sit at the head, a large historical middle follows, and freshly
 * generated activity sits at the tail. So we read a head window and a tail
 * window per site and report exactly how many resources we looked at. We never
 * imply we scanned all 375,868.
 */
export async function scanSitesForWork(
  opts: { headLimit?: number; tailLimit?: number } = {},
): Promise<{ slices: SiteViewSlice[]; failedSites: Site[]; scanned: number; total: number }> {
  const headLimit = opts.headLimit ?? 300
  const tailLimit = opts.tailLimit ?? 200

  const heads = await Promise.allSettled(
    SITES.map((site) => readSiteView(site, { limit: headLimit, offset: 0 })),
  )

  const slices: SiteViewSlice[] = []
  const failedSites: Site[] = []
  const tailJobs: Promise<SiteViewSlice>[] = []

  heads.forEach((result, i) => {
    const site = SITES[i]!
    if (result.status !== 'fulfilled') {
      failedSites.push(site)
      return
    }
    slices.push(result.value)
    // Only worth a second read when the site holds more than the head window.
    const remaining = result.value.total - headLimit
    if (remaining > tailLimit) {
      tailJobs.push(
        readSiteView(site, { limit: tailLimit, offset: result.value.total - tailLimit }),
      )
    }
  })

  const tails = await Promise.allSettled(tailJobs)
  tails.forEach((result) => {
    if (result.status === 'fulfilled') slices.push(result.value)
  })

  const merged = mergeSlices(slices)
  return {
    slices: merged,
    failedSites,
    scanned: merged.reduce((sum, s) => sum + s.resources.length, 0),
    total: totalAcross(merged),
  }
}

/**
 * Collapse the head and tail slices for each site into one, dropping records
 * that appear in both windows.
 *
 * The windows can overlap when a site holds only a little more than the head
 * limit, which double-counted records and produced duplicate findings for the
 * same record. Where a record appears twice, the higher version wins.
 */
function mergeSlices(slices: SiteViewSlice[]): SiteViewSlice[] {
  const bySite = new Map<Site, SiteViewSlice>()

  for (const slice of slices) {
    const existing = bySite.get(slice.site)
    if (!existing) {
      bySite.set(slice.site, {
        ...slice,
        resources: dedupeResources(slice.resources),
        events: [...slice.events],
      })
      continue
    }
    existing.total = Math.max(existing.total, slice.total)
    existing.resources = dedupeResources([...existing.resources, ...slice.resources])
    existing.events = dedupeEvents([...existing.events, ...slice.events])
  }

  return [...bySite.values()]
}

function dedupeResources(resources: SimResource[]): SimResource[] {
  const byId = new Map<string, SimResource>()
  for (const resource of resources) {
    const seen = byId.get(resource.id)
    if (!seen || resource.version > seen.version) byId.set(resource.id, resource)
  }
  return [...byId.values()]
}

function dedupeEvents(events: SimEvent[]): SimEvent[] {
  const byId = new Map<string, SimEvent>()
  for (const event of events) byId.set(event.id, event)
  return [...byId.values()]
}

/** Sum each site's reported total once, since head and tail share a site. */
function totalAcross(slices: SiteViewSlice[]): number {
  const perSite = new Map<Site, number>()
  for (const slice of slices) {
    perSite.set(slice.site, Math.max(perSite.get(slice.site) ?? 0, slice.total))
  }
  return [...perSite.values()].reduce((a, b) => a + b, 0)
}

// ---------------------------------------------------------------------------
// Free text sources
// ---------------------------------------------------------------------------

interface RawDocuments {
  resources?: unknown[]
}

/**
 * Discharge correspondence. These carry the free-text `sections` the extractor
 * reads — `followUp`, `gpActions`, `results` and friends.
 */
export async function readDocuments(site: 'gp' | 'hospital'): Promise<SimResource[]> {
  const body = await attempt<RawDocuments>(`/api/sites/${site}/documents`)
  return (body.resources ?? [])
    .map((r) => normaliseResource(r, site))
    .filter((r): r is SimResource => r !== null)
}
