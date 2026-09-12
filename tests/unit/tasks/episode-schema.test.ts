import { describe, expect, it } from 'vitest'
import {
  CLINICAL_PRIORITY_STRICT,
  CLINICAL_TASK_EPISODE_FIELDS,
  ClinicalTaskEpisodePermissiveSchema,
  ClinicalTaskEpisodeStrictSchema,
  clinicalTaskEpisodePermissiveJsonSchema,
  clinicalTaskEpisodeStrictJsonSchema,
} from '@/tasks/episode-schema'

const fullyPopulated = {
  episode_id: 'enc-1',
  timestamp: '2026-09-13T00:00:00.000Z',
  task_id: 'r-2',
  status: 'open',
  owner: 'gp',
  note: 'Arrange post-discharge monitoring',
  deadline: '2026-09-13T00:00:00.000Z',
  clinical_priority: 'urgent' as const,
  snomed_id: '386661006',
  performed_by: 'diagnostics',
  sample_id: 'samp-1',
  requested_id: 'hospital',
}

describe('ClinicalTaskEpisode schemas', () => {
  it('strict schema matches the published contract: twelve required strings, requested_id, date-time, priority enum', () => {
    expect(CLINICAL_TASK_EPISODE_FIELDS).toEqual([
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
    ])
    expect(CLINICAL_PRIORITY_STRICT).toEqual(['emergency', 'urgent', 'standard'])
    expect(clinicalTaskEpisodeStrictJsonSchema.title).toBe('ClinicalTaskEpisode')
    expect(clinicalTaskEpisodeStrictJsonSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(clinicalTaskEpisodeStrictJsonSchema.additionalProperties).toBe(false)
    expect(clinicalTaskEpisodeStrictJsonSchema.required).toEqual(CLINICAL_TASK_EPISODE_FIELDS)
    expect(clinicalTaskEpisodeStrictJsonSchema.properties.requested_id).toBeDefined()
    expect(
      (clinicalTaskEpisodeStrictJsonSchema.properties as Record<string, unknown>).requested_by,
    ).toBeUndefined()
    expect(clinicalTaskEpisodeStrictJsonSchema.properties.clinical_priority.enum).toEqual([
      'emergency',
      'urgent',
      'standard',
    ])
    expect(clinicalTaskEpisodeStrictJsonSchema.properties.snomed_id.type).toBe('string')
    expect(clinicalTaskEpisodeStrictJsonSchema.properties.timestamp.format).toBe('date-time')
    expect(clinicalTaskEpisodeStrictJsonSchema.properties.deadline.format).toBe('date-time')
  })

  it('strict zod accepts a fully populated episode and rejects extra keys', () => {
    expect(ClinicalTaskEpisodeStrictSchema.safeParse(fullyPopulated).success).toBe(true)
    const extra = ClinicalTaskEpisodeStrictSchema.safeParse({ ...fullyPopulated, invented: 'no' })
    expect(extra.success).toBe(false)
  })

  it('strict zod rejects a missing snomed_id and an unknown priority', () => {
    const { snomed_id: _dropped, ...noSnomed } = fullyPopulated
    expect(ClinicalTaskEpisodeStrictSchema.safeParse(noSnomed).success).toBe(false)
    expect(
      ClinicalTaskEpisodeStrictSchema.safeParse({ ...fullyPopulated, clinical_priority: 'unknown' }).success,
    ).toBe(false)
    expect(
      ClinicalTaskEpisodeStrictSchema.safeParse({ ...fullyPopulated, snomed_id: null }).success,
    ).toBe(false)
  })

  it('permissive schema unions unavailable fields with null and adds unknown to priority', () => {
    expect(clinicalTaskEpisodePermissiveJsonSchema.properties.snomed_id.type).toEqual(['string', 'null'])
    expect(clinicalTaskEpisodePermissiveJsonSchema.properties.sample_id.type).toEqual(['string', 'null'])
    expect(clinicalTaskEpisodePermissiveJsonSchema.properties.performed_by.type).toEqual(['string', 'null'])
    expect(clinicalTaskEpisodePermissiveJsonSchema.properties.requested_id.type).toEqual(['string', 'null'])
    expect(clinicalTaskEpisodePermissiveJsonSchema.properties.clinical_priority.enum).toEqual([
      'emergency',
      'urgent',
      'standard',
      'unknown',
    ])
    const parsed = ClinicalTaskEpisodePermissiveSchema.safeParse({
      ...fullyPopulated,
      episode_id: null,
      snomed_id: null,
      sample_id: null,
      performed_by: null,
      requested_id: null,
      clinical_priority: null,
      deadline: null,
      note: null,
    })
    expect(parsed.success).toBe(true)
    expect(
      ClinicalTaskEpisodePermissiveSchema.safeParse({
        ...fullyPopulated,
        clinical_priority: 'unknown',
      }).success,
    ).toBe(true)
  })

  it('permissive schema still forbids extra keys', () => {
    const extra = ClinicalTaskEpisodePermissiveSchema.safeParse({
      ...fullyPopulated,
      snomed_id: null,
      leakage: true,
    })
    expect(extra.success).toBe(false)
  })
})
