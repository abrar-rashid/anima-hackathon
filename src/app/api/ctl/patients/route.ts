import { searchPatients } from '@/anima/readers'
import { SITES, type Site, type Sourced } from '@/ctl/contracts'
import type { PatientPage } from '@/components/worklist/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function asSite(value: string | null): Site | undefined {
  if (!value) return undefined
  return SITES.find((site) => site === value)
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const q = url.searchParams.get('q') ?? undefined
  const rawOffset = Number(url.searchParams.get('offset') ?? '0')
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0
  const site = asSite(url.searchParams.get('site'))

  try {
    const page = await searchPatients({ q, offset, site })
    const body: Sourced<PatientPage> = { data: page, fetchedAt: Date.now(), stale: false }
    return Response.json(body)
  } catch (error) {
    const body: Sourced<PatientPage> = {
      data: { total: 0, items: [], offset },
      fetchedAt: Date.now(),
      stale: false,
      error: error instanceof Error ? error.message : String(error),
    }
    return Response.json(body)
  }
}
