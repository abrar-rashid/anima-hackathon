import {
  type ActionProposal,
  type ActionReceipt,
  type HardStop,
  type SimResource,
  type Site,
} from '@/ctl/contracts'
import { clientRequestIdFrom } from '@/domain/idempotency'
import { normaliseResource } from '@/ctl/normalise/resources'
import { evaluateHardStops } from './hard-stops'
import { loadLiveActionSchema, type LiveActionSchema } from './action-schema'

/**
 * Execute an approved proposal, and prove it landed.
 *
 * The order here is the safety property. Hard stops are re-evaluated against
 * freshly read state immediately before the POST, because a proposal a human
 * approved thirty seconds ago may have been overtaken. Then the returned
 * resource is compared field by field against what the payload asked for, and
 * `provenByReadback` is set from that comparison alone. An HTTP 200 with a body
 * that does not match yields `ok: false`.
 */

export interface ReadbackCheck {
  name: string
  ok: boolean
  expected: string
  actual: string
}

/** An `ActionReceipt` plus the evidence for its verdict. */
export interface ExecutionReceipt extends ActionReceipt {
  readbackChecks: ReadbackCheck[]
  /** Stops that refused the write, re-evaluated server-side. */
  hardStops: HardStop[]
  /** Wall-clock duration. Live writes take about six seconds. */
  elapsedMs: number
}

export interface ExecuteDeps {
  postAction(site: Site, body: Record<string, unknown>): Promise<{ status: number; body: unknown }>
  /** Re-read a resource for revalidation. Null when it cannot be found. */
  readResource(site: Site, resourceId: string, patientId?: string): Promise<SimResource | null>
  invalidate(): void | Promise<void>
  loadSchema(): Promise<LiveActionSchema | null>
  clock(): number
}

export interface ExecuteOptions {
  deps?: Partial<ExecuteDeps>
  staff?: { id: string; name: string; role: string }
  requiresStaffIdentity?: boolean
  usedIdempotencyKeys?: Readonly<Record<string, string>>
}

const ACTION_PATH = (site: Site): string => `/api/sites/${site}/actions`

export async function executeProposal(
  proposal: ActionProposal,
  options: ExecuteOptions = {},
): Promise<ExecutionReceipt> {
  const deps = withDefaults(options.deps)
  const startedAt = deps.clock()
  const refuse = (message: string, hardStops: HardStop[]): ExecutionReceipt => ({
    ok: false,
    actionType: proposal.actionType,
    site: proposal.site,
    httpStatus: 0,
    provenByReadback: false,
    readbackChecks: [],
    hardStops,
    elapsedMs: deps.clock() - startedAt,
    message,
  })

  if (proposal.hardStops.length > 0) {
    return refuse(`refused: ${proposal.hardStops.join(', ')}`, proposal.hardStops)
  }
  if (!proposal.supported) {
    return refuse(
      'refused: the live OpenAPI document does not expose this action type',
      ['unsupported-action'],
    )
  }

  // --- revalidate against live state, not against the state we proposed from
  const schema = await deps.loadSchema()
  const patientId =
    typeof proposal.payload.patientId === 'string' ? proposal.payload.patientId : undefined
  const primaryId = primarySourceId(proposal)
  const source = primaryId
    ? await deps.readResource(proposal.site, primaryId, patientId).catch(() => null)
    : undefined

  if (primaryId && !source) {
    return refuse(
      `refused: could not re-read source ${primaryId} at ${proposal.site} to revalidate it before writing`,
      ['source-absent'],
    )
  }

  const stops = evaluateHardStops({
    actionType: proposal.actionType,
    site: proposal.site,
    payload: proposal.payload,
    ...(patientId ? { findingPatientId: patientId } : {}),
    ...(source ? { source } : {}),
    sourceVersions: proposal.sourceVersions,
    schema,
    requiresStaffIdentity: options.requiresStaffIdentity ?? false,
    ...(options.staff ? { staff: options.staff } : {}),
    idempotencyKey: proposal.idempotencyKey,
    ...(options.usedIdempotencyKeys ? { usedIdempotencyKeys: options.usedIdempotencyKeys } : {}),
  })
  if (stops.length > 0) {
    return refuse(`refused after revalidation: ${stops.join(', ')}`, stops)
  }

  // --- write
  const body: Record<string, unknown> = {
    ...proposal.payload,
    clientRequestId: clientRequestIdFrom(proposal.idempotencyKey),
  }

  let status: number
  let responseBody: unknown
  try {
    const response = await deps.postAction(proposal.site, body)
    status = response.status
    responseBody = response.body
  } catch (error) {
    return refuse(`write failed: ${error instanceof Error ? error.message : String(error)}`, [])
  }

  const elapsedMs = deps.clock() - startedAt
  if (status < 200 || status >= 300) {
    return {
      ok: false,
      actionType: proposal.actionType,
      site: proposal.site,
      httpStatus: status,
      provenByReadback: false,
      readbackChecks: [],
      hardStops: [],
      elapsedMs,
      message: `HTTP ${status}: ${describeBody(responseBody)}`,
    }
  }

  // --- prove. The response body is the created or mutated resource, so the
  // receipt and the readback are the same call.
  const resource = normaliseResource(responseBody, proposal.site)
  const { provenByReadback, checks } = compareReadback(proposal, resource)
  // Awaited: a subsequent read must not be served the pre-write cache entry.
  if (provenByReadback) await deps.invalidate()

  return {
    ok: provenByReadback,
    actionType: proposal.actionType,
    site: proposal.site,
    httpStatus: status,
    provenByReadback,
    readbackChecks: checks,
    hardStops: [],
    elapsedMs,
    ...(resource ? { resource } : {}),
    ...(simulatorTimeOf(resource) !== undefined ? { simulatorTime: simulatorTimeOf(resource)! } : {}),
    message: provenByReadback
      ? `submitted and proven by readback in ${elapsedMs} ms`
      : `HTTP ${status} but the returned resource did not match the write: ${checks
          .filter((check) => !check.ok)
          .map((check) => `${check.name} expected ${check.expected}, got ${check.actual}`)
          .join('; ')}`,
  }
}

