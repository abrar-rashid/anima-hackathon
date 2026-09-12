import type { TaskLedgerEntry, TaskState, TaskStatus } from '@/tasks/types'

export type AppendResult =
  | { ok: true; entries: readonly TaskLedgerEntry[] }
  | { ok: false; entries: readonly TaskLedgerEntry[]; reason: string }

export type DeriveTaskStateResult = {
  ok: boolean
  tasks: TaskState[]
  rejected: { entry: TaskLedgerEntry; reason: string }[]
}

export const TASK_STATUS_RANK: Record<TaskStatus, number> = {
  proposed: 0,
  open: 1,
  reopened: 1,
  accepted: 2,
  in_progress: 2,
  overdue: 2,
  unavailable: 2,
  stale: 2,
  failed: 3,
  cancelled: 3,
  closed: 4,
}

export function isBackwardStatus(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_STATUS_RANK[to] < TASK_STATUS_RANK[from]
}

function byTimestampThenId(a: TaskLedgerEntry, b: TaskLedgerEntry): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
  return a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0
}

function applyEntry(prev: TaskState | null, entry: TaskLedgerEntry): TaskState {
  const latencies =
    prev && prev.status !== entry.status.value
      ? [
          ...prev.stepLatencies,
          {
            fromStatus: prev.status,
            toStatus: entry.status.value,
            fromTimestamp: prev.lastTimestamp,
            toTimestamp: entry.timestamp,
            durationMs: entry.timestamp - prev.lastTimestamp,
          },
        ]
      : (prev?.stepLatencies ?? [])

  return {
    taskId: entry.taskId.value,
    patientId: entry.patientId.value,
    kindId: entry.kindId.value,
    status: entry.status.value,
    owner: entry.owner.value,
    note: entry.note.value,
    deadline: entry.deadline.value,
    clinicalPriority: entry.clinicalPriority.value,
    snomedId: entry.snomedId.value,
    performedBy: entry.performedBy.value,
    sampleId: entry.sampleId.value,
    requestedBy: entry.requestedBy.value,
    episodeId: entry.episodeId.value,
    episodeDerivationRule: entry.episodeId.provenance.kind === 'derived' ? entry.episodeId.provenance.rule : null,
    citation: entry.citation,
    extraction: entry.extraction,
    closureEvidence: entry.closureEvidence,
    lastEntryId: entry.entryId,
    lastTimestamp: entry.timestamp,
    historyEntryIds: prev ? [...prev.historyEntryIds, entry.entryId] : [entry.entryId],
    stepLatencies: latencies,
  }
}

function replay(entries: readonly TaskLedgerEntry[]): {
  tasks: Map<string, TaskState>
  rejected: { entry: TaskLedgerEntry; reason: string }[]
} {
  const ordered = [...entries].sort(byTimestampThenId)
  const seen = new Set<string>()
  const tasks = new Map<string, TaskState>()
  const rejected: { entry: TaskLedgerEntry; reason: string }[] = []

  for (const entry of ordered) {
    if (seen.has(entry.entryId)) {
      rejected.push({ entry, reason: 'duplicate-entry' })
      continue
    }
    seen.add(entry.entryId)

    const prev = tasks.get(entry.taskId.value) ?? null
    if (prev && isBackwardStatus(prev.status, entry.status.value)) {
      rejected.push({ entry, reason: 'backward-transition' })
      continue
    }
    tasks.set(entry.taskId.value, applyEntry(prev, entry))
  }

  return { tasks, rejected }
}

export function deriveTaskState(entries: readonly TaskLedgerEntry[]): DeriveTaskStateResult {
  const { tasks, rejected } = replay(entries)
  const list = [...tasks.values()].sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0))
  return { ok: rejected.length === 0, tasks: list, rejected }
}

export function append(entries: readonly TaskLedgerEntry[], entry: TaskLedgerEntry): AppendResult {
  if (entries.some((item) => item.entryId === entry.entryId)) {
    return { ok: false, entries, reason: 'duplicate-entry' }
  }
  const derived = deriveTaskState([...entries, entry])
  const rejected = derived.rejected.find((row) => row.entry.entryId === entry.entryId)
  if (rejected) {
    return { ok: false, entries, reason: rejected.reason }
  }
  return { ok: true, entries: [...entries, entry] }
}
