import { describe, expect, it } from 'vitest'
import {
  NOT_SUPPLIED,
  type ClinicalTaskEpisode,
  type ExtractedTask,
  type SimResource,
} from '@/ctl/contracts'
import { EPISODE_UNSUPPLIED_FIELDS, taskIdFor, toEpisode } from '@/ctl/extract/episode'

/** The twelve fields the Team 12 schema requires, in the schema's own order. */
const REQUIRED_FIELDS: readonly (keyof ClinicalTaskEpisode)[] = [
  'episode_id',
  'timestamp',
  'task_id',
  'status',
  'owner',
  'note',
  'deadline',
  'clinical_priority',
  'snomed_id',
  'performed_by',
  'sample_id',
  'requested_id',
]

function source(overrides: Partial<SimResource> = {}): SimResource {
  return {
    id: 'discharge-summary-example',
    kind: 'discharge-summary',
    title: 'Discharge summary',
    status: 'sent',
    version: 1,
    visibleTo: ['hospital', 'gp'],
    site: 'hospital',
    patientId: 'SIM-000001',
    owner: 'hospital',
    createdAt: 1789200000000,
    data: {},
    provenance: { changes: [] },
    ...overrides,
  }
}

function task(overrides: Partial<ExtractedTask> = {}): ExtractedTask {
  return {
    tag: 'confirm-follow-up-arrangements',
    summary: 'Confirm follow-up arrangements',
    patientId: 'SIM-000001',
    citation: {
      resourceId: 'discharge-summary-example',
      version: 1,
      site: 'hospital',
      field: 'data.sections.followUp',
      quote: 'Follow-up arrangements require confirmation by the receiving team.',
    },
    priority: NOT_SUPPLIED,
    snomedId: NOT_SUPPLIED,
    ...overrides,
  }
}

describe('toEpisode', () => {
  it('populates all twelve required fields and adds none', () => {
    const episode = toEpisode(task(), { source: source() })

    expect(Object.keys(episode).sort()).toEqual([...REQUIRED_FIELDS].sort())
    for (const field of REQUIRED_FIELDS) {
      expect(typeof episode[field]).toBe('string')
      expect(episode[field]).not.toBe('')
    }
  })

  it('marks every field the simulator cannot supply, rather than filling it', () => {
    const episode = toEpisode(task(), { source: source() })

    for (const field of EPISODE_UNSUPPLIED_FIELDS) {
      expect(episode[field]).toBe(NOT_SUPPLIED)
    }
    expect(episode.snomed_id).toBe(NOT_SUPPLIED)
    expect(episode.clinical_priority).toBe(NOT_SUPPLIED)
    expect(episode.deadline).toBe(NOT_SUPPLIED)
  })

  it('uses the verbatim source span as the note, not the model restatement', () => {
    const episode = toEpisode(task({ summary: 'Sort out follow-up' }), { source: source() })

    expect(episode.note).toBe('Follow-up arrangements require confirmation by the receiving team.')
    expect(episode.note).not.toBe('Sort out follow-up')
  })

  it('renders timestamps as ISO simulator time taken from the record', () => {
    const episode = toEpisode(task({ dueAt: 1789286400000 }), { source: source() })

    expect(episode.timestamp).toBe(new Date(1789200000000).toISOString())
    expect(episode.deadline).toBe(new Date(1789286400000).toISOString())
  })

  it('falls back to provenance creation time when createdAt is absent', () => {
    const episode = toEpisode(task(), {
      source: source({
        createdAt: undefined,
        provenance: {
          created: {
            time: 1768464000000,
            actor: { kind: 'simulation', name: 'Synthetic hospital history' },
            action: 'generate_history',
            source: 'hospital',
            version: 1,
          },
          changes: [],
        },
      }),
    })

    expect(episode.timestamp).toBe(new Date(1768464000000).toISOString())
  })

  it('records the team-level owner from the record, and marks its absence', () => {
    expect(toEpisode(task(), { source: source() }).owner).toBe('hospital')
    expect(toEpisode(task(), { source: source({ owner: undefined }) }).owner).toBe(NOT_SUPPLIED)
  })

  it('derives episode_id from the record the task hangs off', () => {
    expect(toEpisode(task(), { source: source() }).episode_id).toBe(
      'ep-hospital-discharge-summary-example',
    )
  })

  it('carries a source-supplied priority through unchanged', () => {
    const episode = toEpisode(task({ priority: 'urgent' }), { source: source() })
    expect(episode.clinical_priority).toBe('urgent')
  })

  it('labels an extracted candidate as a proposal until a human accepts it', () => {
    expect(toEpisode(task(), { source: source() }).status).toBe('proposed')
    expect(toEpisode(task(), { source: source(), status: 'accepted' }).status).toBe('accepted')
  })
})

describe('taskIdFor', () => {
  it('is stable for the same task read from the same span', () => {
    expect(taskIdFor(task())).toBe(taskIdFor(task()))
  })

  it('differs when the tag, the span or the record version differs', () => {
    const baseline = taskIdFor(task())
    expect(taskIdFor(task({ tag: 'contact-patient' }))).not.toBe(baseline)
    expect(
      taskIdFor(task({ citation: { ...task().citation, version: 2 } })),
    ).not.toBe(baseline)
    expect(
      taskIdFor(task({ citation: { ...task().citation, quote: 'Review this handover.' } })),
    ).not.toBe(baseline)
  })
})
