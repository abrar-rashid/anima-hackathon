import {
  ClinicalTaskEpisodePermissiveSchema,
  type ClinicalTaskEpisode,
  type PermissiveClinicalTaskEpisode,
} from '@/tasks/episode-schema'
import type {
  ActorIdentityValue,
  TaskLedgerEntry,
  TaskState,
} from '@/tasks/types'

export const SIMULATOR_TIME_BASE_MS = 1_789_286_400_000

export const SIMULATOR_TIME_NOTE =
  'ISO 8601 is the schema-required rendering of simulator milliseconds, not wall-clock time. The captured world runs paused at speed 60 from epoch 1789286400000.'

export type SimulatorTimeOrigin = {
  kind: 'simulator-time'
  epochMs: number
  iso8601: string
  note: typeof SIMULATOR_TIME_NOTE
}

export type DeviationCode =
  | 'not-supplied-by-source'
  | 'team-level-not-clinician'
  | 'simulator-time-not-wall-clock'
  | 'app-side-identity'

export type FieldDeviation = {
  field: keyof ClinicalTaskEpisode
  code: DeviationCode
  reason: string
}

export type MissingField = {
  field: keyof ClinicalTaskEpisode
  reason: string
}

export type StrictRefusal = {
  ok: false
  mode: 'strict'
  missing: MissingField[]
}

export type StrictSuccess = {
  ok: true
  mode: 'strict'
  episode: ClinicalTaskEpisode
  timeOrigin: SimulatorTimeOrigin
}

export type PermissiveSuccess = {
  ok: true
  mode: 'permissive'
  episode: PermissiveClinicalTaskEpisode
  deviations: FieldDeviation[]
  timeOrigin: SimulatorTimeOrigin
}

export type EpisodeExportResult = StrictRefusal | StrictSuccess | PermissiveSuccess

type EpisodeView = {
  episodeId: string | null
  timestampMs: number
  taskId: string
  status: string
  owner: ActorIdentityValue
  note: string | null
  deadlineMs: number | null
  clinicalPriority: 'emergency' | 'urgent' | 'standard' | null
  snomedId: string | null
  performedBy: ActorIdentityValue | null
  sampleId: string | null
  requestedBy: ActorIdentityValue | null
}

function isLedgerEntry(input: TaskState | TaskLedgerEntry): input is TaskLedgerEntry {
  return typeof input.taskId === 'object' && input.taskId !== null && 'value' in input.taskId
}

function viewOf(input: TaskState | TaskLedgerEntry): EpisodeView {
  if (isLedgerEntry(input)) {
    return {
      episodeId: input.episodeId.value,
      timestampMs: input.timestamp,
      taskId: input.taskId.value,
      status: input.status.value,
      owner: input.owner.value,
      note: input.note.value,
      deadlineMs: input.deadline.value,
      clinicalPriority: input.clinicalPriority.value,
      snomedId: input.snomedId.value,
      performedBy: input.performedBy.value,
      sampleId: input.sampleId.value,
      requestedBy: input.requestedBy.value,
    }
  }
  return {
    episodeId: input.episodeId,
    timestampMs: input.lastTimestamp,
    taskId: input.taskId,
    status: input.status,
    owner: input.owner,
    note: input.note,
    deadlineMs: input.deadline,
    clinicalPriority: input.clinicalPriority,
    snomedId: input.snomedId,
    performedBy: input.performedBy,
    sampleId: input.sampleId,
    requestedBy: input.requestedBy,
  }
}

export function simulatorMsToIso(ms: number): string {
  return new Date(ms).toISOString()
}

function timeOrigin(ms: number): SimulatorTimeOrigin {
  return {
    kind: 'simulator-time',
    epochMs: ms,
    iso8601: simulatorMsToIso(ms),
    note: SIMULATOR_TIME_NOTE,
  }
}

type ActorEmission = {
  value: string | null
  fromSource: boolean
  appSide: boolean
}

function emitActor(actor: ActorIdentityValue | null): ActorEmission {
  if (!actor || actor.teamId.trim().length === 0) {
    return { value: null, fromSource: false, appSide: false }
  }
  if (actor.actorAttribution === 'app-side') {
    return {
      value: actor.actorId ? `app-side:${actor.actorId}` : `app-side-team:${actor.teamId}`,
      fromSource: false,
      appSide: true,
    }
  }
  return { value: actor.teamId, fromSource: true, appSide: false }
}

