import 'server-only'

import { SITES, type SiteDescriptor, type Sourced } from '@/ctl/contracts'
import { readCatalogue, readClock, readSiteView, searchPatients } from '@/anima/readers'
import { assembleTown, type SiteReadResult } from './assemble'
import { emptyModel, type TownModel } from './model'

/**
 * The one read path for the town, used by both the page's first paint and the
 * refresh endpoint so the two can never disagree.
 *
 * Reads fan out in parallel and fail independently: a dead pharmacy read costs
 * the pharmacy's counts and nothing else. The clock, the catalogue and the
 * directory page are each optional, and the model records which of them were
 * missing so the UI can label the gap instead of papering over it.
 *
 * The team key is only ever read inside `src/anima`, which is server-only, so
 * it cannot reach the payload this returns.
 */

/**
 * Resources are returned in insertion order, so this is a head window. The
 * model carries both this number and each site's own total; nothing claims to
 * have scanned the whole population.
 */
const HEAD_LIMIT = 300

export async function loadTownModel(): Promise<TownModel> {
  const started = Date.now()

  let now = Date.now()
  let paused = true
  let speed = 0
  let clockEvents: Awaited<ReturnType<typeof readClock>>['events'] = []
  let clockError: string | undefined

  try {
    const clock = await readClock()
    now = clock.clock.now
    paused = clock.clock.paused
    speed = clock.clock.speed
    clockEvents = clock.events
  } catch (error) {
    clockError = `clock read failed: ${error instanceof Error ? error.message : String(error)}`
  }

  const [catalogueResult, directoryResult, ...viewResults] = await Promise.allSettled([
    readCatalogue(now),
    searchPatients({ site: 'gp', offset: 0 }),
    ...SITES.map((site) => readSiteView(site, { limit: HEAD_LIMIT, offset: 0 })),
  ])

  const catalogue: Sourced<SiteDescriptor[]> | null =
    catalogueResult?.status === 'fulfilled' ? catalogueResult.value : null
  const catalogueError =
    catalogueResult?.status === 'rejected'
      ? `catalogue read failed: ${String(catalogueResult.reason)}`
      : undefined

  const directory = directoryResult?.status === 'fulfilled' ? directoryResult.value.items : []

  const siteReads: SiteReadResult[] = SITES.map((site, index) => {
    const result = viewResults[index]
    if (result && result.status === 'fulfilled') {
      return {
        site,
        resources: result.value.resources,
        total: result.value.total,
        events: result.value.events,
        staffing: result.value.staffing,
      }
    }
    return {
      site,
      resources: [],
      total: 0,
      events: [],
      error: result ? String((result as PromiseRejectedResult).reason) : 'read did not run',
    }
  })

  const errors = [clockError, catalogueError].filter(Boolean).join('; ')

  if (clockError !== undefined && siteReads.every((read) => read.error !== undefined)) {
    return emptyModel(now, errors || 'every simulator read failed')
  }

  return assembleTown({
    now,
    paused,
    speed,
    catalogue,
    clockEvents,
    siteReads,
    directory,
    fetchedAt: started,
    stale: clockError !== undefined || catalogue === null,
    error: errors || undefined,
  })
}
