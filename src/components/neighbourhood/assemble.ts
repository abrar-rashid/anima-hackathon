/**
 * Turn real API reads into the town model.
 *
 * Pure: every input is a parameter, including `now`. No I/O, no clock, no
 * randomness, which is what makes the mapping from fixture payloads to
 * buildings testable.
 *
 * Two rules govern everything below:
 *
 * 1. A resource belongs to the building whose site view returned it. There is
 *    no cleverness about where it "really" belongs.
 * 2. An event's route across the town is its own `visibleTo` array, in order.
 *    We do not invent a sender or a recipient.
 */

import type { SimEvent, SimPatient, SimResource, SiteDescriptor, Site, Sourced } from '@/ctl/contracts'
import { SITES } from '@/ctl/contracts'
import { CAPTURED_CATALOGUE, PALETTE_SITE_COLORS, placeNameFromSubtitle } from './captured-catalogue'
import { anchorFor } from './layout'
import {
  OPEN_STATUSES,
  SPRITE_CAPS,
  UNCLOSED_RULE,
  breachOf,
  type TownDoc,
  type TownKindCount,
  type TownModel,
  type TownPatientRef,
  type TownSite,
  type TownWork,
  type PlaceNameSource,
  type ValueSource,
} from './model'

export interface SiteReadResult {
  site: Site
  resources: SimResource[]
  /** What the API says the site holds in total, which dwarfs what we scanned. */
  total: number
  events: SimEvent[]
  staffing?: Record<string, number> | undefined
  error?: string | undefined
}

export interface AssembleInput {
  now: number
  paused: boolean
  speed: number
  /** `GET /api/catalogue`, or null when that read failed. */
  catalogue: Sourced<SiteDescriptor[]> | null
  /** `GET /api/clock` events; the paper trail is built from these. */
  clockEvents: SimEvent[]
  siteReads: SiteReadResult[]
  /** One real directory page, used only to put names on ids it actually returned. */
  directory?: SimPatient[]
  fetchedAt: number
  stale: boolean
  error?: string | undefined
}

const OPEN_SET = new Set(OPEN_STATUSES)

/** How many unclosed records we carry to the client per site. */
const WORK_PER_SITE = 24
const PATIENTS_PER_SITE = 24
const DOCS = 40

interface SiteNaming {
  name: string | null
  nameSource: ValueSource
  subtitle: string | null
  placeName: string | null
  placeNameSource: PlaceNameSource
  colorHex: string | null
  colorSource: ValueSource
}

/**
 * Resolve what a building is called, and record where each string came from.
 *
 * Three descending sources: the live catalogue, the recorded capture of it, and
 * — when neither names the site — the real site id. The sign prefers the place
 * name the subtitle leads with, because "Riverside Practice" is the town's name
 * for the building while "GP Records" is the system's; both are real fields and
 * both are shown.
 */
function descriptorFor(site: Site, catalogue: SiteDescriptor[] | null): SiteNaming {
  const live = catalogue?.find((entry) => entry.id === site)
  if (live?.name) {
    const place = placeNameFromSubtitle(live.subtitle)
    return {
      name: live.name,
      nameSource: 'catalogue',
      subtitle: live.subtitle ?? null,
      placeName: place ?? live.name,
      placeNameSource: place ? 'catalogue-subtitle' : 'catalogue-name',
      colorHex: live.color ?? PALETTE_SITE_COLORS[site] ?? null,
      colorSource: live.color ? 'catalogue' : 'palette',
    }
  }

  const captured = CAPTURED_CATALOGUE[site]
  if (captured) {
    const place = placeNameFromSubtitle(captured.subtitle)
    return {
      name: captured.name,
      nameSource: 'capture',
      subtitle: captured.subtitle,
      placeName: place ?? captured.name,
      placeNameSource: place ? 'capture-subtitle' : 'catalogue-name',
      colorHex: captured.colorHex,
      colorSource: 'capture',
    }
  }

  // No source has ever named this site. Show the real site id rather than
  // making one up, and record that that is what happened.
  return {
    name: null,
    nameSource: 'site-id',
    subtitle: null,
    placeName: null,
    placeNameSource: 'site-id',
    colorHex: PALETTE_SITE_COLORS[site] ?? null,
    colorSource: 'palette',
  }
}

