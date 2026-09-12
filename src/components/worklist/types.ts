import type {
  Finding,
  Rate,
  ScanWindow,
  SimPatient,
  SiteDescriptor,
  Sourced,
} from '@/ctl/contracts'

export interface WorklistPayload {
  findings: Finding[]
  rates: Rate[]
  window: ScanWindow
  patients: Record<string, SimPatient>
  sites: SiteDescriptor[]
}

export interface PatientPage {
  total: number
  items: SimPatient[]
  offset: number
}

export type WorklistSourced = Sourced<WorklistPayload>

export type WorklistNavCurrent = 'worklist' | 'insights' | 'town' | 'patient'

export interface WorklistFilters {
  site: string
  priority: string
  breach: string
  detector: string
}

export const EMPTY_FILTERS: WorklistFilters = {
  site: 'all',
  priority: 'all',
  breach: 'all',
  detector: 'all',
}
