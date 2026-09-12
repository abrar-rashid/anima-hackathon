import type { Citation, Finding, SimPatient, Site, SiteDescriptor } from '@/ctl/contracts'
import type { BloodWorkflow } from './blood-workflow'
import type { WardlineStepChain } from './step-intervals'

/**
 * Operations payload for the Wardline shell. Every field is sourced or an
 * arithmetic roll-up of sourced fields. Nothing here is a clinical inference.
 */
export type WardlineNav = 'tasks' | 'patients' | 'sources' | 'map'

export interface WardlineTask {
  id: string
  title: string
  patientId: string | null
  patientName: string | null
  site: Site
  status: string
  owner: string | null
  /** Source-supplied priority. Null when the record did not set one. */
  priority: string | null
  dueAt: number | null
  createdAt: number | null
  breach: Finding['breach']
  overdueMs: number | null
  detector: string
  citations: Citation[]
}

export interface WardlinePatient extends SimPatient {
  /** Open findings linked to this patient in the current scan window. */
  linkedTaskCount: number
  /** 0 = pinned first (Eleanor Chen). Higher = later. Null if unpinned. */
  pinRank: number | null
  /** Directory-record richness plus linked-task count. Not a clinical score. */
  operationalWeight: number
}

export interface WardlineSourceCard {
  id: string
  name: string
  subtitle: string | null
  kind: string | null
  linkedTasks: number
  urgentTasks: number
  evidencedTasks: number
  /** Resource kinds actually present in the scan for this site. */
  projections: string[]
}

export interface WardlineStats {
  active: number
  emergency: number
  completed: number
  evidenced: number
  total: number
}

export interface WardlineMedlatency {
  reachable: boolean
  analysisModes: string[]
  validatedPatients: number
  note: string
}

export interface WardlinePayload {
  world: string
  live: boolean
  fetchedAt: number
  stale: boolean
  error?: string
  clock: { now: number; paused: boolean; speed: number }
  stats: WardlineStats
  tasks: WardlineTask[]
  patients: WardlinePatient[]
  /** How many directory rows we actually hold. */
  profilesShown: number
  /** What the directory API reports as the full population. */
  directoryTotal: number
  sources: WardlineSourceCard[]
  sites: SiteDescriptor[]
  scan: { scanned: number; total: number; sites: Site[]; failedSites: Site[] }
  /** Provenance chains with measured waits between successive actions. */
  chains: WardlineStepChain[]
  /** One track per synthetic blood-result record, steps from sourced timestamps only. */
  bloodWorkflows: BloodWorkflow[]
  /** Loopback MedLatency health and analysis provenance. Not a clinical claim. */
  medlatency: WardlineMedlatency
}
