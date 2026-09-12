import type { HardStop, SimResource, Site } from '@/ctl/contracts'
import { isTerminal } from '@/ctl/normalise/resources'
import { REQUIRED_FIELDS_BY_ACTION, type LiveActionSchema } from './action-schema'

/**
 * The conditions under which we refuse to write.
 *
 * Pure, so the same function answers at propose time (to disable the control)
 * and again at execute time against freshly read state (to enforce it). The UI
 * disabling a button is a courtesy; this is the gate.
 *
 * Every stop is derived from a comparison between the proposal and the source
 * record. None of them is a judgement about whether the write is a good idea.
 */

export interface HardStopInput {
  actionType: string
  /** The site we would POST to. */
  site: Site
  /** The exact body, including `type`. */
  payload: Record<string, unknown>
  /** The patient the finding concerns, if it names one. */
  findingPatientId?: string
  /** The cited resource as currently read. Absent means we could not read it. */
  source?: SimResource
  /** Versions the proposal was built from. */
  sourceVersions: readonly { id: string; version: number }[]
  /**
   * The live `Action` schema. Null or undefined means we could not verify what
   * the API accepts, which is itself a stop.
   */
  schema?: LiveActionSchema | null
  /** Clinical surfaces require a named approver; the town surface does not. */
  requiresStaffIdentity?: boolean
  /** App-side identity of the human approving. Never written as source data. */
  staff?: { id: string; name: string; role: string }
  idempotencyKey?: string
  /** Key to payload fingerprint for writes already submitted this session. */
  usedIdempotencyKeys?: Readonly<Record<string, string>>
  /** Set by a caller that knows a field would need a clinical decision. */
  requiresClinicalInterpretation?: boolean
}

/**
 * Actions whose required fields cannot be filled without a clinical decision:
 * a test panel and its urgency, a drug and its dose, whether a medicine may be
 * handed over, whether a problem exists. Proposing them is permitted only when
 * a caller can cite a source that already states every such field.
 */
export const CLINICAL_INTERPRETATION_ACTIONS: ReadonlySet<string> = new Set([
  'order_test',
  'draft_prescription',
  'dispense',
  'save_problem',
  'save_allergy',
  'reject',
])

/** Document stages that already record the processing we would be proposing. */
const PROCESSED_DOCUMENT_STAGES: ReadonlySet<string> = new Set(['reviewed', 'filed'])

export function evaluateHardStops(input: HardStopInput): HardStop[] {
  const stops = new Set<HardStop>()
  const { payload, source, schema, actionType } = input

  // --- the live schema must expose this action and every field we would send
  if (!schema || !schema.actionTypes.includes(actionType)) {
    stops.add('unsupported-action')
  } else if (payload.type !== actionType) {
    stops.add('missing-required-field')
  } else {
    const unknownField = Object.keys(payload).find((key) => !schema.fields.includes(key))
    if (unknownField) stops.add('unsupported-action')
    if (
      typeof payload.target === 'string' &&
      schema.targets.length > 0 &&
      !schema.targets.includes(payload.target)
    ) {
      stops.add('destination-mismatch')
    }
    if (
      typeof payload.documentCommand === 'string' &&
      schema.documentCommands.length > 0 &&
      !schema.documentCommands.includes(payload.documentCommand)
    ) {
      stops.add('unsupported-action')
    }
  }

  // --- required fields
  for (const field of REQUIRED_FIELDS_BY_ACTION[actionType] ?? []) {
    if (isEmpty(payload[field])) stops.add('missing-required-field')
  }

  // --- the patient must be the same patient everywhere
  const patients = [
    typeof payload.patientId === 'string' ? payload.patientId : undefined,
    input.findingPatientId,
    source?.patientId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0)
  if (new Set(patients).size > 1) stops.add('patient-mismatch')

  // --- the destination must be able to see what it is acting on
  const target = typeof payload.target === 'string' ? payload.target : undefined
  if (source && source.visibleTo.length > 0) {
    if (!source.visibleTo.includes(input.site)) stops.add('destination-mismatch')
    if (target && !source.visibleTo.includes(target)) stops.add('destination-mismatch')
  }

  // --- a named human must be accountable on clinical surfaces
  if (input.requiresStaffIdentity && !input.staff?.name) stops.add('missing-staff-identity')

  // --- the source must exist, still be current, and be the version we read
  const referencesResource = typeof payload.resourceId === 'string' && payload.resourceId.length > 0
  if (referencesResource && !source) stops.add('source-absent')
  if (input.sourceVersions.length > 0 && !source) stops.add('source-absent')

  if (source) {
    const cited = input.sourceVersions.find((entry) => entry.id === source.id)
    if (cited && cited.version !== source.version) stops.add('stale-source-version')
    if (
      typeof payload.expectedVersion === 'number' &&
      payload.expectedVersion !== source.version
    ) {
      stops.add('stale-source-version')
    }
    if (isTerminal(source.status)) stops.add('source-not-current')
    if (alreadyRecorded(source, actionType, payload)) stops.add('source-not-current')
  }

  // --- a replay of this key must be the same write, not a different one
  if (input.idempotencyKey && input.usedIdempotencyKeys) {
    const previous = input.usedIdempotencyKeys[input.idempotencyKey]
    if (previous !== undefined && previous !== payloadFingerprint(payload)) {
      stops.add('idempotency-conflict')
    }
  }

  // --- anything needing a clinical decision is not ours to fill
  if (input.requiresClinicalInterpretation || CLINICAL_INTERPRETATION_ACTIONS.has(actionType)) {
    stops.add('requires-clinical-interpretation')
  }

  return [...stops]
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim().length === 0
  return false
}

/**
 * True when the record already shows the processing this action would perform,
 * so the write would either be a duplicate or a false claim about new work.
 */
function alreadyRecorded(
  source: SimResource,
  actionType: string,
  payload: Record<string, unknown>,
): boolean {
  const stage = source.data.stage
  if (
    actionType === 'process_document' &&
    typeof stage === 'string' &&
    PROCESSED_DOCUMENT_STAGES.has(stage)
  ) {
    return true
  }
  const command = typeof payload.documentCommand === 'string' ? payload.documentCommand : undefined
  return source.provenance.changes.some(
    (change) => change.action === actionType || (command !== undefined && change.action === command),
  )
}

/** Stable across key order, so a replay is compared by content not by shape. */
export function payloadFingerprint(payload: Record<string, unknown>): string {
  return stableStringify(payload)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
