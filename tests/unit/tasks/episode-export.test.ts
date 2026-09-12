import { describe, expect, it } from 'vitest'
import {
  ClinicalTaskEpisodePermissiveSchema,
  ClinicalTaskEpisodeStrictSchema,
} from '@/tasks/episode-schema'
import {
  exportClinicalTaskEpisode,
  simulatorMsToIso,
} from '@/tasks/episode-export'
import { deriveTaskState } from '@/tasks/ledger'
import { sourceOnly, sourceSupplied } from '@/tasks/types'
import { cite, makeEntry, T0 } from './helpers'

function fullySourcedEntry() {
  return makeEntry({
    entryId: 'full-1',
    episodeId: sourceSupplied('enc-1', cite('r-2', 'encounterId')),
    snomedId: sourceOnly('386661006', cite('ehr-1', 'snomedId')),
    sampleId: sourceOnly('samp-1', cite('ord-1', 'sampleId')),
    performedBy: {
      value: { teamId: 'diagnostics', actorId: null, actorAttribution: 'source-team' },
      provenance: { kind: 'source-supplied', citation: cite('ord-1', 'owner') },
    },
    requestedBy: {
      value: { teamId: 'hospital', actorId: null, actorAttribution: 'source-team' },
      provenance: { kind: 'source-supplied', citation: cite('ord-1', 'requestedBy') },
    },
  })
}