/**
 * Compare what came back against what we asked for.
 *
 * Only checks the payload actually makes a claim about are evaluated, and all
 * of them must pass. The provenance check is what separates "the API echoed our
 * JSON" from "the world recorded our team doing this".
 */
export function compareReadback(
  proposal: ActionProposal,
  resource: SimResource | null,
): { provenByReadback: boolean; checks: ReadbackCheck[] } {
  const checks: ReadbackCheck[] = []
  const add = (name: string, expected: unknown, actual: unknown): void => {
    checks.push({
      name,
      ok: String(expected) === String(actual),
      expected: String(expected),
      actual: String(actual),
    })
  }

  if (!resource) {
    return {
      provenByReadback: false,
      checks: [
        {
          name: 'resource-returned',
          ok: false,
          expected: 'a resource with id, kind and status',
          actual: 'no resource in the response body',
        },
      ],
    }
  }

  const { payload } = proposal
  if (typeof payload.resourceId === 'string') add('resource-id', payload.resourceId, resource.id)
  if (typeof payload.patientId === 'string') add('patient-id', payload.patientId, resource.patientId)
  if (typeof payload.title === 'string') add('title', payload.title, resource.title)

  if (typeof payload.expectedVersion === 'number') {
    const advanced = resource.version > payload.expectedVersion
    checks.push({
      name: 'version-advanced',
      ok: advanced,
      expected: `> ${payload.expectedVersion}`,
      actual: String(resource.version),
    })
  }

  const latest = resource.provenance.changes.at(-1) ?? resource.provenance.created
  checks.push({
    name: 'provenance-records-team-write',
    ok: latest?.actor.kind === 'team',
    expected: 'latest provenance entry by an actor of kind team',
    actual: latest ? `${latest.actor.kind}/${latest.action}` : 'no provenance entry',
  })

  return { provenByReadback: checks.every((check) => check.ok), checks }
}

function primarySourceId(proposal: ActionProposal): string | undefined {
  if (typeof proposal.payload.resourceId === 'string') return proposal.payload.resourceId
  return proposal.sourceVersions[0]?.id
}

function simulatorTimeOf(resource: SimResource | null): number | undefined {
  if (!resource) return undefined
  const latest = resource.provenance.changes.at(-1) ?? resource.provenance.created
  return latest?.time ?? resource.createdAt
}

function describeBody(body: unknown): string {
  if (typeof body === 'string') return body.slice(0, 400)
  try {
    return JSON.stringify(body).slice(0, 400)
  } catch {
    return 'unreadable response body'
  }
}

// ---------------------------------------------------------------------------
// Live transport
// ---------------------------------------------------------------------------

/**
 * The real dependencies are resolved lazily so this module stays importable in
 * a test that injects all of them and never touches the network.
 */
function withDefaults(overrides?: Partial<ExecuteDeps>): ExecuteDeps {
  return {
    clock: overrides?.clock ?? (() => Date.now()),
    loadSchema: overrides?.loadSchema ?? (() => loadLiveActionSchema()),
    postAction:
      overrides?.postAction ??
      (async (site, body) => {
        const { createAnimaClient } = await import('@/adapters/anima/client')
        return createAnimaClient().request<unknown>(ACTION_PATH(site), {
          method: 'POST',
          body: JSON.stringify(body),
        })
      }),
    readResource:
      overrides?.readResource ??
      (async (site, resourceId, patientId) => {
        const { readSiteView } = await import('@/anima/readers')
        const slice = await readSiteView(site, {
          ...(patientId ? { patient: patientId } : {}),
          limit: 300,
        })
        return slice.resources.find((resource) => resource.id === resourceId) ?? null
      }),
    invalidate:
      overrides?.invalidate ??
      (async () => {
        const { invalidateCache } = await import('@/anima/readers')
        invalidateCache()
      }),
  }
}
