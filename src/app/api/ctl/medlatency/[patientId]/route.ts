import { readMedlatencyHealth, readMedlatencyOverview } from '@/medlatency/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ patientId: string }> },
): Promise<Response> {
  const { patientId } = await params
  const [reachable, overview] = await Promise.all([
    readMedlatencyHealth(),
    readMedlatencyOverview(patientId),
  ])
  if (!reachable) {
    return Response.json({ error: 'MedLatency local service is not reachable.' }, { status: 502 })
  }
  if (overview == null) {
    return Response.json({ error: 'No MedLatency overview for this patient.' }, { status: 404 })
  }
  return Response.json(overview, { headers: { 'cache-control': 'no-store' } })
}
