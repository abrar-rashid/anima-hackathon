import {
  derived,
  notSupplied,
  sourceOnly,
  sourceSupplied,
  type CitationRef,
  type TaskLedgerEntry,
  type TaskStatus,
} from '@/tasks/types'

export const T0 = 1_789_286_400_000
export const PATIENT = 'SIM-000001'

export function cite(resourceId: string, fieldPath: string, resourceVersion = 1): CitationRef {
  return { resourceId, resourceVersion, fieldPath }
}

export function makeEntry(input: {
  entryId: string
  timestamp?: number
  taskId?: string
  kindId?: string
  status?: TaskStatus
  ownerTeamId?: string
  note?: string | null
  deadline?: number | null
  priority?: 'emergency' | 'urgent' | 'standard' | null
  patientId?: string
  resourceId?: string
  resourceVersion?: number
  extraction?: TaskLedgerEntry['extraction']
  citation?: TaskLedgerEntry['citation']
  closureEvidence?: TaskLedgerEntry['closureEvidence']
  episodeId?: TaskLedgerEntry['episodeId']
  snomedId?: TaskLedgerEntry['snomedId']
  sampleId?: TaskLedgerEntry['sampleId']
}): TaskLedgerEntry {
  const timestamp = input.timestamp ?? T0
  const resourceId = input.resourceId ?? 'r-2'
  const resourceVersion = input.resourceVersion ?? 1
  const taskId = input.taskId ?? 'r-2'
  const kindId = input.kindId ?? 'source-recorded'
  const status = input.status ?? 'open'
  const ownerTeamId = input.ownerTeamId ?? 'gp'
  const patientId = input.patientId ?? PATIENT

  return {
    entryId: input.entryId,
    timestamp,
    taskId: sourceSupplied(taskId, cite(resourceId, 'id', resourceVersion)),
    patientId: sourceSupplied(patientId, cite(resourceId, 'patientId', resourceVersion)),
    kindId: derived(
      kindId,
      'Kind is assigned by the caller from the task vocabulary or copied from a prior observation. No clinical classification is performed.',
      [cite(resourceId, 'kind', resourceVersion)],
    ),
    status: sourceSupplied(status, cite(resourceId, 'status', resourceVersion)),
    owner: {
      value: { teamId: ownerTeamId, actorId: null, actorAttribution: 'source-team' },
      provenance: { kind: 'source-supplied', citation: cite(resourceId, 'owner', resourceVersion) },
    },
    note:
      input.note === undefined
        ? sourceSupplied('Arrange post-discharge monitoring', cite(resourceId, 'title', resourceVersion))
        : input.note === null
          ? notSupplied()
          : sourceSupplied(input.note, cite(resourceId, 'title', resourceVersion)),
    deadline:
      input.deadline === undefined
        ? sourceSupplied(T0, cite(resourceId, 'dueAt', resourceVersion))
        : input.deadline === null
          ? notSupplied()
          : sourceSupplied(input.deadline, cite(resourceId, 'dueAt', resourceVersion)),
    clinicalPriority:
      input.priority === undefined
        ? sourceOnly('urgent', cite(resourceId, 'priority', resourceVersion))
        : input.priority === null
          ? notSupplied()
          : sourceOnly(input.priority, cite(resourceId, 'priority', resourceVersion)),
    snomedId: input.snomedId ?? notSupplied(),
    performedBy: notSupplied(),
    sampleId: input.sampleId ?? notSupplied(),
    requestedBy: notSupplied(),
    episodeId: input.episodeId ?? notSupplied(),
    citation:
      input.citation ??
      ({
        kind: 'source-record',
        resourceId,
        resourceVersion,
        fieldPath: 'id',
      } as const),
    extraction:
      input.extraction === undefined
        ? {
            method: 'source-observed',
            ruleText:
              'A source record of kind task is copied into the ledger. Each field is taken from the source record or left null as not supplied by source. No clinical meaning is added.',
          }
        : input.extraction,
    closureEvidence: input.closureEvidence ?? [],
  }
}

export function sourceTaskRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-2',
    kind: 'task',
    title: 'Arrange post-discharge monitoring',
    status: 'open',
    priority: 'urgent',
    owner: 'gp',
    dueAt: T0,
    createdAt: 1_789_200_000_000,
    patientId: PATIENT,
    version: 1,
    sampleId: null,
    resultId: null,
    orderId: null,
    encounterId: null,
    episodeId: null,
    dataKind: null,
    ...overrides,
  }
}
