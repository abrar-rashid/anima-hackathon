import type {
  ActionProposal,
  ExtractedTask,
  Finding,
  ScanWindow,
  Site,
  SiteDescriptor,
  SimPatient,
  SimResource,
  Sourced,
} from '@/ctl/contracts'

/** One provenance entry (a creation or a change), flattened for the spine. */
export interface TimelineEntry {
  /** `${resourceId}:${version}` — unique and traceable back to the source. */
  key: string
  time: number
  site: Site
  actorName: string
  actorKind: string
  action: string
  version: number
  resourceId: string
  resourceKind: string
  resourceTitle: string
}

/** A single entry, or a collapsed run of low-signal repetition. */
export type TimelineItem =
  | { kind: 'single'; entry: TimelineEntry }
  | {
      kind: 'run'
      groupKey: string
      site: Site
      resourceKind: string
      action: string
      count: number
      firstTime: number
      lastTime: number
      entries: TimelineEntry[]
    }

export interface TimelineDayGroup {
  dayKey: string
  dayLabel: string
  items: TimelineItem[]
}

export interface ExtractionSummary {
  tasks: ExtractedTask[]
  /** Why the list is empty or short. Null when nothing was withheld. */
  reason: string | null
  spansRead: number
  resourcesRead: number
}

export interface ProposalOutcome {
  proposal: ActionProposal | null
  /** The finding the proposal was built for, so the UI can show why this one. */
  finding: Finding | null
  /** Why there is no proposal, when there isn't one. */
  reason: string | null
}

/** Everything the patient loop page renders. Assembled once per read. */
export interface PatientLoopPayload {
  patientId: string
  now: number
  patient: SimPatient | null
  /** Set when the patient directory lookup itself failed (distinct from "not found"). */
  patientLookupError?: string
  window: ScanWindow
  /** This patient's resources, merged and de-duplicated across every site read. */
  resources: SimResource[]
  timeline: TimelineDayGroup[]
  tasks: SimResource[]
  findings: Finding[]
  extraction: ExtractionSummary
  /** Discharge summaries / documents carrying free text for this patient. */
  documents: SimResource[]
  proposal: ProposalOutcome
  sites: SiteDescriptor[]
}

export type PatientLoopSourced = Sourced<PatientLoopPayload>

export interface ResourceLookup {
  byId: Map<string, SimResource>
}

export function buildResourceLookup(resources: SimResource[]): ResourceLookup {
  const byId = new Map<string, SimResource>()
  for (const resource of resources) byId.set(resource.id, resource)
  return { byId }
}
