/**
 * Read-only preflight against the Anima simulator, plus one optional probe write
 * that is only sent when the operator types PROBE at the prompt.
 *
 * Writes: fixtures/openapi.redacted.json, fixtures/preflight.json,
 *         fixtures/view.gp.<patient>.json, fixtures/view.diagnostics.<patient>.json
 */
import { createInterface } from 'node:readline/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.ANIMA_SIM_BASE_URL ?? 'https://sim.animahacks.com'
const KEY = process.env.ANIMA_SIM_API_KEY

if (!KEY) {
  console.error('ANIMA_SIM_API_KEY is empty. Populate .env.local before running preflight.')
  process.exit(1)
}

const FIXTURES = path.resolve(import.meta.dirname, '..', 'fixtures')

const REDACT_KEYS = new Set(['text', 'body', 'clinicalDetails', 'detail', 'notes', 'summary'])

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return /Bearer\s+\S+/.test(value) ? '[redacted]' : value
  }
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k) && typeof v === 'string' ? '[redacted]' : redact(v)
    }
    return out
  }
  return value
}

async function get<T>(pathname: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
  })
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, body: body as T }
}

interface Analyte {
  id: string
  name: string
  unit: string
  value: number
  referenceLow: number
  referenceHigh: number
}

interface SimResource {
  id: string
  kind: string
  version: number
  patientId?: string
  owner: string
  visibleTo: string[]
  status: string
  createdAt: number
  data: Record<string, unknown>
}

interface SimView {
  now: number
  resources: SimResource[]
  resourceTotal: number
  resourceOffset: number
  resourceLimit: number
  events: unknown[]
}

const ELIGIBILITY_RULE_TEXT =
  'An analyte value lies outside the reference range supplied by the source laboratory (referenceLow..referenceHigh). No urgency, diagnosis or treatment is inferred.'

function firstOutOfRange(analytes: Analyte[]): Analyte | null {
  for (const a of analytes) {
    if (typeof a.value !== 'number') continue
    if (typeof a.referenceLow === 'number' && a.value < a.referenceLow) return a
    if (typeof a.referenceHigh === 'number' && a.value > a.referenceHigh) return a
  }
  return null
}

async function viewPages(site: string, patientId: string): Promise<SimView | null> {
  const first = await get<SimView>(`/api/sites/${site}/view?patient=${patientId}&offset=0&limit=100`)
  if (first.status !== 200 || !first.body?.resources) return null
  const view = first.body
  let offset = view.resources.length
  while (offset < view.resourceTotal && offset < 1000) {
    const next = await get<SimView>(`/api/sites/${site}/view?patient=${patientId}&offset=${offset}&limit=100`)
    if (next.status !== 200 || !next.body?.resources?.length) break
    view.resources.push(...next.body.resources)
    offset += next.body.resources.length
  }
  return view
}

