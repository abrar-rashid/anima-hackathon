import OpenAI from 'openai'
import { CANDIDATE_JSON_SCHEMA, EXTRACTION_SCHEMA_NAME } from './schema'

/**
 * The model transport, isolated so the rest of the layer stays pure and
 * testable and so the key has exactly one place to live.
 *
 * `OPENAI_API_KEY` is read here and nowhere else. This module throws if it is
 * ever evaluated in a browser bundle, matching the Anima client, and no error
 * message it produces may carry the key — see `sanitiseModelError`.
 */

const DEFAULT_MODEL = 'gpt-5.4-mini'

/** Reasoning models spend tokens before answering; leave room for both. */
const MAX_COMPLETION_TOKENS = 6_000

export interface ModelCallResult {
  ok: boolean
  /** Raw JSON string from the model, unparsed. */
  content?: string
  error?: string
}

export interface ExtractionModel {
  complete(system: string, user: string): Promise<ModelCallResult>
}

function assertServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new Error('Extraction model client is server-only')
  }
}

export function extractionModelName(): string {
  return process.env.OPENAI_EXTRACTION_MODEL ?? DEFAULT_MODEL
}

/** Strip anything key-shaped before a message can reach a log or a response. */
export function sanitiseModelError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
}

/**
 * Null when there is no key. The caller degrades to an empty result with a
 * reason rather than throwing into a page.
 */
export function createExtractionModel(): ExtractionModel | null {
  assertServerOnly()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const client = new OpenAI({ apiKey })
  const model = extractionModelName()

  return {
    async complete(system: string, user: string): Promise<ModelCallResult> {
      try {
        const response = await client.chat.completions.create({
          model,
          max_completion_tokens: MAX_COMPLETION_TOKENS,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: EXTRACTION_SCHEMA_NAME,
              strict: true,
              schema: CANDIDATE_JSON_SCHEMA as unknown as Record<string, unknown>,
            },
          },
        })
        const choice = response.choices[0]
        if (choice?.finish_reason === 'length') {
          return { ok: false, error: 'model response truncated before completing the schema' }
        }
        const content = choice?.message.content
        if (!content) return { ok: false, error: 'model returned no content' }
        return { ok: true, content }
      } catch (error) {
        return { ok: false, error: sanitiseModelError(error) }
      }
    },
  }
}
