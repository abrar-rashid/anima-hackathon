import type { SiteId, SourceClassification } from '@/domain/types'

export interface TeamContext {
  team: string
  world: string
  scopes: string[]
}

export interface SimulatorClock {
  now: number
  paused: boolean
  speed: number
}

export interface VersionedRecord {
  id: string
  kind: string
  version: number
  patientId?: string
  owner: string
  visibleTo: string[]
  status: string
  createdAt: number
  data: unknown
  provenance?: unknown
}

export interface Page<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}

export interface VersionedResult {
  id: string
  version: number
  patientId: string
  collectedAt: number
  visibleTo: string[]
  owner: string
  status: string
  classification: SourceClassification | null
  analytes: {
    id: string
    name: string
    unit: string
    value: number
    referenceLow: number
    referenceHigh: number
  }[]
}

export interface ActivityEntry {
  id: string
  time: number
  type: string
  actor: string
  resourceId?: string
  patientId?: string
  detail: string
}

export type OpenAPIDocument = Record<string, unknown>

export interface AnimaReadPort {
  getTeam(): Promise<TeamContext>
  getClock(): Promise<SimulatorClock>
  getOpenApi(): Promise<OpenAPIDocument>
  getCurrentResult(patientId: string): Promise<VersionedResult | null>
  getSiteRecords(site: SiteId, patientId: string, cursor?: string): Promise<Page<VersionedRecord>>
  getActivity(caseId: string, resourceIds: string[]): Promise<ActivityEntry[]>
  getGpConnectBundle(patientId: string): Promise<unknown>
}
