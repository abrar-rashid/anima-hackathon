/**
 * Shared vocabulary for Close The Loop.
 *
 * Every type here describes data that came from the Anima simulator. If a
 * field is optional it is because the source may omit it — in that case the UI
 * renders an explicit absence, never a substituted default.
 *
 * See docs/superpowers/specs/2026-09-12-close-the-loop-overhaul.md
 */

/** The seven service scopes our team key can read, plus the patient lens. */
export const SITES = [
  'gp',
  'hospital',
  'community',
  'pharmacy',
  'diagnostics',
  'referrals',
  'wearables',
] as const

export type Site = (typeof SITES)[number]

/** A site as the simulator describes it. Names come from GET /api/catalogue. */
export interface SiteDescriptor {
  id: string
  name: string
  subtitle?: string
  color?: string
  kind?: string
}

/** Who or what caused a change. Straight from provenance. */
export interface Actor {
  kind: string
  name: string
}

export interface ProvenanceEntry {
  time: number
  actor: Actor
  action: string
  source: string
  version: number
}

export interface Provenance {
  created?: ProvenanceEntry
  changes: ProvenanceEntry[]
  recovery?: Record<string, unknown>
}

/**
 * A resource exactly as a site view returns it, normalised only in that we
 * guarantee the shape. No value is computed or defaulted here.
 */
export interface SimResource {
  id: string
  kind: string
  title: string
  status: string
  /** Source-supplied clinical priority. NEVER inferred by us. */
  priority?: string
  owner?: string
  patientId?: string
  createdAt?: number
  dueAt?: number
  version: number
  visibleTo: string[]
  data: Record<string, unknown>
  provenance: Provenance
  /** Which site view this came from. Ours, for traceability, not from the API. */
  site: Site
}

/** A patient from GET /api/sites/{site}/patients. */
export interface SimPatient {
  id: string
  name: string
  birthDate?: string
  conditions: string[]
  goals: string[]
  needs: string[]
  localIds: Record<string, string>
  synthetic?: boolean
}

/** An event from GET /api/clock or a site view. */
export interface SimEvent {
  id: string
  time: number
  type: string
  actor?: string
  detail?: string
  patientId?: string
  resourceId?: string
  visibleTo: string[]
}

export interface SimClock {
  now: number
  paused: boolean
  speed: number
}

/**
 * A window of resources we actually looked at. Carried alongside every derived
 * number so the UI can state its denominator honestly.
 *
 * Resource ordering in the API is insertion order, so we scan a head window
 * (curated scenario data) and a tail window (live activity) per site rather
 * than claiming to have read the whole population.
 */
