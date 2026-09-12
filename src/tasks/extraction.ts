import { ORDER_WITHOUT_RESULT, SOURCE_RECORDED } from '@/tasks/task-kinds'
import {
  clinicalPriorityFromSource,
  derived,
  notSupplied,
  sourceOnly,
  sourceSupplied,
  type CitationRef,
  type ClinicalPriorityField,
  type ClosureEvidence,
  type NullableCited,
  type SourceOnlyNullable,
  type TaskCitation,
  type TaskLedgerEntry,
  type TaskStatus,
} from '@/tasks/types'

export const ORDER_WITHOUT_RESULT_RULE_TEXT =
  'An order or sample record has no matching result in the supplied records (no source resultId on the order or sample, and no result citing this order or sample id). No clinical need is inferred.'

export const OVERDUE_WITHOUT_CLOSURE_RULE_TEXT =
  'A source task has a dueAt earlier than the supplied time and no closing evidence (source status is not closed, completed or cancelled, and the ledger has no closed entry for this task). No urgency is inferred from lateness.'

export const SOURCE_TASK_OBSERVED_RULE_TEXT =
  'A source record of kind task is copied into the ledger. Each field is taken from the source record or left null as not supplied by source. No clinical meaning is added.'

export const EPISODE_FROM_ENCOUNTER_RULE =
  "Episode id is copied from the source record's encounterId (the encounter this record hangs off). No episode boundary is invented."

export const SOURCE_STATUS_MAP_RULE =
  'Ledger status is copied from the source status when it is one of open, accepted, overdue, cancelled, canceled, completed, complete, closed, rejected, proposed, in_progress, unavailable, stale, failed or reopened; canceled/cancelled/rejected become cancelled; completed/complete/closed become closed. Any other source token stays open. Closing still requires the kind\'s evidence.'

export const GAP_TASK_ID_RULE =
  'Task identity is the source order or sample id prefixed by the extractor that found the gap.'

export type ExtractionSourceRecord = {
  id: string
  kind: string
  version: number
  patientId: string
  owner: string
  status: string
  createdAt: number
  title?: string
  priority?: string | null
  dueAt?: number | null
  sampleId?: string | null
  resultId?: string | null
  orderId?: string | null
  encounterId?: string | null
  episodeId?: string | null
  dataKind?: string | null
}

export type ExtractionContext = {
  patientId: string
  now: number
  records: readonly ExtractionSourceRecord[]
  existingEntries?: readonly TaskLedgerEntry[]
}

export type DeterministicExtraction = {
  kindId: string
  ruleId: string
  ruleText: string
  citation: TaskCitation
  proposedEntry: TaskLedgerEntry
}

export type FreeTextSpanCitation = {
  resourceId: string
  resourceVersion: number
  quotedSpan: string
}

export type FreeTextTaskProposal = {
  patientId: string
  kindId: string
  note: string
  ownerTeamId: string
  deadline: number | null
  citation: FreeTextSpanCitation
  label: 'agent-extracted'
  acceptance: 'proposal'
}

export type FreeTextExtractionInput = {
  patientId: string
  now: number
  notes: readonly { resourceId: string; resourceVersion: number; text: string }[]
}

/** Implemented by a different worker. This module does not parse free text. */
export interface FreeTextExtractor {
  propose(input: FreeTextExtractionInput): readonly FreeTextTaskProposal[]
}

function cite(record: ExtractionSourceRecord, fieldPath: string): CitationRef {
  return { resourceId: record.id, resourceVersion: record.version, fieldPath }
}

function isResultRecord(record: ExtractionSourceRecord): boolean {
  const kind = record.kind.toLowerCase()
  return kind === 'result' || kind === 'report' || record.dataKind === 'blood-result'
}

function isOrderOrSample(record: ExtractionSourceRecord): boolean {
  const kind = record.kind.toLowerCase()
  return kind === 'order' || kind === 'sample' || kind === 'request'
}

function isTaskRecord(record: ExtractionSourceRecord): boolean {
  return record.kind.toLowerCase() === 'task'
}

function resultMatchesOrder(result: ExtractionSourceRecord, order: ExtractionSourceRecord): boolean {
  if (order.resultId && result.id === order.resultId) return true
  if (result.orderId && result.orderId === order.id) return true
  if (order.sampleId && result.sampleId && order.sampleId === result.sampleId) return true
  if (result.sampleId && result.sampleId === order.id) return true
  return false
}

