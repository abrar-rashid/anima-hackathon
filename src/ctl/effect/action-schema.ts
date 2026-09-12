import { createAnimaClient } from '@/adapters/anima/client'

/**
 * What the live API says it accepts.
 *
 * `ActionProposal.supported` is answered from this document rather than from a
 * list we maintain, so an action the simulator has removed or renamed shows up
 * as unsupported instead of failing at the point of the write.
 *
 * The document is authoritative about action *types* and top-level *fields*.
 * It is not authoritative about which fields each action needs: the `Action`
 * schema marks only `type` as required and validates the rest server-side. So
 * `REQUIRED_FIELDS_BY_ACTION` below is ours, derived from the request examples
 * the document publishes, and is the one place in this layer where the live
 * schema could not answer the question for us.
 */

export interface LiveActionSchema {
  actionTypes: readonly string[]
  /** Top-level property names the `Action` schema exposes. */
  fields: readonly string[]
  /** The `target` enum: valid write destinations. */
  targets: readonly string[]
  /** The `documentCommand` enum. */
  documentCommands: readonly string[]
  /** The `clientRequestId` pattern, so the format can be asserted, not assumed. */
  clientRequestIdPattern?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringEnum(schema: unknown): readonly string[] {
  const values = asRecord(schema).enum
  return Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string') : []
}

/** Null when the document does not contain an `Action` schema we recognise. */
export function parseLiveActionSchema(doc: unknown): LiveActionSchema | null {
  const action = asRecord(asRecord(asRecord(asRecord(doc).components).schemas).Action)
  const properties = asRecord(action.properties)
  const actionTypes = stringEnum(properties.type)
  if (actionTypes.length === 0) return null

  const pattern = asRecord(properties.clientRequestId).pattern

  return {
    actionTypes,
    fields: Object.keys(properties),
    targets: stringEnum(properties.target),
    documentCommands: stringEnum(properties.documentCommand),
    ...(typeof pattern === 'string' ? { clientRequestIdPattern: pattern } : {}),
  }
}

/**
 * Fields we will not POST without, per action type.
 *
 * Ours, not the document's — see the note at the top of this file. Absent from
 * this table means we make no claim, and no `missing-required-field` stop is
 * raised beyond `type`.
 */
export const REQUIRED_FIELDS_BY_ACTION: Readonly<Record<string, readonly string[]>> = {
  create_task: ['patientId', 'title'],
  create_referral: ['patientId', 'title'],
  order_test: ['patientId', 'title', 'bloodTestOrder'],
  book_appointment: ['patientId'],
  schedule_visit: ['patientId'],
  send_message: ['patientId', 'messagingCommand'],
  save_consultation: ['patientId', 'title'],
  save_problem: ['patientId', 'title'],
  draft_prescription: ['patientId', 'medicationOrder'],
  connect_device: ['patientId'],
  process_document: ['resourceId', 'documentCommand', 'expectedVersion'],
  review: ['resourceId', 'expectedVersion'],
  accept: ['resourceId', 'expectedVersion'],
  complete: ['resourceId', 'expectedVersion'],
  reject: ['resourceId', 'expectedVersion'],
  dispense: ['resourceId', 'expectedVersion'],
  collect: ['resourceId', 'expectedVersion'],
  share_record: ['patientId'],
}

// ---------------------------------------------------------------------------
// Live load
// ---------------------------------------------------------------------------

const OPENAPI_PATH = '/openapi.json'
const TTL_MS = 300_000

let cached: { value: LiveActionSchema; at: number } | null = null

/** Replace the transport in tests; production reads the live document. */
export type OpenApiFetcher = () => Promise<unknown>

async function defaultFetcher(): Promise<unknown> {
  const { body } = await createAnimaClient().request<unknown>(OPENAPI_PATH)
  return body
}

/**
 * Null when the document cannot be read. Callers must treat that as "cannot
 * verify" and refuse the write, not as "probably fine": the API was returning
 * 502 for ten minutes during development, and guessing then is exactly how an
 * unsupported action reaches a patient record.
 */
export async function loadLiveActionSchema(
  fetcher: OpenApiFetcher = defaultFetcher,
): Promise<LiveActionSchema | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  try {
    const parsed = parseLiveActionSchema(await fetcher())
    if (!parsed) return null
    cached = { value: parsed, at: Date.now() }
    return parsed
  } catch {
    return null
  }
}

export function resetLiveActionSchemaCache(): void {
  cached = null
}
