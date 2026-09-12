import type { ExtractedTask, SimResource } from '@/ctl/contracts'
import { collectFreeText, groupSpansByResource, type FreeTextSpan } from './free-text'
import {
  acceptCandidate,
  candidateFingerprint,
  type DueAtDerivation,
  type RejectedCandidate,
} from './guards'
import { buildExtractionUserMessage, EXTRACTION_SYSTEM_PROMPT } from './prompt'
import { createExtractionModel, extractionModelName, type ExtractionModel } from './model-client'
import { CandidateBatchSchema } from './schema'

/**
 * Free text in, candidate tasks out.
 *
 * Two properties are non-negotiable. First, this never throws into a caller: a
 * missing key or a failed model call returns an empty list and says why, and it
 * never returns a task it could not derive from the source. Second, nothing the
 * model says is taken on trust — every candidate goes through `guards.ts`, and
 * what those guards throw away is reported rather than hidden.
 */

export interface ExtractionOutcome {
  tasks: ExtractedTask[]
  /** Why the list is empty or short. Null when the run was fully successful. */
  reason: string | null
  /** Spans of free text actually read, so a surface can state its denominator. */
  spansRead: number
  resourcesRead: number
  /** Candidates the guards discarded, with the reason each failed. */
  rejected: RejectedCandidate[]
  /** Every deadline that was set, and the arithmetic that produced it. */
  derivations: DueAtDerivation[]
  model: string
}

export interface ExtractOptions {
  /** Injected in tests. Production resolves the real client from the env. */
  model?: ExtractionModel | null
  /** Cap on records sent to the model in one call to `extractTasks`. */
  maxResources?: number
  /** Parallel model calls. One call per record keeps citations tight. */
  concurrency?: number
}

const DEFAULT_MAX_RESOURCES = 12
const DEFAULT_CONCURRENCY = 4

/**
 * The signature the API route and the UI use. Degrades to an empty array.
 * `extractTasksDetailed` carries the reason and the rejection record.
 */
export async function extractTasks(resources: SimResource[]): Promise<ExtractedTask[]> {
  const outcome = await extractTasksDetailed(resources)
  return outcome.tasks
}

export async function extractTasksDetailed(
  resources: SimResource[],
  options: ExtractOptions = {},
): Promise<ExtractionOutcome> {
  const spans = collectFreeText(resources)
  const byResource = groupSpansByResource(spans)
  const base: Omit<ExtractionOutcome, 'reason'> = {
    tasks: [],
    spansRead: 0,
    resourcesRead: 0,
    rejected: [],
    derivations: [],
    model: extractionModelName(),
  }

  if (spans.length === 0) {
    return { ...base, reason: 'no free text in the supplied resources' }
  }

  const model = options.model === undefined ? createExtractionModel() : options.model
  if (!model) {
    return {
      ...base,
      reason: 'OPENAI_API_KEY is not configured, so free-text extraction is disabled',
    }
  }

  const byId = new Map(resources.map((resource) => [resource.id, resource]))
  const jobs = [...byResource.entries()].slice(0, options.maxResources ?? DEFAULT_MAX_RESOURCES)

  const results = await mapWithConcurrency(
    jobs,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    async ([resourceId, resourceSpans]) => {
      const resource = byId.get(resourceId)
      if (!resource) return null
      return runOne(model, resource, resourceSpans)
    },
  )

  const tasks: ExtractedTask[] = []
  const rejected: RejectedCandidate[] = []
  const derivations: DueAtDerivation[] = []
  const seen = new Set<string>()
  const failures: string[] = []
  let spansRead = 0
  let resourcesRead = 0

  for (const result of results) {
    if (!result) continue
    if (result.error) {
      failures.push(result.error)
      continue
    }
    resourcesRead += 1
    spansRead += result.spansRead
    rejected.push(...result.rejected)
    for (const accepted of result.accepted) {
      const fingerprint = candidateFingerprint(accepted.task)
      if (seen.has(fingerprint)) {
        rejected.push({
          reason: 'duplicate-candidate',
          claimedTag: accepted.task.tag,
          claimedQuote: accepted.task.citation.quote,
          resourceId: accepted.task.citation.resourceId,
        })
        continue
      }
      seen.add(fingerprint)
      tasks.push(accepted.task)
      if (accepted.derivation) derivations.push(accepted.derivation)
    }
  }

  const reason =
    failures.length === 0
      ? null
      : `${failures.length} of ${jobs.length} record reads failed: ${[...new Set(failures)].join('; ')}`

  return { ...base, tasks, rejected, derivations, spansRead, resourcesRead, reason }
}

interface OneResourceResult {
  spansRead: number
  accepted: { task: ExtractedTask; derivation?: DueAtDerivation }[]
  rejected: RejectedCandidate[]
  error?: string
}

async function runOne(
  model: ExtractionModel,
  resource: SimResource,
  spans: FreeTextSpan[],
): Promise<OneResourceResult> {
  const call = await model.complete(EXTRACTION_SYSTEM_PROMPT, buildExtractionUserMessage(spans))
  if (!call.ok || !call.content) {
    return { spansRead: 0, accepted: [], rejected: [], error: call.error ?? 'model call failed' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(call.content)
  } catch {
    return { spansRead: 0, accepted: [], rejected: [], error: 'model returned invalid JSON' }
  }

  const batch = CandidateBatchSchema.safeParse(parsed)
  if (!batch.success) {
    return {
      spansRead: 0,
      accepted: [],
      rejected: [],
      error: 'model response did not match the candidate schema',
    }
  }

  const accepted: { task: ExtractedTask; derivation?: DueAtDerivation }[] = []
  const rejected: RejectedCandidate[] = []
  for (const candidate of batch.data.candidates) {
    const outcome = acceptCandidate(candidate, spans, resource)
    if (outcome.ok) {
      accepted.push(outcome.derivation ? { task: outcome.task, derivation: outcome.derivation } : { task: outcome.task })
    } else {
      rejected.push(outcome.rejected)
    }
  }

  return { spansRead: spans.length, accepted, rejected }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index]!)
    }
  })
  await Promise.all(runners)
  return results
}
