import { getTaskKind } from '@/tasks/task-kinds'
import { isHonestSourceCode, type TaskLedgerEntry } from '@/tasks/types'

export type LedgerInvariantResult = {
  id: number
  name: string
  passed: boolean
  detail: string
}

export type LedgerInvariantOptions = {
  previousEntries?: readonly TaskLedgerEntry[]
}

function ownerNonEmpty(entry: TaskLedgerEntry): boolean {
  return typeof entry.owner.value.teamId === 'string' && entry.owner.value.teamId.trim().length > 0
}

function ownerNonEmptyAtEveryPoint(entries: readonly TaskLedgerEntry[]): boolean {
  return entries.every(ownerNonEmpty)
}

function closedWithRequiredEvidence(entries: readonly TaskLedgerEntry[]): boolean {
  return entries.every((entry) => {
    if (entry.status.value !== 'closed') return true
    const required = getTaskKind(entry.kindId.value).requiredEvidence
    const present = new Set(entry.closureEvidence.map((item) => item.kind))
    return required.every((kind) => present.has(kind))
  })
}

function priorityKey(entry: TaskLedgerEntry): string {
  if (entry.clinicalPriority.provenance.kind !== 'source-supplied') {
    return `${entry.taskId.value}|none`
  }
  const citation = entry.clinicalPriority.provenance.citation
  return `${entry.taskId.value}|${citation.resourceId}|${citation.resourceVersion}`
}

function provenanceKind(field: { provenance: { kind: string } }): string {
  return field.provenance.kind
}

function sourcePriorityUnaltered(entries: readonly TaskLedgerEntry[]): boolean {
  const seen = new Map<string, string | null>()
  for (const entry of entries) {
    if (provenanceKind(entry.clinicalPriority) === 'derived') return false
    if (entry.clinicalPriority.value != null && provenanceKind(entry.clinicalPriority) !== 'source-supplied') {
      return false
    }
    if (entry.clinicalPriority.provenance.kind !== 'source-supplied') continue
    const key = priorityKey(entry)
    const previous = seen.get(key)
    if (previous === undefined) {
      seen.set(key, entry.clinicalPriority.value)
      continue
    }
    if (previous !== entry.clinicalPriority.value) return false
  }
  return true
}

function snomedHonest(entries: readonly TaskLedgerEntry[]): boolean {
  return entries.every((entry) => isHonestSourceCode(entry.snomedId))
}

function isExtracted(entry: TaskLedgerEntry): boolean {
  return entry.extraction?.method === 'structural-gap' || entry.extraction?.method === 'free-text'
}

function extractedHasCitation(entries: readonly TaskLedgerEntry[]): boolean {
  return entries.every((entry) => {
    if (!isExtracted(entry)) return true
    const citation = entry.citation
    if (citation.resourceId.trim().length === 0) return false
    if (!Number.isFinite(citation.resourceVersion)) return false
    if (citation.kind === 'free-text') return citation.quotedSpan.trim().length > 0
    if (citation.kind === 'structural-gap') return citation.ruleText.trim().length > 0
    return false
  })
}

function snapshot(entry: TaskLedgerEntry): string {
  return JSON.stringify(entry)
}

function appendOnlyRespected(
  entries: readonly TaskLedgerEntry[],
  previous: readonly TaskLedgerEntry[] | undefined,
): boolean {
  const ids = entries.map((entry) => entry.entryId)
  if (new Set(ids).size !== ids.length) return false
  if (!previous) return true
  if (previous.length > entries.length) return false
  for (let i = 0; i < previous.length; i += 1) {
    const prior = previous[i]
    const current = entries[i]
    if (!prior || !current) return false
    if (prior.entryId !== current.entryId) return false
    if (snapshot(prior) !== snapshot(current)) return false
  }
  return true
}

export function evaluateLedgerInvariants(
  entries: readonly TaskLedgerEntry[],
  options?: LedgerInvariantOptions,
): LedgerInvariantResult[] {
  const ownerOk = ownerNonEmptyAtEveryPoint(entries)
  const closedOk = closedWithRequiredEvidence(entries)
  const priorityOk = sourcePriorityUnaltered(entries)
  const snomedOk = snomedHonest(entries)
  const citationOk = extractedHasCitation(entries)
  const appendOk = appendOnlyRespected(entries, options?.previousEntries)

  return [
    {
      id: 1,
      name: 'owner-non-empty-at-every-history-point',
      passed: ownerOk,
      detail: ownerOk
        ? 'Every ledger observation names a non-empty accountable owner team.'
        : 'A task observation has a blank owner team.',
    },
    {
      id: 2,
      name: 'closed-only-with-kind-evidence',
      passed: closedOk,
      detail: closedOk
        ? 'Closed tasks carry the evidence their kind requires, or no task is closed.'
        : 'A task is closed without the evidence its kind requires.',
    },
    {
      id: 3,
      name: 'source-supplied-priority-never-altered',
      passed: priorityOk,
      detail: priorityOk
        ? 'Source-supplied clinical priority is unchanged across observations of the same source version.'
        : 'A source-supplied clinical priority was altered.',
    },
    {
      id: 4,
      name: 'snomed-null-unless-source-supplied',
      passed: snomedOk,
      detail: snomedOk
        ? 'snomedId is null, or a source field path supplied it.'
        : 'snomedId is populated without a source-supplied field citation.',
    },
    {
      id: 5,
      name: 'extracted-task-has-citation',
      passed: citationOk,
      detail: citationOk
        ? 'Every extracted task cites a source resource id, version, and rule or quoted span.'
        : 'An extracted task is missing a source citation, rule text, or quoted span.',
    },
    {
      id: 6,
      name: 'append-only-respected',
      passed: appendOk,
      detail: appendOk
        ? 'Entry ids are unique and the baseline, if supplied, is an unmodified prefix.'
        : 'The log is not append-only: an earlier entry was changed, removed, or duplicated.',
    },
  ]
}
