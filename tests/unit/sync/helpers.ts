import { FakeClock } from '@/adapters/fake/clock'
import { FakeRead } from '@/adapters/fake/anima-read'
import type { SiteId } from '@/domain/types'
import type {
  AnimaReadPort,
  OpenAPIDocument,
  Page,
  SimulatorClock,
  TeamContext,
  VersionedRecord,
  VersionedResult,
} from '@/ports/anima-read-port'
import { emptyCursor, SIMULATOR_EPOCH_MS, type SyncCursor, type SyncCursorKey } from '@/sync/cursor'

export const WORLD = 'team-ea32f6302052'
export const TEAM = 'team12'
export const PATIENT_ID = 'SIM-000001'
export const SITE: SiteId = 'gp'
export const NOW = SIMULATOR_EPOCH_MS

export const KEY: SyncCursorKey = {
  world: WORLD,
  team: TEAM,
  site: SITE,
  patientId: PATIENT_ID,
}

export function record(partial: Partial<VersionedRecord> & Pick<VersionedRecord, 'id'>): VersionedRecord {
  return {
    kind: 'task',
    version: 1,
    patientId: PATIENT_ID,
    owner: SITE,
    visibleTo: [SITE],
    status: 'open',
    createdAt: NOW,
    data: {},
    ...partial,
  }
}

export function seed(read: FakeRead, records: VersionedRecord[]): void {
  for (const item of records) {
    read.addRecord(item.patientId ?? PATIENT_ID, item)
  }
}

export function seededRead(records: VersionedRecord[], clockNow = NOW): FakeRead {
  const clock = new FakeClock({ now: clockNow, paused: true, speed: 60 })
  const read = new FakeRead({ clock })
  seed(read, records)
  return read
}

export function startCursor(clockNow = NOW): SyncCursor {
  return emptyCursor(KEY, { now: clockNow, paused: true, speed: 60 })
}

/** One page at a time, so mid-pagination resume can be exercised. */
export class PageCappedRead implements AnimaReadPort {
  constructor(
    private readonly inner: AnimaReadPort,
    readonly pageSize: number,
  ) {}

  getTeam(): Promise<TeamContext> {
    return this.inner.getTeam()
  }

  getClock(): Promise<SimulatorClock> {
    return this.inner.getClock()
  }

  getOpenApi(): Promise<OpenAPIDocument> {
    return this.inner.getOpenApi()
  }

  getCurrentResult(patientId: string): Promise<VersionedResult | null> {
    return this.inner.getCurrentResult(patientId)
  }

  async getSiteRecords(site: SiteId, patientId: string, cursor?: string): Promise<Page<VersionedRecord>> {
    const page = await this.inner.getSiteRecords(site, patientId, cursor)
    return {
      items: page.items.slice(0, this.pageSize),
      total: page.total,
      offset: page.offset,
      limit: this.pageSize,
    }
  }

  getActivity(caseId: string, resourceIds: string[]): Promise<import('@/ports/anima-read-port').ActivityEntry[]> {
    return this.inner.getActivity(caseId, resourceIds)
  }

  getGpConnectBundle(patientId: string): Promise<unknown> {
    return this.inner.getGpConnectBundle(patientId)
  }
}

export class FlakyRead implements AnimaReadPort {
  failuresRemaining: number
  calls = 0
  lastThrownAtOffset: number | null = null

  constructor(
    private readonly inner: AnimaReadPort,
    private readonly options: { failCount: number; status?: number; whenOffset?: number },
  ) {
    this.failuresRemaining = options.failCount
  }

  getTeam(): Promise<TeamContext> {
    return this.inner.getTeam()
  }

  getClock(): Promise<SimulatorClock> {
    return this.inner.getClock()
  }

  getOpenApi(): Promise<OpenAPIDocument> {
    return this.inner.getOpenApi()
  }

  getCurrentResult(patientId: string): Promise<VersionedResult | null> {
    return this.inner.getCurrentResult(patientId)
  }

  async getSiteRecords(site: SiteId, patientId: string, cursor?: string): Promise<Page<VersionedRecord>> {
    this.calls += 1
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0
    const shouldFail =
      this.failuresRemaining > 0 &&
      (this.options.whenOffset === undefined || offset === this.options.whenOffset)
    if (shouldFail) {
      this.failuresRemaining -= 1
      this.lastThrownAtOffset = offset
      const status = this.options.status ?? 502
      throw Object.assign(new Error(`Anima getSiteRecords failed: ${status}`), { status })
    }
    return this.inner.getSiteRecords(site, patientId, cursor)
  }

  getActivity(caseId: string, resourceIds: string[]): Promise<import('@/ports/anima-read-port').ActivityEntry[]> {
    return this.inner.getActivity(caseId, resourceIds)
  }

  getGpConnectBundle(patientId: string): Promise<unknown> {
    return this.inner.getGpConnectBundle(patientId)
  }
}