function sourceStatusClosed(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return (
    normalized === 'closed' ||
    normalized === 'completed' ||
    normalized === 'complete' ||
    normalized === 'cancelled' ||
    normalized === 'canceled' ||
    normalized === 'rejected'
  )
}

function mapSourceStatus(status: string): TaskStatus {
  const normalized = status.trim().toLowerCase()
  switch (normalized) {
    case 'proposed':
      return 'proposed'
    case 'open':
      return 'open'
    case 'accepted':
      return 'accepted'
    case 'in_progress':
    case 'in-progress':
      return 'in_progress'
    case 'overdue':
      return 'overdue'
    case 'unavailable':
      return 'unavailable'
    case 'stale':
      return 'stale'
    case 'failed':
      return 'failed'
    case 'cancelled':
    case 'canceled':
    case 'rejected':
      return 'cancelled'
    case 'completed':
    case 'complete':
    case 'closed':
      return 'closed'
    case 'reopened':
      return 'reopened'
    default:
      return 'open'
  }
}

function episodeFrom(record: ExtractionSourceRecord): NullableCited<string> {
  if (typeof record.episodeId === 'string' && record.episodeId.length > 0) {
    return sourceSupplied(record.episodeId, cite(record, 'episodeId'))
  }
  if (typeof record.encounterId === 'string' && record.encounterId.length > 0) {
    return derived(record.encounterId, EPISODE_FROM_ENCOUNTER_RULE, [cite(record, 'encounterId')])
  }
  return notSupplied()
}

function sampleFrom(record: ExtractionSourceRecord): SourceOnlyNullable<string> {
  if (typeof record.sampleId === 'string' && record.sampleId.length > 0) {
    return sourceOnly(record.sampleId, cite(record, 'sampleId'))
  }
  return notSupplied()
}

function priorityFrom(record: ExtractionSourceRecord): ClinicalPriorityField {
  return clinicalPriorityFromSource(record.priority, cite(record, 'priority'))
}

function alreadyHasTask(existing: readonly TaskLedgerEntry[] | undefined, taskId: string): boolean {
  return (existing ?? []).some((entry) => entry.taskId.value === taskId)
}

function latestStatus(existing: readonly TaskLedgerEntry[] | undefined, taskId: string): TaskStatus | null {
  const matches = (existing ?? [])
    .filter((entry) => entry.taskId.value === taskId)
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp || (a.entryId < b.entryId ? -1 : 1))
  const last = matches[matches.length - 1]
  return last ? last.status.value : null
}

function ownerFrom(record: ExtractionSourceRecord): TaskLedgerEntry['owner'] {
  return {
    value: { teamId: record.owner, actorId: null, actorAttribution: 'source-team' },
    provenance: { kind: 'source-supplied', citation: cite(record, 'owner') },
  }
}

function noteFrom(record: ExtractionSourceRecord): NullableCited<string> {
  if (typeof record.title === 'string' && record.title.length > 0) {
    return sourceSupplied(record.title, cite(record, 'title'))
  }
  return notSupplied()
}

function deadlineFrom(record: ExtractionSourceRecord): NullableCited<number> {
  if (typeof record.dueAt === 'number' && Number.isFinite(record.dueAt)) {
    return sourceSupplied(record.dueAt, cite(record, 'dueAt'))
  }
  return notSupplied()
}

function closureFromSourceStatus(record: ExtractionSourceRecord, status: TaskStatus): readonly ClosureEvidence[] {
  if (status === 'closed' || status === 'cancelled') {
    return [{ kind: 'source-task-completed', citation: cite(record, 'status') }]
  }
  return []
}

function baseEntry(
  record: ExtractionSourceRecord,
  input: {
    entryId: string
    timestamp: number
    taskId: TaskLedgerEntry['taskId']
    kindId: TaskLedgerEntry['kindId']
    status: TaskLedgerEntry['status']
    citation: TaskCitation
    extraction: TaskLedgerEntry['extraction']
  },
): TaskLedgerEntry {
  return {
    entryId: input.entryId,
    timestamp: input.timestamp,
    taskId: input.taskId,
    patientId: sourceSupplied(record.patientId, cite(record, 'patientId')),
    kindId: input.kindId,
    status: input.status,
    owner: ownerFrom(record),
    note: noteFrom(record),
    deadline: deadlineFrom(record),
    clinicalPriority: priorityFrom(record),
    snomedId: notSupplied(),
    performedBy: notSupplied(),
    sampleId: sampleFrom(record),
    requestedBy: notSupplied(),
    episodeId: episodeFrom(record),
    citation: input.citation,
    extraction: input.extraction,
    closureEvidence: closureFromSourceStatus(record, input.status.value),
  }
}

