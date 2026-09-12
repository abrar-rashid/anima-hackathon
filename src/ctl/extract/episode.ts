import {
  NOT_SUPPLIED,
  type ClinicalTaskEpisode,
  type ExtractedTask,
  type SimResource,
} from '@/ctl/contracts'

/**
 * Project a candidate onto the Team 12 `ClinicalTaskEpisode` record.
 *
 * The schema requires twelve fields the simulator cannot all supply. Rather
 * than fill them, every field the source does not provide is set to the
 * explicit `not-supplied-by-source` marker, so a reader can tell an absence
 * from a value. That is the deviation the brief's own reconciliation section
 * asks for; the alternative is generating clinician identifiers and SNOMED
 * codes, which is a mis-coding hazard rather than a convenience.
 *
 * Pure: derived only from the task, the source record, and values the caller
 * can cite.
 */

/** Stated next to any rendered `episode_id`, because the value is derived, not read. */
export const EPISODE_ID_DERIVATION_RULE =
  'episode_id is derived as ep-{site}-{sourceResourceId}: the record the task was read out of. The simulator supplies no episode grouping.'

/** Stated next to any rendered timestamp, because ISO strings hide which clock. */
export const EPISODE_TIME_BASIS =
  'timestamp and deadline are simulator time rendered as ISO-8601, not wall-clock time.'

/** Fields the schema requires and no captured record supplies. */
export const EPISODE_UNSUPPLIED_FIELDS: readonly (keyof ClinicalTaskEpisode)[] = [
  'performed_by',
  'sample_id',
  'requested_id',
]

export interface EpisodeContext {
  /** The record the task was extracted from. Supplies owner and timestamp. */
  source: SimResource
  /**
   * Ledger-entry status. App-side by definition: an extracted candidate has no
   * status in the source until a human accepts it.
   */
  status?: string
  /** Only ever set from a cited source field. */
  performedBy?: string
  sampleId?: string
  requestedId?: string
}

export function toEpisode(task: ExtractedTask, ctx: EpisodeContext): ClinicalTaskEpisode {
  const created = ctx.source.createdAt ?? ctx.source.provenance.created?.time

  return {
    episode_id: `ep-${ctx.source.site}-${ctx.source.id}`,
    timestamp: isoOrUnsupplied(created),
    task_id: taskIdFor(task),
    status: ctx.status ?? 'proposed',
    // Simulator attribution is team-level; this is a team, not a clinician.
    owner: ctx.source.owner ?? NOT_SUPPLIED,
    // The verbatim source span, not the model's restatement: the note is evidence.
    note: task.citation.quote,
    deadline: isoOrUnsupplied(task.dueAt),
    clinical_priority: task.priority,
    snomed_id: task.snomedId,
    performed_by: ctx.performedBy ?? NOT_SUPPLIED,
    sample_id: ctx.sampleId ?? NOT_SUPPLIED,
    requested_id: ctx.requestedId ?? NOT_SUPPLIED,
  }
}

function isoOrUnsupplied(time: number | undefined): string {
  if (time === undefined || !Number.isFinite(time)) return NOT_SUPPLIED
  return new Date(time).toISOString()
}

/**
 * A stable id for the same task read from the same span.
 *
 * Deterministic so a re-extraction of an unchanged record yields the same
 * entry rather than a duplicate. Plain arithmetic rather than `node:crypto`,
 * so this stays importable from a client component.
 */
export function taskIdFor(task: ExtractedTask): string {
  const material = [
    task.patientId,
    task.citation.resourceId,
    String(task.citation.version),
    task.citation.field ?? '',
    task.tag,
    task.citation.quote,
  ].join('|')

  let hi = 0x811c9dc5
  let lo = 0x01000193
  for (let i = 0; i < material.length; i += 1) {
    const code = material.charCodeAt(i)
    hi = Math.imul(hi ^ code, 0x01000193) >>> 0
    lo = Math.imul(lo ^ ((code << 5) | (code >>> 3)), 0x85ebca6b) >>> 0
  }
  return `task-${hi.toString(16).padStart(8, '0')}${lo.toString(16).padStart(8, '0')}`
}
