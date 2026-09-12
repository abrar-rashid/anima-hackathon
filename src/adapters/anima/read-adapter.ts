import type { SiteId } from '@/domain/types'
import type { AnimaClient } from '@/adapters/anima/client'
import { bloodReportFrom, classifyBloodReport, toVersionedRecord } from '@/adapters/anima/mapping'
import type {
  ActivityEntry,
  AnimaReadPort,
  OpenAPIDocument,
  Page,
  SimulatorClock,
  TeamContext,
  VersionedRecord,
  VersionedResult,
} from '@/ports/anima-read-port'

const PAGE_LIMIT = 100

interface ViewBody {
  now?: number
  resources?: unknown[]
  resourceTotal?: number
  resourceOffset?: number
  resourceLimit?: number
  events?: unknown[]
}

interface ClockBody {
  now?: number
  paused?: boolean
  speed?: number
  events?: unknown[]
}

interface RawEvent {
  id?: string
  time?: number
  type?: string
  actor?: string
  resourceId?: string
  patientId?: string
  detail?: string
}

export class AnimaReadAdapter implements AnimaReadPort {
  constructor(private readonly client: AnimaClient) {}

  async getTeam(): Promise<TeamContext> {
    const { status, body } = await this.client.request<TeamContext>('/api/team')
    if (status !== 200) throw new Error(`Anima getTeam failed: ${status}`)
    return { team: body.team, world: body.world, scopes: body.scopes }
  }

  async getClock(): Promise<SimulatorClock> {
    const { status, body } = await this.client.request<ClockBody>('/api/clock')
    if (status !== 200) throw new Error(`Anima getClock failed: ${status}`)
    return { now: body.now ?? 0, paused: Boolean(body.paused), speed: body.speed ?? 0 }
  }

  async getOpenApi(): Promise<OpenAPIDocument> {
    const { status, body } = await this.client.request<OpenAPIDocument>('/openapi.json')
    if (status !== 200) throw new Error(`Anima getOpenApi failed: ${status}`)
    return body
  }

  async getCurrentResult(patientId: string): Promise<VersionedResult | null> {
    const page = await this.getSiteRecords('diagnostics', patientId)
    const reports = page.items
      .map((record) => bloodReportFrom(record))
      .filter((report): report is NonNullable<typeof report> => report !== null)
    if (reports.length === 0) return null

    const latestCollected = Math.max(...reports.map((report) => report.collectedAt))
    const latest = reports.filter((report) => report.collectedAt === latestCollected)
    latest.sort((a, b) => {
      const aOut = classifyBloodReport(a) ? 0 : 1
      const bOut = classifyBloodReport(b) ? 0 : 1
      return aOut - bOut || a.id.localeCompare(b.id)
    })
    const chosen = latest[0]
    if (!chosen) return null
    return {
      id: chosen.id,
      version: chosen.version,
      patientId: chosen.patientId,
      collectedAt: chosen.collectedAt,
      visibleTo: chosen.visibleTo,
      owner: chosen.owner,
      status: chosen.status,
      classification: classifyBloodReport(chosen),
      analytes: chosen.analytes,
    }
  }

  async getSiteRecords(site: SiteId, patientId: string, cursor?: string): Promise<Page<VersionedRecord>> {
    const startOffset = cursor ? Number.parseInt(cursor, 10) : 0
    const items: VersionedRecord[] = []
    let offset = Number.isFinite(startOffset) && startOffset > 0 ? startOffset : 0
    let total = 0

    while (true) {
      const query = new URLSearchParams({
        patient: patientId,
        offset: String(offset),
        limit: String(PAGE_LIMIT),
      })
      const { status, body } = await this.client.request<ViewBody>(`/api/sites/${site}/view?${query.toString()}`)
      if (status !== 200) throw new Error(`Anima getSiteRecords failed: ${status}`)
      total = typeof body.resourceTotal === 'number' ? body.resourceTotal : 0
      const resources = Array.isArray(body.resources) ? body.resources : []
      items.push(...resources.map((resource) => toVersionedRecord(resource)))
      if (resources.length === 0) break
      offset += resources.length
      if (offset >= total) break
    }

    return {
      items,
      total,
      offset: Number.isFinite(startOffset) && startOffset > 0 ? startOffset : 0,
      limit: PAGE_LIMIT,
    }
  }

  async getActivity(caseId: string, resourceIds: string[]): Promise<ActivityEntry[]> {
    void caseId
    const clock = await this.client.request<ClockBody>('/api/clock')
    const view = await this.client.request<ViewBody>('/api/sites/gp/view?offset=0&limit=100')
    const merged = [...asEvents(clock.body?.events), ...asEvents(view.body?.events)]
    const seen = new Set<string>()
    const allow = new Set(resourceIds)
    const entries: ActivityEntry[] = []
    for (const event of merged) {
      if (!event.id || seen.has(event.id)) continue
      if (allow.size > 0 && (!event.resourceId || !allow.has(event.resourceId))) continue
      seen.add(event.id)
      entries.push({
        id: event.id,
        time: event.time ?? 0,
        type: event.type ?? 'unknown',
        actor: event.actor ?? 'unknown',
        resourceId: event.resourceId,
        patientId: event.patientId,
        detail: event.detail ?? '',
      })
    }
    return entries.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
  }
}

function asEvents(value: unknown): RawEvent[] {
  return Array.isArray(value) ? (value as RawEvent[]) : []
}