export interface ScanWindow {
  /** Resources we read and evaluated. */
  scanned: number
  /** What the API says exists in total. Usually far larger than `scanned`. */
  total: number
  sites: Site[]
  /** Simulator time at which the scan was evaluated. */
  now: number
  /** Sites whose read failed, so the UI can name the gap. */
  failedSites: Site[]
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export type DetectorId =
  | 'overdue-task'
  | 'awaiting-result'
  | 'unprocessed-handover'
  | 'unaccepted-referral'
  | 'undispensed-prescription'
  | 'unanswered-request'
  | 'stalled-loop'

/** How badly a deadline has been missed. Computed from time only. */
export type BreachState = 'breached' | 'due-soon' | 'on-time' | 'no-deadline'

/**
 * A citation back to the exact source a claim was read from. Every finding and
 * every extracted task must carry at least one.
 */
export interface Citation {
  resourceId: string
  version: number
  site: Site
  /** Where in the resource: a data path, or a section key for free text. */
  field?: string
  /** Verbatim source text, when the claim came from free text. */
  quote?: string
}

/**
 * Something written down but not finished. Produced only by pure detectors.
 *
 * A finding never carries a clinical judgement. `priority` is whatever the
 * source record said; `breach` and `overdueMs` are arithmetic on timestamps.
 */
export interface Finding {
  id: string
  detector: DetectorId
  /** Plain-language statement of what is unfinished. */
  summary: string
  patientId?: string
  site: Site
  /** Accountable owner as the source records it. */
  owner?: string
  /** Source-supplied priority, untouched. */
  priority?: string
  status: string
  dueAt?: number
  createdAt?: number
  breach: BreachState
  /** Milliseconds past `dueAt`, or undefined when there is no deadline. */
  overdueMs?: number
  /** Milliseconds since the last provenance change. */
  staleMs?: number
  citations: Citation[]
}

// ---------------------------------------------------------------------------
// Latency
// ---------------------------------------------------------------------------

/**
 * Elapsed time for one observed transition, taken from provenance entries.
 * Never estimated.
 */
export interface StepObservation {
  fromAction: string
  toAction: string
  site: Site
  elapsedMs: number
  resourceId: string
}

export interface LatencyBucket {
  label: string
  /** Number of observations. Always rendered with the figure. */
  n: number
  medianMs: number
  p90Ms: number
  maxMs: number
}

/** A fraction where the denominator must always be shown. */
export interface Rate {
  label: string
  numerator: number
  denominator: number
}

export interface LatencyReport {
  steps: LatencyBucket[]
  breakage: Rate[]
  window: ScanWindow
}

// ---------------------------------------------------------------------------
// Extracted tasks (LLM, free text only)
// ---------------------------------------------------------------------------

/**
 * The fixed task-tag bank. The model maps free text onto one of these and may
 * never invent a tag. Adding a tag is a deliberate code change.
 */
export const TASK_TAGS = [
  'book-follow-up-appointment',
  'chase-outstanding-result',
  'arrange-blood-test',
  'medication-review',
  'refer-to-specialist',
  'arrange-home-visit',
  'contact-patient',
  'review-correspondence',
  'monitor-observation',
  'update-care-plan',
  'confirm-follow-up-arrangements',
  'arrange-post-discharge-monitoring',
] as const

export type TaskTag = (typeof TASK_TAGS)[number]

export const CLINICAL_PRIORITIES = ['emergency', 'urgent', 'standard'] as const
export type ClinicalPriority = (typeof CLINICAL_PRIORITIES)[number]

/** Marker for a field the source did not supply. Never replaced by a guess. */
export const NOT_SUPPLIED = 'not-supplied-by-source' as const

/**
 * A task the model read out of free text. A proposal, never an executed fact.
 *
 * `citation.quote` is mandatory: if the model cannot quote the source text that
 * justifies the task, the candidate is rejected before it reaches the UI.
 */
export interface ExtractedTask {
  tag: TaskTag
  /** The model's restatement, for display. The quote is the evidence. */
  summary: string
  patientId: string
  citation: Citation & { quote: string }
  /**
   * Source-supplied priority only. The model does not choose this; it is
   * carried over from the resource, or NOT_SUPPLIED.
   */
  priority: ClinicalPriority | typeof NOT_SUPPLIED
  /** A deadline only if the text states one. Never invented. */
  dueAt?: number
  snomedId: string | typeof NOT_SUPPLIED
}

/**
 * The Team 12 ClinicalTaskEpisode record. Fields the source cannot supply are
 * set to NOT_SUPPLIED rather than fabricated.
 */
export interface ClinicalTaskEpisode {
  episode_id: string
  timestamp: string
  task_id: string
  status: string
  owner: string
  note: string
  deadline: string
  clinical_priority: ClinicalPriority | typeof NOT_SUPPLIED
  snomed_id: string
  performed_by: string
  sample_id: string
  requested_id: string
}

// ---------------------------------------------------------------------------
// Effectuator
// ---------------------------------------------------------------------------

/** Reasons a write is refused. Each disables the control and says why. */
export type HardStop =
  | 'patient-mismatch'
  | 'destination-mismatch'
  | 'missing-staff-identity'
  | 'source-absent'
  | 'source-not-current'
  | 'unsupported-action'
  | 'missing-required-field'
  | 'idempotency-conflict'
  | 'stale-source-version'
  | 'requires-clinical-interpretation'

/**
 * A concrete write we are offering to perform, with everything a human needs
 * to judge it before approving.
 */
export interface ActionProposal {
  /** One of the 43 action types the live schema exposes. */
  actionType: string
  site: Site
  /** The exact body we will POST. Rendered verbatim for approval. */
  payload: Record<string, unknown>
  /** Versions this proposal was built from; revalidated before execution. */
  sourceVersions: { id: string; version: number }[]
  /** Deterministic key; hashed to a conforming UUID at execution. */
  idempotencyKey: string
  /** Why we are proposing it, citing source. */
  rationale: string
  citations: Citation[]
  /** Present and non-empty means the control is disabled. */
  hardStops: HardStop[]
  /** False when the live OpenAPI document does not expose this action. */
  supported: boolean
}

/** The outcome of an executed write, including proof by readback. */
export interface ActionReceipt {
  ok: boolean
  actionType: string
  site: Site
  httpStatus: number
  /** The resource the API returned, which doubles as the readback. */
  resource?: SimResource
  /** True only when a re-read returned a resource matching what we expected. */
  provenByReadback: boolean
  /** Simulator time the write landed, from the returned resource. */
  simulatorTime?: number
  message?: string
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/**
 * Wraps any payload with where it came from and when, so a surface can render
 * honestly while the simulator is unreachable. The API returned 502 for about
 * ten minutes while this was written; degraded must never mean blank.
 */
export interface Sourced<T> {
  data: T
  /** Wall-clock time we fetched it. */
  fetchedAt: number
  /** True when served from cache after a failed refresh. */
  stale: boolean
  /** Set when the live read failed, so the UI can name the reason. */
  error?: string
}
