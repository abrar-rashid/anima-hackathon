import 'server-only'

import { findPatient, searchPatients } from '@/anima/readers'
import type { SimPatient } from '@/ctl/contracts'
import { FEATURED_PATIENT_IDS } from '@/components/wardline/rank-patients'

/** The Anima directory page size is fixed upstream. Offset is the only lever. */
export const DIRECTORY_PAGE_SIZE = 30
export const DIRECTORY_TARGET = 510
const CONCURRENCY = 5
const CACHE_MS = 120_000

export interface DirectoryLoad {
  items: SimPatient[]
  total: number
  fetchedAt: number
  pagesFetched: number
  featuredMissing: string[]
}

let cached: DirectoryLoad | null = null

export function invalidateDirectoryCache(): void {
  cached = null
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    const settled = await Promise.all(batch.map((item) => fn(item)))
    out.push(...settled)
  }
  return out
}

function dedupe(patients: SimPatient[]): SimPatient[] {
  const seen = new Set<string>()
  const out: SimPatient[] = []
  for (const patient of patients) {
    if (seen.has(patient.id)) continue
    seen.add(patient.id)
    out.push(patient)
  }
  return out
}

/**
 * Pull at least 500 directory rows (or the whole population if smaller).
 * Featured identities are merged in if the paged walk missed them.
 */
export async function loadDirectory(target = DIRECTORY_TARGET): Promise<DirectoryLoad> {
  if (
    cached &&
    Date.now() - cached.fetchedAt < CACHE_MS &&
    cached.items.length >= Math.min(target, cached.total || target)
  ) {
    return cached
  }

  const first = await searchPatients({ offset: 0 })
  const total = first.total
  const needed = Math.min(target, total > 0 ? total : target)
  const offsets: number[] = []
  for (let offset = DIRECTORY_PAGE_SIZE; offset < needed; offset += DIRECTORY_PAGE_SIZE) {
    offsets.push(offset)
  }

  const pages = await mapPool(offsets, CONCURRENCY, (offset) => searchPatients({ offset }))
  const items = dedupe([first.items, ...pages.map((page) => page.items)].flat())

  const have = new Set(items.map((patient) => patient.id))
  const featuredMissing: string[] = []
  const featured = await Promise.all(
    FEATURED_PATIENT_IDS.map(async (id) => {
      if (have.has(id)) return null
      const found = await findPatient(id)
      if (!found) {
        featuredMissing.push(id)
        return null
      }
      return found
    }),
  )
  for (const patient of featured) {
    if (patient) items.unshift(patient)
  }

  cached = {
    items: dedupe(items),
    total,
    fetchedAt: Date.now(),
    pagesFetched: 1 + pages.length,
    featuredMissing,
  }
  return cached
}