function countKinds(resources: SimResource[]): TownKindCount[] {
  const counts = new Map<string, number>()
  for (const resource of resources) {
    counts.set(resource.kind, (counts.get(resource.kind) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
}

/** Unclosed records, worst deadline first. Ordering is by time only. */
function unclosedWork(resources: SimResource[], now: number): TownWork[] {
  const work: TownWork[] = []
  for (const resource of resources) {
    if (!OPEN_SET.has(resource.status.toLowerCase())) continue
    const breach = breachOf(resource.dueAt, now)
    work.push({
      resourceId: resource.id,
      version: resource.version,
      kind: resource.kind,
      title: resource.title,
      status: resource.status,
      priority: resource.priority ?? null,
      owner: resource.owner ?? null,
      dueAt: resource.dueAt ?? null,
      breach,
      overdueMs: resource.dueAt !== undefined && resource.dueAt < now ? now - resource.dueAt : null,
      patientId: resource.patientId ?? null,
    })
  }
  const rank: Record<string, number> = { breached: 0, 'due-soon': 1, 'on-time': 2, 'no-deadline': 3 }
  return work
    .sort((a, b) => {
      const byBreach = (rank[a.breach] ?? 9) - (rank[b.breach] ?? 9)
      if (byBreach !== 0) return byBreach
      return (b.overdueMs ?? 0) - (a.overdueMs ?? 0)
    })
    .slice(0, WORK_PER_SITE)
}

function patientRefs(resources: SimResource[], directory: SimPatient[]): TownPatientRef[] {
  const names = new Map(directory.map((patient) => [patient.id, patient.name]))
  const counts = new Map<string, number>()
  for (const resource of resources) {
    if (!resource.patientId) continue
    counts.set(resource.patientId, (counts.get(resource.patientId) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, PATIENTS_PER_SITE)
    .map(([patientId, resourceCount]) => ({
      patientId,
      resourceCount,
      name: names.get(patientId) ?? null,
    }))
}

/**
 * The paper trail.
 *
 * A document is routable when at least two of its `visibleTo` scopes have a
 * place on the map; otherwise there is nowhere for it to travel and it stays in
 * the ticker only.
 */
export function documentsFrom(events: SimEvent[], limit = DOCS): TownDoc[] {
  const seen = new Set<string>()
  const docs: TownDoc[] = []
  for (const event of events) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    const routed = event.visibleTo.filter((scope) => anchorFor(scope) !== null)
    docs.push({
      eventId: event.id,
      time: event.time,
      type: event.type,
      actor: event.actor ?? null,
      detail: event.detail ?? null,
      patientId: event.patientId ?? null,
      resourceId: event.resourceId ?? null,
      chain: [...event.visibleTo],
      routed,
    })
  }
  return docs.sort((a, b) => b.time - a.time).slice(0, limit)
}

export function assembleTown(input: AssembleInput): TownModel {
  const catalogue = input.catalogue?.data ?? null
  const directory = input.directory ?? []
  const byId = new Map(input.siteReads.map((read) => [read.site, read]))

  const sites: TownSite[] = SITES.map((site) => {
    const read = byId.get(site)
    const descriptor = descriptorFor(site, catalogue)
    const resources = read?.resources ?? []
    const work = unclosedWork(resources, input.now)

    return {
      site,
      ...descriptor,
      scanned: resources.length,
      total: read?.total ?? 0,
      staffing: read?.staffing ?? null,
      kinds: countKinds(resources),
      work,
      breachedCount: work.filter((item) => item.breach === 'breached').length,
      dueSoonCount: work.filter((item) => item.breach === 'due-soon').length,
      patients: patientRefs(resources, directory),
      eventCount: read?.events.length ?? 0,
      readFailed: read === undefined || read.error !== undefined,
      readError: read?.error ?? (read === undefined ? 'site read did not complete' : null),
    }
  })

  const failedSites = sites.filter((site) => site.readFailed).map((site) => site.site)

  return {
    now: input.now,
    paused: input.paused,
    speed: input.speed,
    fetchedAt: input.fetchedAt,
    stale: input.stale || (input.catalogue?.stale ?? false),
    error: input.error ?? input.catalogue?.error ?? null,
    catalogueSource: catalogue && catalogue.length > 0 ? 'catalogue' : 'capture',
    sites,
    docs: documentsFrom(input.clockEvents),
    scan: {
      scanned: sites.reduce((sum, site) => sum + site.scanned, 0),
      total: sites.reduce((sum, site) => sum + site.total, 0),
      sites: sites.filter((site) => !site.readFailed).map((site) => site.site),
      failedSites,
      now: input.now,
    },
    unclosedRule: UNCLOSED_RULE,
    spriteCaps: { ...SPRITE_CAPS },
  }
}

/**
 * Every site label the model is allowed to render, for the honesty check.
 *
 * If a site label appears on the canvas or in the DOM that is not a member of
 * this set — or a substring of one, since the sign wraps onto two lines — it was
 * invented, and the test that calls this fails.
 */
export function permittedSiteLabels(model: TownModel): string[] {
  const labels: string[] = []
  for (const site of model.sites) {
    labels.push(site.site)
    if (site.name) labels.push(site.name)
    if (site.subtitle) labels.push(site.subtitle)
    if (site.placeName) labels.push(site.placeName)
  }
  return labels
}
