import {
  NOT_SUPPLIED,
  SITES,
  type ActionProposal,
  type Citation,
  type DetectorId,
  type Finding,
  type SimResource,
} from '@/ctl/contracts'
import { idempotencyKey } from '@/domain/idempotency'
import { evaluateHardStops } from './hard-stops'
import type { LiveActionSchema } from './action-schema'

/**
 * Finding to concrete write.
 *
 * Pure and synchronous: given a finding and the state the caller has already
 * read, the proposal is fully determined, which is what lets the exact payload
 * be shown to a human and then executed unchanged.
 *
 * Two rules shape every mapping below. The action must not assert work that has
 * not happened — so an overdue task becomes a chase task for a human, never a
 * `complete` that would record the work as done. And every string we write is
 * copied from the source record or from arithmetic on its timestamps, so a
 * payload contains no sentence a clinician did not effectively write.
 */

export interface ProposeContext {
  /** The cited resource as currently read. Absent becomes a `source-absent` stop. */
  source?: SimResource
  /** Simulator `now`, for the audit line in the written text. */
  now: number
  /** Our team id, from GET /api/team. Part of the idempotency key. */
  team: string
  /** Version of the mapping rules, so a rule change yields a different key. */
  protocolVersion?: string
  /** The live `Action` schema. Undefined means unverified, which is a stop. */
  schema?: LiveActionSchema | null
  /** Clinical surfaces require a named approver. Defaults to true. */
  requiresStaffIdentity?: boolean
  staff?: { id: string; name: string; role: string }
  usedIdempotencyKeys?: Readonly<Record<string, string>>
}

/** Bumped when a mapping below changes, so old keys do not alias new payloads. */
export const MAPPING_VERSION = 'ctl-effect-map-1'

/** The action each detector maps onto, and why that action and not another. */
export const DETECTOR_ACTIONS: Readonly<Record<DetectorId, { actionType: string; why: string }>> = {
  'unprocessed-handover': {
    actionType: 'process_document',
    why: 'the handover exists and has not been reviewed; reviewing it is the recorded next step',
  },
  'unaccepted-referral': {
    actionType: 'accept',
    why: 'the receiving service has not accepted the referral, which is the transition the record is waiting on',
  },
  'overdue-task': {
    actionType: 'create_task',
    why: 'the work itself is not ours to perform, so we raise a chase task rather than record the original as complete',
  },
  'awaiting-result': {
    actionType: 'create_task',
    why: 'a result cannot be produced by a write, so we raise a task to chase it',
  },
  'undispensed-prescription': {
    actionType: 'create_task',
    why: 'dispensing asserts a medicine changed hands, which only the pharmacy can record',
  },
  'unanswered-request': {
    actionType: 'create_task',
    why: 'answering a patient requires content a human must author, so we raise the task to answer it',
  },
  'stalled-loop': {
    actionType: 'create_task',
    why: 'the stall names no specific transition, so we raise a task for a human to pick it up',
  },
}

const SITE_SET: ReadonlySet<string> = new Set(SITES)