export function extractOrdersWithoutResults(ctx: ExtractionContext): DeterministicExtraction[] {
  const results = ctx.records.filter(isResultRecord)
  const found: DeterministicExtraction[] = []

  for (const record of ctx.records) {
    if (!isOrderOrSample(record)) continue
    if (record.patientId !== ctx.patientId) continue
    if (record.owner.trim().length === 0) continue
    if (results.some((result) => resultMatchesOrder(result, record))) continue

    const taskId = `gap:order-without-result:${record.id}`
    if (alreadyHasTask(ctx.existingEntries, taskId)) continue

    const citation: TaskCitation = {
      kind: 'structural-gap',
      resourceId: record.id,
      resourceVersion: record.version,
      ruleText: ORDER_WITHOUT_RESULT_RULE_TEXT,
    }
    const proposedEntry = baseEntry(record, {
      entryId: `extract:${taskId}:${record.version}`,
      timestamp: ctx.now,
      taskId: derived(taskId, GAP_TASK_ID_RULE, [cite(record, 'id')]),
      kindId: derived(
        ORDER_WITHOUT_RESULT,
        'Kind is the structural-gap extractor that fired. No clinical classification is performed.',
        [cite(record, 'kind')],
      ),
      status: sourceSupplied('open', cite(record, 'status')),
      citation,
      extraction: {
        method: 'structural-gap',
        extractorId: 'order-without-result',
        ruleText: ORDER_WITHOUT_RESULT_RULE_TEXT,
      },
    })

    found.push({
      kindId: ORDER_WITHOUT_RESULT,
      ruleId: 'order-without-result',
      ruleText: ORDER_WITHOUT_RESULT_RULE_TEXT,
      citation,
      proposedEntry,
    })
  }

  return found
}

export function extractOverdueOpenTasks(ctx: ExtractionContext): DeterministicExtraction[] {
  const found: DeterministicExtraction[] = []

  for (const record of ctx.records) {
    if (!isTaskRecord(record)) continue
    if (record.patientId !== ctx.patientId) continue
    if (record.owner.trim().length === 0) continue
    if (typeof record.dueAt !== 'number' || !Number.isFinite(record.dueAt)) continue
    if (ctx.now <= record.dueAt) continue
    if (sourceStatusClosed(record.status)) continue

    const current = latestStatus(ctx.existingEntries, record.id)
    if (current === 'closed' || current === 'cancelled' || current === 'overdue') continue

    const citation: TaskCitation = {
      kind: 'structural-gap',
      resourceId: record.id,
      resourceVersion: record.version,
      ruleText: OVERDUE_WITHOUT_CLOSURE_RULE_TEXT,
    }
    const proposedEntry = baseEntry(record, {
      entryId: `extract:overdue:${record.id}:${record.version}:${ctx.now}`,
      timestamp: ctx.now,
      taskId: sourceSupplied(record.id, cite(record, 'id')),
      kindId: derived(
        SOURCE_RECORDED,
        'Kind remains source-recorded. Lateness changes status only; the title is not classified.',
        [cite(record, 'kind')],
      ),
      status: derived(
        'overdue',
        OVERDUE_WITHOUT_CLOSURE_RULE_TEXT,
        [cite(record, 'dueAt')],
      ),
      citation,
      extraction: {
        method: 'structural-gap',
        extractorId: 'overdue-without-closure',
        ruleText: OVERDUE_WITHOUT_CLOSURE_RULE_TEXT,
      },
    })

    found.push({
      kindId: SOURCE_RECORDED,
      ruleId: 'overdue-without-closure',
      ruleText: OVERDUE_WITHOUT_CLOSURE_RULE_TEXT,
      citation,
      proposedEntry,
    })
  }

  return found
}