describe('ClinicalTaskEpisode export boundary', () => {
  it('a fully sourced entry round-trips and validates against the strict schema', () => {
    const entry = fullySourcedEntry()
    const derived = deriveTaskState([entry])
    expect(derived.ok).toBe(true)
    const exported = exportClinicalTaskEpisode(derived.tasks[0]!, 'strict')
    expect(exported.ok).toBe(true)
    if (!exported.ok) throw new Error('expected strict success')
    expect(ClinicalTaskEpisodeStrictSchema.safeParse(exported.episode).success).toBe(true)
    expect(exported.episode).toEqual({
      episode_id: 'enc-1',
      timestamp: simulatorMsToIso(T0),
      task_id: 'r-2',
      status: 'open',
      owner: 'gp',
      note: 'Arrange post-discharge monitoring',
      deadline: simulatorMsToIso(T0),
      clinical_priority: 'urgent',
      snomed_id: '386661006',
      performed_by: 'diagnostics',
      sample_id: 'samp-1',
      requested_id: 'hospital',
    })
    expect(exported.timeOrigin.kind).toBe('simulator-time')
    expect(exported.timeOrigin.epochMs).toBe(T0)
    expect(exported.timeOrigin.iso8601).toBe(simulatorMsToIso(T0))
  })

  it('strict mode refuses an entry missing SNOMED and names snomed_id', () => {
    const result = exportClinicalTaskEpisode(makeEntry({ entryId: 'r2' }), 'strict')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected strict refusal')
    expect(result.mode).toBe('strict')
    const fields = result.missing.map((row) => row.field)
    expect(fields).toContain('snomed_id')
    const snomed = result.missing.find((row) => row.field === 'snomed_id')
    expect(snomed?.reason.toLowerCase()).toMatch(/snomed|not supplied|source/)
    expect(snomed?.reason.toLowerCase()).not.toMatch(/invent|generat(e|ed) a snomed/)
  })

  it('strict mode never fills a required field to pass validation', () => {
    const result = exportClinicalTaskEpisode(makeEntry({ entryId: 'r2' }), 'strict')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected refusal')
    expect(result).not.toHaveProperty('episode')
    expect(result.missing.map((row) => row.field)).toEqual(
      expect.arrayContaining(['snomed_id', 'performed_by', 'requested_id', 'episode_id']),
    )
  })

  it('the same missing-SNOMED entry passes permissive mode with a deviation recorded', () => {
    const result = exportClinicalTaskEpisode(makeEntry({ entryId: 'r2' }), 'permissive')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected permissive success')
    expect(result.mode).toBe('permissive')
    expect(result.episode.snomed_id).toBeNull()
    expect(result.episode.clinical_priority).toBe('urgent')
    expect(result.episode.owner).toBe('gp')
    expect(result.deviations.some((row) => row.field === 'snomed_id')).toBe(true)
    expect(ClinicalTaskEpisodePermissiveSchema.safeParse(result.episode).success).toBe(true)
  })

  it('an absent priority never becomes standard in either mode', () => {
    const entry = makeEntry({ entryId: 'nopri', priority: null })
    const strict = exportClinicalTaskEpisode(entry, 'strict')
    expect(strict.ok).toBe(false)
    if (strict.ok) throw new Error('expected strict refusal')
    expect(strict.missing.map((row) => row.field)).toContain('clinical_priority')
    expect(strict.missing.find((row) => row.field === 'clinical_priority')?.reason.toLowerCase()).toMatch(
      /standard/,
    )

    const permissive = exportClinicalTaskEpisode(entry, 'permissive')
    expect(permissive.ok).toBe(true)
    if (!permissive.ok) throw new Error('expected permissive success')
    expect(permissive.episode.clinical_priority).toBeNull()
    expect(permissive.episode.clinical_priority).not.toBe('standard')
    expect(permissive.deviations.some((row) => row.field === 'clinical_priority')).toBe(true)
  })

  it('additionalProperties: false is honoured — no extra keys leak into the emitted object', () => {
    const strict = exportClinicalTaskEpisode(fullySourcedEntry(), 'strict')
    expect(strict.ok).toBe(true)
    if (!strict.ok) throw new Error('expected strict success')
    expect(Object.keys(strict.episode).sort()).toEqual([
      'clinical_priority',
      'deadline',
      'episode_id',
      'note',
      'owner',
      'performed_by',
      'requested_id',
      'sample_id',
      'snomed_id',
      'status',
      'task_id',
      'timestamp',
    ])
    expect(strict.timeOrigin).toBeDefined()
    expect('timeOrigin' in strict.episode).toBe(false)
    expect('deviations' in strict.episode).toBe(false)

    const permissive = exportClinicalTaskEpisode(makeEntry({ entryId: 'r2' }), 'permissive')
    expect(permissive.ok).toBe(true)
    if (!permissive.ok) throw new Error('expected permissive success')
    expect(Object.keys(permissive.episode).sort()).toEqual(Object.keys(strict.episode).sort())
    expect('deviations' in permissive.episode).toBe(false)
    expect(ClinicalTaskEpisodeStrictSchema.safeParse(permissive.episode).success).toBe(false)
  })

  it('emits team-level attribution and never presents app-side staff as a source clinician', () => {
    const entry = makeEntry({
      entryId: 'app-1',
      episodeId: sourceSupplied('enc-1', cite('r-2', 'encounterId')),
      snomedId: sourceOnly('386661006', cite('ehr-1', 'snomedId')),
      sampleId: sourceOnly('samp-1', cite('ord-1', 'sampleId')),
      performedBy: {
        value: { teamId: 'gp', actorId: 'gp-duty-1', actorAttribution: 'app-side' },
        provenance: {
          kind: 'derived',
          rule: 'App-side staff attribution (simulator records team-level actor).',
          from: [cite('r-2', 'owner')],
        },
      },
      requestedBy: {
        value: { teamId: 'hospital', actorId: null, actorAttribution: 'source-team' },
        provenance: { kind: 'source-supplied', citation: cite('ord-1', 'requestedBy') },
      },
    })

    const strict = exportClinicalTaskEpisode(entry, 'strict')
    expect(strict.ok).toBe(false)
    if (strict.ok) throw new Error('expected strict refusal of app-side performer')
    expect(strict.missing.map((row) => row.field)).toContain('performed_by')

    const permissive = exportClinicalTaskEpisode(entry, 'permissive')
    expect(permissive.ok).toBe(true)
    if (!permissive.ok) throw new Error('expected permissive success')
    expect(permissive.episode.performed_by).toBe('app-side:gp-duty-1')
    expect(permissive.episode.performed_by).not.toBe('gp-duty-1')
    expect(permissive.episode.owner).toBe('gp')
    expect(permissive.deviations.some((row) => row.field === 'performed_by' && row.code === 'app-side-identity')).toBe(
      true,
    )
    expect(permissive.deviations.some((row) => row.field === 'owner' && row.code === 'team-level-not-clinician')).toBe(
      true,
    )
  })

  it('carries simulator-time origin beside the ISO strings and does not read the clock', () => {
    const result = exportClinicalTaskEpisode(fullySourcedEntry(), 'strict')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected success')
    expect(result.episode.timestamp).toBe('2026-09-13T08:00:00.000Z')
    expect(result.timeOrigin.note).toMatch(/simulator/i)
    expect(result.timeOrigin.note).toMatch(/1789286400000/)
    expect(result.timeOrigin.note.toLowerCase()).toMatch(/not wall-clock|not real time|not wall clock/)
  })
})
