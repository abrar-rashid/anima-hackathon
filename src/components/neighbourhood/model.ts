/**
 * What the town knows. This is the wire shape between the server route and the
 * canvas, so it is plain JSON and every field traces to an API response.
 *
 * Where a source did not supply something, the field is `null` and the UI says
 * so. There are no defaults that look like data.
 */

import type { BreachState, Site } from '@/ctl/contracts'

/** Where a displayed site name or colour actually came from. */
export type ValueSource = 'catalogue' | 'capture' | 'site-id' | 'palette'

/** Which catalogue field the name on a building's sign was read from. */
export type PlaceNameSource = 'catalogue-subtitle' | 'capture-subtitle' | 'catalogue-name' | 'site-id'

/**
 * One unclosed record above a building.
 *
 * `breach` is arithmetic on `dueAt` against the simulator `now` — nothing here
 * is a clinical judgement, and `priority` is whatever the record said.
 */
export interface TownWork {
  resourceId: string
  version: number
  kind: string
  title: string
  status: string
  priority: string | null
  owner: string | null
  dueAt: number | null
  breach: BreachState
  overdueMs: number | null
  patientId: string | null
}

export interface TownKindCount {
  kind: string
  count: number
}

export interface TownPatientRef {
  patientId: string
  resourceCount: number
  /** Only set when the directory page we read actually returned this patient. */
  name: string | null
}

export interface TownSite {
  site: Site
  /** The catalogue `name` field, verbatim. `null` when no source supplied one. */
  name: string | null
  nameSource: ValueSource
  /** The catalogue `subtitle` field, verbatim. */
  subtitle: string | null
  /**
   * What goes on the building's sign: the place the subtitle leads with, e.g.
   * "Riverside Practice". A verbatim substring of a real field, never composed.
   */
  placeName: string | null
  placeNameSource: PlaceNameSource
  colorHex: string | null
  colorSource: ValueSource
  /** Resources we read, and what the API says exists in total. */
  scanned: number
  total: number
  staffing: Record<string, number> | null
  kinds: TownKindCount[]
  work: TownWork[]
  breachedCount: number
  dueSoonCount: number
  patients: TownPatientRef[]
  eventCount: number
  readFailed: boolean
  readError: string | null
}

/**
 * A document in the paper trail.
 *
 * `chain` is the event's real `visibleTo` array, in the order the API returned
 * it. The sprite follows that chain, so the route drawn across the town is the
 * event's own scope list and not a story we made up.
 */
export interface TownDoc {
  eventId: string
  time: number
  type: string
  actor: string | null
  detail: string | null
  patientId: string | null
  resourceId: string | null
  chain: string[]
  /** The subset of `chain` that has a place on the map. */
  routed: string[]
}

export interface TownScan {
  scanned: number
  total: number
  sites: Site[]
  failedSites: Site[]
  now: number
}

export interface TownModel {
  /** Simulator clock. Drives breach arithmetic and the sky. */
  now: number
  paused: boolean
  speed: number
  /** Wall-clock capture time, so a stale view can say how old it is. */
  fetchedAt: number
  stale: boolean
  error: string | null
  catalogueSource: 'catalogue' | 'capture' | 'none'
  sites: TownSite[]
  docs: TownDoc[]
  scan: TownScan
  /** The exact rule used to decide what counts as unclosed, for display. */
  unclosedRule: string
  /** Sprite counts are capped for legibility; the cap is shown, not hidden. */
  spriteCaps: { cliniciansPerSite: number; nursesPerSite: number; residents: number; documents: number }
}

/** Statuses we treat as not-yet-finished. Declared, never inferred per record. */
export const OPEN_STATUSES: readonly string[] = [
  'open',
  'draft',
  'sent',
  'waiting',
  'accepted',
  'received',
  'assessing',
  'reviewed',
  'take',
]

export const UNCLOSED_RULE = `status in {${OPEN_STATUSES.join(', ')}} within the resources scanned`

/** Twelve simulator hours. The only threshold in the town, and it is time-only. */
export const DUE_SOON_MS = 12 * 60 * 60 * 1000

export function breachOf(dueAt: number | undefined, now: number): BreachState {
  if (dueAt === undefined) return 'no-deadline'
  if (dueAt < now) return 'breached'
  if (dueAt - now <= DUE_SOON_MS) return 'due-soon'
  return 'on-time'
}

export const SPRITE_CAPS = {
  cliniciansPerSite: 2,
  nursesPerSite: 1,
  residents: 6,
  documents: 14,
} as const

/** An empty model, used when every read failed. Labelled, never blank. */
export function emptyModel(now: number, error: string): TownModel {
  return {
    now,
    paused: true,
    speed: 0,
    fetchedAt: Date.now(),
    stale: true,
    error,
    catalogueSource: 'none',
    sites: [],
    docs: [],
    scan: { scanned: 0, total: 0, sites: [], failedSites: [], now },
    unclosedRule: UNCLOSED_RULE,
    spriteCaps: { ...SPRITE_CAPS },
  }
}
