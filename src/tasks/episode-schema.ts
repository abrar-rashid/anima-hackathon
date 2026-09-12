import { z } from 'zod'

/**
 * The team's published ClinicalTaskEpisode contract (JSON Schema draft 2020-12).
 * The STRICT variant matches that document exactly. It cannot be satisfied
 * honestly against the simulator for every required field; see episode-export.ts.
 */

export const CLINICAL_TASK_EPISODE_FIELDS = [
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
] as const

export const CLINICAL_PRIORITY_STRICT = ['emergency', 'urgent', 'standard'] as const
export const CLINICAL_PRIORITY_PERMISSIVE = ['emergency', 'urgent', 'standard', 'unknown'] as const

const isoDateTime = z.string().datetime()

export const ClinicalTaskEpisodeStrictSchema = z
  .object({
    episode_id: z.string(),
    timestamp: isoDateTime,
    task_id: z.string(),
    status: z.string(),
    owner: z.string(),
    note: z.string(),
    deadline: isoDateTime,
    clinical_priority: z.enum(CLINICAL_PRIORITY_STRICT),
    snomed_id: z.string(),
    performed_by: z.string(),
    sample_id: z.string(),
    requested_id: z.string(),
  })
  .strict()

export const ClinicalTaskEpisodePermissiveSchema = z
  .object({
    episode_id: z.string().nullable(),
    timestamp: isoDateTime,
    task_id: z.string(),
    status: z.string(),
    owner: z.string(),
    note: z.string().nullable(),
    deadline: isoDateTime.nullable(),
    clinical_priority: z.enum(CLINICAL_PRIORITY_PERMISSIVE).nullable(),
    snomed_id: z.string().nullable(),
    performed_by: z.string().nullable(),
    sample_id: z.string().nullable(),
    requested_id: z.string().nullable(),
  })
  .strict()

export type ClinicalTaskEpisode = z.infer<typeof ClinicalTaskEpisodeStrictSchema>
export type PermissiveClinicalTaskEpisode = z.infer<typeof ClinicalTaskEpisodePermissiveSchema>

type JsonSchemaType = 'string' | 'null' | ['string', 'null']

type JsonSchemaProperty = {
  type: JsonSchemaType
  description: string
  format?: 'date-time'
  enum?: readonly string[]
}

type ClinicalTaskEpisodeJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema'
  title: 'ClinicalTaskEpisode'
  type: 'object'
  additionalProperties: false
  required: readonly typeof CLINICAL_TASK_EPISODE_FIELDS[number][]
  properties: Record<(typeof CLINICAL_TASK_EPISODE_FIELDS)[number], JsonSchemaProperty>
}

export const clinicalTaskEpisodeStrictJsonSchema: ClinicalTaskEpisodeJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'ClinicalTaskEpisode',
  type: 'object',
  additionalProperties: false,
  required: CLINICAL_TASK_EPISODE_FIELDS,
  properties: {
    episode_id: { type: 'string', description: 'Episode identifier' },
    timestamp: { type: 'string', format: 'date-time', description: 'Observation time' },
    task_id: { type: 'string', description: 'Task identifier' },
    status: { type: 'string', description: 'Task status' },
    owner: { type: 'string', description: 'Clinician identifier' },
    note: { type: 'string', description: 'Task note' },
    deadline: { type: 'string', format: 'date-time', description: 'Task deadline' },
    clinical_priority: {
      type: 'string',
      enum: CLINICAL_PRIORITY_STRICT,
      description: 'Clinical priority',
    },
    snomed_id: { type: 'string', description: 'SNOMED CT concept identifier' },
    performed_by: { type: 'string', description: 'Clinician identifier' },
    sample_id: { type: 'string', description: 'Sample identifier' },
    requested_id: { type: 'string', description: 'Clinician identifier' },
  },
}

export const clinicalTaskEpisodePermissiveJsonSchema: ClinicalTaskEpisodeJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'ClinicalTaskEpisode',
  type: 'object',
  additionalProperties: false,
  required: CLINICAL_TASK_EPISODE_FIELDS,
  properties: {
    episode_id: {
      type: ['string', 'null'],
      description: 'Episode identifier. Null when the source does not supply or derive one.',
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO rendering of simulator milliseconds, not wall-clock time.',
    },
    task_id: { type: 'string', description: 'Task identifier' },
    status: { type: 'string', description: 'Task status' },
    owner: {
      type: 'string',
      description: 'Source team identifier. The published schema asks for a clinician identifier; the simulator is team-level.',
    },
    note: { type: ['string', 'null'], description: 'Task note. Null when the source supplies none.' },
    deadline: {
      type: ['string', 'null'],
      format: 'date-time',
      description: 'ISO rendering of simulator dueAt, or null when the source supplies none.',
    },
    clinical_priority: {
      type: ['string', 'null'],
      enum: CLINICAL_PRIORITY_PERMISSIVE,
      description:
        'Source-supplied priority only. unknown or null means no priority supplied by source — never a default of standard.',
    },
    snomed_id: {
      type: ['string', 'null'],
      description: 'SNOMED CT concept identifier. Null unless a source field supplied it. Never generated.',
    },
    performed_by: {
      type: ['string', 'null'],
      description: 'Performer. Null unless the source supplied a team or a labelled app-side identity.',
    },
    sample_id: {
      type: ['string', 'null'],
      description: 'Sample identifier. Null unless a source field supplied it.',
    },
    requested_id: {
      type: ['string', 'null'],
      description: 'Requester. Null unless the source supplied a team or a labelled app-side identity.',
    },
  },
}