function missingReasons(view: EpisodeView): MissingField[] {
  const missing: MissingField[] = []
  const owner = emitActor(view.owner)
  const performed = emitActor(view.performedBy)
  const requested = emitActor(view.requestedBy)

  if (view.episodeId == null || view.episodeId.length === 0) {
    missing.push({
      field: 'episode_id',
      reason:
        'No source episode_id or derivable encounterId was supplied. Episode boundaries are not invented.',
    })
  }
  if (view.taskId.length === 0) {
    missing.push({ field: 'task_id', reason: 'No source task id was supplied.' })
  }
  if (view.status.length === 0) {
    missing.push({ field: 'status', reason: 'No source status was supplied.' })
  }
  if (!owner.fromSource || owner.value == null) {
    missing.push({
      field: 'owner',
      reason: 'No source team owner was supplied. Accountability cannot be invented.',
    })
  }
  if (view.note == null || view.note.length === 0) {
    missing.push({ field: 'note', reason: 'No source note or title was supplied.' })
  }
  if (view.deadlineMs == null) {
    missing.push({ field: 'deadline', reason: 'No source dueAt/deadline was supplied.' })
  }
  if (view.clinicalPriority == null) {
    missing.push({
      field: 'clinical_priority',
      reason:
        'No source-supplied priority. Defaulting to standard is a clinical judgement and is forbidden.',
    })
  }
  if (view.snomedId == null) {
    missing.push({
      field: 'snomed_id',
      reason:
        'SNOMED CT concept identifier is required by the published schema but no source field supplied a SNOMED code. The simulator uses local SIM-PROBLEM-N codes. This field stays missing.',
    })
  }
  if (!performed.fromSource || performed.value == null) {
    missing.push({
      field: 'performed_by',
      reason: performed.appSide
        ? 'Only app-side staff identity is available; the source did not record a performer.'
        : 'No source performer was supplied. No corresponding field exists on captured records.',
    })
  }
  if (view.sampleId == null) {
    missing.push({
      field: 'sample_id',
      reason: 'No source sampleId was supplied. No corresponding field exists on captured records.',
    })
  }
  if (!requested.fromSource || requested.value == null) {
    missing.push({
      field: 'requested_id',
      reason: requested.appSide
        ? 'Only app-side staff identity is available; the source did not record a requester.'
        : 'No source requester was supplied. No corresponding field exists on captured records.',
    })
  }
  return missing
}

function episodeFromView(view: EpisodeView): PermissiveClinicalTaskEpisode {
  const owner = emitActor(view.owner)
  const performed = emitActor(view.performedBy)
  const requested = emitActor(view.requestedBy)
  return {
    episode_id: view.episodeId,
    timestamp: simulatorMsToIso(view.timestampMs),
    task_id: view.taskId,
    status: view.status,
    owner: owner.value ?? '',
    note: view.note,
    deadline: view.deadlineMs == null ? null : simulatorMsToIso(view.deadlineMs),
    clinical_priority: view.clinicalPriority,
    snomed_id: view.snomedId,
    performed_by: performed.value,
    sample_id: view.sampleId,
    requested_id: requested.value,
  }
}

