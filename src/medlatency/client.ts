import 'server-only'

const DEFAULT_URL = 'http://127.0.0.1:8765'
const TIMEOUT_MS = 1500

function baseUrl(): string {
  return (process.env.MEDLATENCY_URL ?? DEFAULT_URL).replace(/\/$/, '')
}

async function readJson(path: string): Promise<{ status: number; body: unknown } | null> {
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
    try {
      return { status: response.status, body: await response.json() }
    } catch {
      return { status: response.status, body: null }
    }
  } catch {
    return null
  }
}

export async function readMedlatencyHealth(): Promise<boolean> {
  const result = await readJson('/api/health')
  if (!result || result.body == null || typeof result.body !== 'object') return false
  return (result.body as { status?: unknown }).status === 'ok'
}

export async function readMedlatencyOverview(patientId: string): Promise<unknown | null> {
  if (!patientId) return null
  const result = await readJson(`/api/patients/${encodeURIComponent(patientId)}/overview`)
  if (!result || result.status === 404 || result.status >= 400) return null
  return result.body
}

export async function loadMedlatencyBundle(
  patientIds: readonly string[],
): Promise<{ reachable: boolean; packets: unknown[] }> {
  const [reachable, ...overviews] = await Promise.all([
    readMedlatencyHealth(),
    ...patientIds.map((id) => readMedlatencyOverview(id)),
  ])
  if (!reachable) return { reachable: false, packets: [] }
  return {
    reachable: true,
    packets: overviews.filter((packet): packet is NonNullable<typeof packet> => packet != null),
  }
}
