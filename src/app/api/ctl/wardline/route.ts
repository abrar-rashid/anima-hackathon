import { assembleWardline } from '@/components/wardline/assemble'
import { invalidateDirectoryCache } from '@/anima/load-directory'
import { invalidateCache } from '@/anima/readers'
import type { WardlinePayload } from '@/components/wardline/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

let inflight: Promise<WardlinePayload> | null = null
let last: WardlinePayload | null = null

function emptyPayload(error: string): WardlinePayload {
  return {
    world: last?.world ?? 'unknown',
    live: false,
    fetchedAt: last?.fetchedAt ?? Date.now(),
    stale: Boolean(last),
    error,
    clock: last?.clock ?? { now: Date.now(), paused: true, speed: 1 },
    stats: last?.stats ?? { active: 0, emergency: 0, completed: 0, evidenced: 0, total: 0 },
    tasks: last?.tasks ?? [],
    patients: last?.patients ?? [],
    profilesShown: last?.profilesShown ?? 0,
    directoryTotal: last?.directoryTotal ?? 0,
    sources: last?.sources ?? [],
    sites: last?.sites ?? [],
    scan: last?.scan ?? { scanned: 0, total: 0, sites: [], failedSites: [] },
    chains: last?.chains ?? [],
    bloodWorkflows: last?.bloodWorkflows ?? [],
    medlatency: last?.medlatency ?? {
      reachable: false,
      analysisModes: [],
      validatedPatients: 0,
      note: 'Assemble failed before MedLatency was read.',
    },
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (url.searchParams.get('refresh') === '1') {
    invalidateCache()
    invalidateDirectoryCache()
  }

  try {
    if (!inflight) {
      inflight = assembleWardline().finally(() => {
        inflight = null
      })
    }
    const data = await inflight
    if (data.tasks.length > 0 || data.scan.scanned > 0) last = data
    return Response.json(data)
  } catch (error) {
    return Response.json(emptyPayload(error instanceof Error ? error.message : String(error)), {
      status: 200,
    })
  }
}