async function main() {
  await mkdir(FIXTURES, { recursive: true })

  const openapi = await get<Record<string, unknown>>('/openapi.json')
  if (openapi.status !== 200) throw new Error(`openapi.json returned ${openapi.status}`)
  const doc = openapi.body as {
    paths: Record<string, Record<string, unknown>>
    components: { schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }> }
  }
  const actionEnum = doc.components?.schemas?.Action?.properties?.type?.enum ?? []
  const hasActions = Boolean(doc.paths?.['/api/sites/{site}/actions']?.post)
  for (const required of ['create_task', 'accept', 'complete', 'reject']) {
    if (!actionEnum.includes(required)) throw new Error(`Action.type enum missing ${required}`)
  }
  if (!hasActions) throw new Error('POST /api/sites/{site}/actions missing')
  await writeFile(path.join(FIXTURES, 'openapi.redacted.json'), JSON.stringify(redact(doc), null, 2))

  const team = await get<{ team?: string; world?: string; scopes?: string[] }>('/api/team')
  const clock = await get<{ now: number; paused: boolean; speed: number }>('/api/clock')
  console.log('team', JSON.stringify(team.body))
  console.log('clock', JSON.stringify({ now: clock.body?.now, paused: clock.body?.paused, speed: clock.body?.speed }))

  const patientIds: string[] = []
  for (let offset = 0; offset < 20 * 50; offset += 50) {
    const page = await get<unknown>(`/api/sites/gp/patients?offset=${offset}&limit=50`)
    if (page.status !== 200) break
    const body = page.body as { patients?: { id: string }[]; items?: { id: string }[] } | { id: string }[]
    const items = Array.isArray(body) ? body : (body.patients ?? body.items ?? [])
    if (!items.length) break
    patientIds.push(...items.map((p) => p.id))
    if (items.length < 50) break
  }
  console.log(`patients: ${patientIds.length}`)

  const candidates: {
    patientId: string
    resultId: string
    version: number
    analyte: string
    value: number
    referenceLow: number
    referenceHigh: number
    collectedAt: number
    visibleTo: string[]
  }[] = []

  const savedViews = new Map<string, SimView>()

  for (const patientId of patientIds) {
    const view = await viewPages('diagnostics', patientId)
    if (!view) continue
    savedViews.set(patientId, view)
    for (const r of view.resources) {
      if (r.kind !== 'report') continue
      const data = r.data as { kind?: string; analytes?: Analyte[]; collectedAt?: number }
      if (data.kind !== 'blood-result' || !Array.isArray(data.analytes)) continue
      const out = firstOutOfRange(data.analytes)
      if (!out) continue
      const visibleTo = r.visibleTo ?? []
      const crossSetting = ['gp', 'hospital'].filter((s) => visibleTo.includes(s)).length >= 2
      if (!crossSetting) continue
      candidates.push({
        patientId,
        resultId: r.id,
        version: r.version,
        analyte: out.name,
        value: out.value,
        referenceLow: out.referenceLow,
        referenceHigh: out.referenceHigh,
        collectedAt: data.collectedAt ?? r.createdAt,
        visibleTo,
      })
    }
  }

  candidates.sort((a, b) => b.collectedAt - a.collectedAt || a.resultId.localeCompare(b.resultId))
  const preferred = candidates.find((c) => c.patientId === 'SIM-000001')
  const selected = preferred ?? candidates[0] ?? null
  console.log(`eligible candidates: ${candidates.length}`)
  console.table(candidates.slice(0, 10))
  if (!selected) throw new Error('no eligible result found')

  const gpView = await viewPages('gp', selected.patientId)
  if (gpView) {
    await writeFile(
      path.join(FIXTURES, `view.gp.${selected.patientId}.json`),
      JSON.stringify(redact(gpView), null, 2),
    )
  }
  const diagView = savedViews.get(selected.patientId)
  if (diagView) {
    await writeFile(
      path.join(FIXTURES, `view.diagnostics.${selected.patientId}.json`),
      JSON.stringify(redact(diagView), null, 2),
    )
  }
  const gpConnect = await get<unknown>(`/api/nhs/gp-connect?patient=${selected.patientId}`)
  if (gpConnect.status === 200) {
    await writeFile(
      path.join(FIXTURES, `gp-connect.${selected.patientId}.json`),
      JSON.stringify(redact(gpConnect.body), null, 2),
    )
  }

  let acceptSupported: boolean | null = null
  let probeDetail: string | null = null
  if (process.env.COVENANT_PROBE === 'skip') {
    console.log('probe skipped (COVENANT_PROBE=skip)')
  } else {
    const tasks = (gpView?.resources ?? []).filter((r) => r.kind === 'task' && r.status !== 'completed')
    const target = tasks[0]
    if (!target) {
      console.log('no open gp task to probe; acceptSupported stays null')
    } else {
      const payload = { type: 'accept', resourceId: target.id, expectedVersion: target.version }
      console.log('PROBE PAYLOAD (POST /api/sites/gp/actions):', JSON.stringify(payload))
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      const answer = (await rl.question('Type PROBE to send this single write, anything else to skip: ')).trim()
      rl.close()
      if (answer === 'PROBE') {
        const res = await fetch(`${BASE}/api/sites/gp/actions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${KEY}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `preflight-probe-${target.id}-${target.version}`,
          },
          body: JSON.stringify(payload),
        })
        const text = await res.text()
        acceptSupported = res.status === 200
        probeDetail = `${res.status} ${text.slice(0, 300)}`
        console.log('probe result:', probeDetail)
      } else {
        console.log('probe skipped by operator')
      }
    }
  }

  const preflight = {
    world: (team.body as { world?: string })?.world ?? 'unknown',
    team: team.body,
    capturedAt: new Date().toISOString(),
    simulatorNow: clock.body?.now ?? null,
    acceptSupported,
    probeDetail,
    eligibilityRuleText: ELIGIBILITY_RULE_TEXT,
    selectedPatientId: selected.patientId,
    selectedResultId: selected.resultId,
    selectedResultVersion: selected.version,
    selectedClassification: selected,
    candidateCount: candidates.length,
    candidates: candidates.slice(0, 25),
    boundOperations: {
      actions: actionEnum,
      hasIdempotencyHeader: true,
      paths: Object.keys(doc.paths ?? {}),
    },
  }
  await writeFile(path.join(FIXTURES, 'preflight.json'), JSON.stringify(preflight, null, 2))
  console.log('wrote fixtures/preflight.json')
}

main().catch((err) => {
  console.error('preflight failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
