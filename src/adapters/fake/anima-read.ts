import { bloodReportFrom, classifyBloodReport } from '@/adapters/anima/mapping'
import { FakeClock } from '@/adapters/fake/clock'
import type { SiteId } from '@/domain/types'
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

const DEFAULT_TEAM: TeamContext = {
  team: 'team12',
  world: 'team-ea32f6302052',
  scopes: ['gp', 'hospital', 'community', 'pharmacy', 'diagnostics', 'referrals', 'wearables'],
}

export class FakeRead implements AnimaReadPort {
  readonly records = new Map<string, VersionedRecord[]>()
  readonly events: ActivityEntry[] = []
  team: TeamContext
  openApi: OpenAPIDocument
  private readonly clock: FakeClock

  constructor(options?: { clock?: FakeClock; team?: TeamContext; openApi?: OpenAPIDocument }) {
    this.clock = options?.clock ?? new FakeClock()
    this.team = options?.team ?? { ...DEFAULT_TEAM, scopes: [...DEFAULT_TEAM.scopes] }
    this.openApi = options?.openApi ?? {}
  }

  addRecord(patientId: string, record: VersionedRecord): void {
    const existing = this.records.get(patientId) ?? []
    const index = existing.findIndex((item) => item.id === record.id)
    if (index >= 0) existing[index] = record
    else existing.push(record)
    this.records.set(patientId, existing)
  }

  addEvent(event: ActivityEntry): void {
    this.events.push(event)
  }

  async getTeam(): Promise<TeamContext> {
    return { ...this.team, scopes: [...this.team.scopes] }
  }

  async getClock(): Promise<SimulatorClock> {
    return this.clock.read()
  }

  async getOpenApi(): Promise<OpenAPIDocument> {
    return this.openApi
  }

  async getCurrentResult(patientId: string): Promise<VersionedResult | null> {
    const reports = (this.records.get(patientId) ?? [])
      .map((record) => bloodReportFrom(record))
      .filter((report): report is NonNullable<typeof report> => report !== null)
    if (reports.length === 0) return null
    const latestCollected = Math.max(...reports.map((report) => report.collectedAt))
    const latest = reports
      .filter((report) => report.collectedAt === latestCollected)
      .sort((a, b) => {
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
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0
    const all = (this.records.get(patientId) ?? []).filter(
      (record) => record.owner === site || record.visibleTo.includes(site),
    )
    const items = all.slice(offset)
    return { items, total: all.length, offset, limit: all.length }
  }

  async getActivity(caseId: string, resourceIds: string[]): Promise<ActivityEntry[]> {
    void caseId
    const allow = new Set(resourceIds)
    return this.events.filter((event) => allow.size === 0 || (event.resourceId && allow.has(event.resourceId)))
  }
}