export function observeSourceTasks(ctx: ExtractionContext): DeterministicExtraction[] {
  const found: DeterministicExtraction[] = []

  for (const record of ctx.records) {
    if (!isTaskRecord(record)) continue
    if (record.patientId !== ctx.patientId) continue
    if (record.owner.trim().length === 0) continue
    if (alreadyHasTask(ctx.existingEntries, record.id)) continue

    const status = mapSourceStatus(record.status)
    const citation: TaskCitation = {
      kind: 'source-record',
      resourceId: record.id,
      resourceVersion: record.version,
      fieldPath: 'id',
    }
    const proposedEntry = baseEntry(record, {
      entryId: `observe:${record.id}:${record.version}`,
      timestamp: record.createdAt,
      taskId: sourceSupplied(record.id, cite(record, 'id')),
      kindId: derived(
        SOURCE_RECORDED,
        SOURCE_TASK_OBSERVED_RULE_TEXT,
        [cite(record, 'kind')],
      ),
      status: derived(status, SOURCE_STATUS_MAP_RULE, [cite(record, 'status')]),
      citation,
      extraction: {
        method: 'source-observed',
        ruleText: SOURCE_TASK_OBSERVED_RULE_TEXT,
      },
    })

    found.push({
      kindId: SOURCE_RECORDED,
      ruleId: 'source-task-observed',
      ruleText: SOURCE_TASK_OBSERVED_RULE_TEXT,
      citation,
      proposedEntry,
    })
  }

  return found
}

export function extractStructuralGaps(ctx: ExtractionContext): DeterministicExtraction[] {
  return [...extractOrdersWithoutResults(ctx), ...extractOverdueOpenTasks(ctx)]
}

export function isValidFreeTextProposal(proposal: FreeTextTaskProposal): boolean {
  return (
    proposal.citation.quotedSpan.trim().length > 0 &&
    proposal.citation.resourceId.length > 0 &&
    Number.isFinite(proposal.citation.resourceVersion) &&
    proposal.ownerTeamId.trim().length > 0 &&
    proposal.label === 'agent-extracted' &&
    proposal.acceptance === 'proposal'
  )
}

export function toProposedEntry(
  proposal: FreeTextTaskProposal,
  meta: { entryId: string; timestamp: number },
): { ok: true; entry: TaskLedgerEntry } | { ok: false; reason: string } {
  if (proposal.citation.quotedSpan.trim().length === 0) {
    return { ok: false, reason: 'missing-quoted-span' }
  }
  if (proposal.citation.resourceId.length === 0) {
    return { ok: false, reason: 'missing-citation' }
  }
  if (proposal.ownerTeamId.trim().length === 0) {
    return { ok: false, reason: 'empty-owner' }
  }

  const citation: CitationRef = {
    resourceId: proposal.citation.resourceId,
    resourceVersion: proposal.citation.resourceVersion,
    fieldPath: 'text',
  }
  const taskId = `proposal:free-text:${proposal.citation.resourceId}:${proposal.citation.resourceVersion}`

  return {
    ok: true,
    entry: {
      entryId: meta.entryId,
      timestamp: meta.timestamp,
      taskId: derived(
        taskId,
        'Task identity is derived from the cited note resource id and version until a human accepts the proposal.',
        [citation],
      ),
      patientId: sourceSupplied(proposal.patientId, { ...citation, fieldPath: 'patientId' }),
      kindId: derived(
        proposal.kindId,
        'Kind is taken from the free-text proposal. This module does not parse the note.',
        [citation],
      ),
      status: derived(
        'proposed',
        'An extracted free-text task is a proposal until a human accepts it.',
        [citation],
      ),
      owner: {
        value: { teamId: proposal.ownerTeamId, actorId: null, actorAttribution: 'source-team' },
        provenance: { kind: 'derived', rule: 'Owner team is supplied on the proposal and must be non-empty.', from: [citation] },
      },
      note: sourceSupplied(proposal.note, citation),
      deadline:
        proposal.deadline == null
          ? notSupplied()
          : derived(
              proposal.deadline,
              'Deadline is copied from the proposal. This module does not infer a due date from prose.',
              [citation],
            ),
      clinicalPriority: notSupplied(),
      snomedId: notSupplied(),
      performedBy: notSupplied(),
      sampleId: notSupplied(),
      requestedBy: notSupplied(),
      episodeId: notSupplied(),
      citation: {
        kind: 'free-text',
        resourceId: proposal.citation.resourceId,
        resourceVersion: proposal.citation.resourceVersion,
        quotedSpan: proposal.citation.quotedSpan,
      },
      extraction: {
        method: 'free-text',
        label: 'agent-extracted',
        acceptance: 'proposal',
      },
      closureEvidence: [],
    },
  }
}