function deviationsFrom(view: EpisodeView, episode: PermissiveClinicalTaskEpisode): FieldDeviation[] {
  const rows: FieldDeviation[] = []
  const performed = emitActor(view.performedBy)
  const requested = emitActor(view.requestedBy)

  if (episode.episode_id == null) {
    rows.push({
      field: 'episode_id',
      code: 'not-supplied-by-source',
      reason: 'No source episode_id or derivable encounterId. Null rather than an invented boundary.',
    })
  }
  rows.push({
    field: 'timestamp',
    code: 'simulator-time-not-wall-clock',
    reason: SIMULATOR_TIME_NOTE,
  })
  rows.push({
    field: 'owner',
    code: 'team-level-not-clinician',
    reason:
      'Schema describes a clinician identifier; the source supplies a team. Emitted the team id. No clinician id exists on the source.',
  })
  if (episode.note == null) {
    rows.push({
      field: 'note',
      code: 'not-supplied-by-source',
      reason: 'No source note or title was supplied.',
    })
  }
  if (episode.deadline == null) {
    rows.push({
      field: 'deadline',
      code: 'not-supplied-by-source',
      reason: 'No source dueAt/deadline was supplied.',
    })
  } else {
    rows.push({
      field: 'deadline',
      code: 'simulator-time-not-wall-clock',
      reason: SIMULATOR_TIME_NOTE,
    })
  }
  if (episode.clinical_priority == null) {
    rows.push({
      field: 'clinical_priority',
      code: 'not-supplied-by-source',
      reason:
        'No source-supplied priority. Null means no priority supplied by source — not standard.',
    })
  }
  if (episode.snomed_id == null) {
    rows.push({
      field: 'snomed_id',
      code: 'not-supplied-by-source',
      reason:
        'No SNOMED exists in the simulator. Null rather than a generated SNOMED CT concept id.',
    })
  }
  if (performed.appSide) {
    rows.push({
      field: 'performed_by',
      code: 'app-side-identity',
      reason: 'App-side staff identity; simulator records team-level actors only. Prefixed app-side: so it cannot be read as a source clinician id.',
    })
  } else if (episode.performed_by == null) {
    rows.push({
      field: 'performed_by',
      code: 'not-supplied-by-source',
      reason: 'No source performer was supplied.',
    })
  } else {
    rows.push({
      field: 'performed_by',
      code: 'team-level-not-clinician',
      reason: 'Source attribution is team-level, not a clinician identifier.',
    })
  }
  if (episode.sample_id == null) {
    rows.push({
      field: 'sample_id',
      code: 'not-supplied-by-source',
      reason: 'No source sampleId was supplied.',
    })
  }
  if (requested.appSide) {
    rows.push({
      field: 'requested_id',
      code: 'app-side-identity',
      reason: 'App-side staff identity; simulator records team-level actors only. Prefixed app-side: so it cannot be read as a source clinician id.',
    })
  } else if (episode.requested_id == null) {
    rows.push({
      field: 'requested_id',
      code: 'not-supplied-by-source',
      reason: 'No source requester was supplied.',
    })
  } else {
    rows.push({
      field: 'requested_id',
      code: 'team-level-not-clinician',
      reason: 'Source attribution is team-level, not a clinician identifier.',
    })
  }
  return rows
}

export function exportClinicalTaskEpisode(
  input: TaskState | TaskLedgerEntry,
  mode: 'strict',
): StrictRefusal | StrictSuccess
export function exportClinicalTaskEpisode(
  input: TaskState | TaskLedgerEntry,
  mode: 'permissive',
): PermissiveSuccess
export function exportClinicalTaskEpisode(
  input: TaskState | TaskLedgerEntry,
  mode: 'strict' | 'permissive',
): EpisodeExportResult {
  const view = viewOf(input)
  const origin = timeOrigin(view.timestampMs)

  if (mode === 'strict') {
    const missing = missingReasons(view)
    if (missing.length > 0) {
      return { ok: false, mode: 'strict', missing }
    }
    const candidate = episodeFromView(view)
    if (candidate.owner.length === 0) {
      return {
        ok: false,
        mode: 'strict',
        missing: [{ field: 'owner', reason: 'No source team owner was supplied. Accountability cannot be invented.' }],
      }
    }
    const episode: ClinicalTaskEpisode = {
      episode_id: candidate.episode_id as string,
      timestamp: candidate.timestamp,
      task_id: candidate.task_id,
      status: candidate.status,
      owner: candidate.owner,
      note: candidate.note as string,
      deadline: candidate.deadline as string,
      clinical_priority: candidate.clinical_priority as ClinicalTaskEpisode['clinical_priority'],
      snomed_id: candidate.snomed_id as string,
      performed_by: candidate.performed_by as string,
      sample_id: candidate.sample_id as string,
      requested_id: candidate.requested_id as string,
    }
    return { ok: true, mode: 'strict', episode, timeOrigin: origin }
  }

  const episode = episodeFromView(view)
  const parsed = ClinicalTaskEpisodePermissiveSchema.safeParse(episode)
  if (!parsed.success) {
    throw new Error('permissive export produced an object that failed its own contract')
  }
  return {
    ok: true,
    mode: 'permissive',
    episode: parsed.data,
    deviations: deviationsFrom(view, parsed.data),
    timeOrigin: origin,
  }
}
