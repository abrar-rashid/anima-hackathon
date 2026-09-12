import { z } from 'zod'
import { TASK_TAGS } from '@/ctl/contracts'

/**
 * The shape the model is forced into by OpenAI structured outputs.
 *
 * What is *absent* from this schema matters as much as what is present. There
 * is no priority field, no severity field, no snomed field and no absolute
 * date field, so the model has nowhere to express a clinical judgement or an
 * invented deadline even if it tried. `tag` is an enum of the fixed bank, and
 * the enum is re-checked in code because a schema is a claim about the
 * response, not a proof about it.
 */

const RELATIVE_UNITS = ['day', 'week', 'month', 'year'] as const

export const EXTRACTION_SCHEMA_NAME = 'extracted_task_candidates'

export const CANDIDATE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      description:
        'One entry per explicit instruction found in the supplied text. Empty when the text states no follow-up work.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'tag', 'summary', 'quote', 'timeframe'],
        properties: {
          field: {
            type: 'string',
            description: 'The `field` label of the supplied span this came from, copied exactly.',
          },
          tag: {
            type: 'string',
            enum: [...TASK_TAGS],
            description: 'The single closest tag from the fixed bank. Never a new value.',
          },
          summary: {
            type: 'string',
            description: 'Short restatement of the instruction, for display only.',
          },
          quote: {
            type: 'string',
            description:
              'A contiguous substring of the supplied text, copied character for character, that states the instruction.',
          },
          timeframe: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['quote', 'amount', 'unit'],
            description:
              'Only when the text itself states a relative timeframe. Null otherwise. Never estimated.',
            properties: {
              quote: {
                type: 'string',
                description: 'The substring stating the timeframe, copied character for character.',
              },
              amount: { type: 'integer', description: 'The number of units the text states.' },
              unit: { type: 'string', enum: [...RELATIVE_UNITS] },
            },
          },
        },
      },
    },
  },
} as const

const TimeframeSchema = z.object({
  quote: z.string(),
  amount: z.number().int(),
  unit: z.enum(RELATIVE_UNITS),
})

/**
 * `tag` is parsed as a plain string, not as the enum, on purpose: an off-bank
 * tag must reach the guard so it can be counted as a rejection rather than
 * silently failing the whole batch.
 */
const CandidateSchema = z.object({
  field: z.string(),
  tag: z.string(),
  summary: z.string(),
  quote: z.string(),
  timeframe: TimeframeSchema.nullable(),
})

export const CandidateBatchSchema = z.object({
  candidates: z.array(CandidateSchema),
})

export type ModelCandidate = z.infer<typeof CandidateSchema>
export type ModelTimeframe = z.infer<typeof TimeframeSchema>
export type RelativeUnit = (typeof RELATIVE_UNITS)[number]