export function proposeForFinding(finding: Finding, ctx: ProposeContext): ActionProposal {
  const mapping = DETECTOR_ACTIONS[finding.detector]
  const site = finding.site
  const source = ctx.source
  const citations = citationsFor(finding, source)
  const sourceVersions = versionsFrom(citations)
  const protocolVersion = ctx.protocolVersion ?? MAPPING_VERSION

  const payload = buildPayload(mapping.actionType, finding, ctx)

  const key = idempotencyKey({
    team: ctx.team,
    patientId: finding.patientId ?? NOT_SUPPLIED,
    resultId: primaryResourceId(finding, source) ?? NOT_SUPPLIED,
    resultVersion: primaryVersion(finding, source) ?? 0,
    protocolVersion,
    actionKind: mapping.actionType,
    destination: typeof payload.target === 'string' ? payload.target : site,
  })

  const hardStops = evaluateHardStops({
    actionType: mapping.actionType,
    site,
    payload,
    ...(finding.patientId ? { findingPatientId: finding.patientId } : {}),
    ...(source ? { source } : {}),
    sourceVersions,
    schema: ctx.schema ?? null,
    requiresStaffIdentity: ctx.requiresStaffIdentity ?? true,
    ...(ctx.staff ? { staff: ctx.staff } : {}),
    idempotencyKey: key,
    ...(ctx.usedIdempotencyKeys ? { usedIdempotencyKeys: ctx.usedIdempotencyKeys } : {}),
  })

  return {
    actionType: mapping.actionType,
    site,
    payload,
    sourceVersions,
    idempotencyKey: key,
    rationale: rationaleFor(finding, mapping.why, sourceVersions),
    citations,
    hardStops,
    supported: ctx.schema?.actionTypes.includes(mapping.actionType) ?? false,
  }
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

function buildPayload(
  actionType: string,
  finding: Finding,
  ctx: ProposeContext,
): Record<string, unknown> {
  const source = ctx.source
  const resourceId = primaryResourceId(finding, source)

  const base: Record<string, unknown> = { type: actionType }
  if (finding.patientId) base.patientId = finding.patientId

  switch (actionType) {
    case 'process_document': {
      if (resourceId) base.resourceId = resourceId
      base.documentCommand = 'review'
      if (source) base.expectedVersion = source.version
      base.text = auditText(finding, ctx)
      return base
    }
    case 'accept': {
      if (resourceId) base.resourceId = resourceId
      if (source) base.expectedVersion = source.version
      return base
    }
    default: {
      // create_task: title and text are built only from source-supplied strings
      // and arithmetic on source timestamps.
      base.title = chaseTitle(finding, source)
      base.text = auditText(finding, ctx)
      const owner = finding.owner
      if (owner && SITE_SET.has(owner)) base.target = owner
      return base
    }
  }
}

/** ≤500 chars per the live schema, and every clause traceable to the record. */
function chaseTitle(finding: Finding, source?: SimResource): string {
  const subject = source?.title ?? finding.summary
  return truncate(`Chase unclosed work: ${subject}`, 500)
}

/**
 * The written record of why this exists.
 *
 * Only facts: which detector fired, what the source record says, how far past
 * its own deadline the simulator clock is, and that the world is synthetic. No
 * clinical statement, no priority, no instruction beyond chasing the record.
 */
function auditText(finding: Finding, ctx: ProposeContext): string {
  const parts = [
    `Raised by Close The Loop from detector ${finding.detector}.`,
    finding.summary,
    finding.citations.length > 0
      ? `Source: ${finding.citations.map((c) => `${c.site}/${c.resourceId} v${c.version}`).join(', ')}.`
      : null,
    `Source status: ${finding.status}.`,
    finding.priority ? `Source-supplied priority: ${finding.priority}.` : 'No priority supplied by source.',
    finding.dueAt !== undefined ? `Source deadline (simulator time): ${finding.dueAt}.` : null,
    finding.overdueMs !== undefined
      ? `Past that deadline by ${Math.round(finding.overdueMs / 60_000)} minutes at simulator time ${ctx.now}.`
      : null,
    'Synthetic simulation record. No clinical judgement has been made by the agent.',
  ].filter((part): part is string => part !== null)

  return truncate(parts.join(' '), 20_000)
}

function rationaleFor(
  finding: Finding,
  why: string,
  sourceVersions: readonly { id: string; version: number }[],
): string {
  const versions = sourceVersions.map((v) => `${v.id} v${v.version}`).join(', ')
  return `${finding.detector} fired on ${versions || 'no cited source'}: ${finding.summary}. Proposed action chosen because ${why}.`
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}\u2026`
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

function citationsFor(finding: Finding, source?: SimResource): Citation[] {
  if (finding.citations.length > 0) return finding.citations
  if (!source) return []
  return [{ resourceId: source.id, version: source.version, site: source.site }]
}

function versionsFrom(citations: readonly Citation[]): { id: string; version: number }[] {
  const seen = new Map<string, number>()
  for (const citation of citations) {
    const existing = seen.get(citation.resourceId)
    if (existing === undefined || citation.version > existing) {
      seen.set(citation.resourceId, citation.version)
    }
  }
  return [...seen].map(([id, version]) => ({ id, version }))
}

function primaryResourceId(finding: Finding, source?: SimResource): string | undefined {
  return source?.id ?? finding.citations[0]?.resourceId
}

function primaryVersion(finding: Finding, source?: SimResource): number | undefined {
  return source?.version ?? finding.citations[0]?.version
}
