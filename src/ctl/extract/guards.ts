import {
  CLINICAL_PRIORITIES,
  NOT_SUPPLIED,
  TASK_TAGS,
  type ClinicalPriority,
  type ExtractedTask,
  type SimResource,
  type TaskTag,
} from '@/ctl/contracts'
import type { FreeTextSpan } from './free-text'
import type { ModelCandidate, ModelTimeframe } from './schema'

/**
 * The guards. Pure, and the only reason this layer is safe to run.
 *
 * A model response is treated as an untrusted claim about the source text.
 * Every claim it makes is re-checked here against the source before a candidate
 * is allowed to exist: the tag against the fixed bank, the quote against the
 * actual source string, the priority against the source record, the deadline
 * against arithmetic on the record's own timestamp. Anything that fails is
 * discarded with a named reason rather than repaired.
 */

export type RejectionReason =
  | 'tag-not-in-bank'
  | 'quote-empty'
  | 'quote-not-found-in-source'
  | 'timeframe-quote-not-found-in-source'
  | 'duplicate-candidate'

export interface RejectedCandidate {
  reason: RejectionReason
  /** What the model claimed, kept so a reviewer can see what was thrown away. */
  claimedTag: string
  claimedQuote: string
  resourceId: string
}

/** How a deadline was arrived at. There is no other way for one to be set. */
export interface DueAtDerivation {
  resourceId: string
  dueAt: number
  /** The verbatim timeframe phrase from the source. */
  quote: string
  rule: string
}

const TAG_BANK: ReadonlySet<string> = new Set(TASK_TAGS)
const PRIORITY_BANK: ReadonlySet<string> = new Set(CLINICAL_PRIORITIES)

export function isTaskTag(value: string): value is TaskTag {
  return TAG_BANK.has(value)
}

/**
 * Trim a model-supplied quote without changing its content.
 *
 * Only leading/trailing whitespace and a single pair of wrapping quote marks
 * come off. Nothing inside is altered, so a string that passes the containment
 * check afterwards is still a genuine substring of the source.
 */
function tidyQuote(raw: string): string {
  let quote = raw.trim()
  const pairs: [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ['\u201c', '\u201d'],
  ]
  for (const [open, close] of pairs) {
    if (quote.length > 1 && quote.startsWith(open) && quote.endsWith(close)) {
      quote = quote.slice(1, -1).trim()
      break
    }
  }
  return quote
}

/**
 * The hallucination guard.
 *
 * The quote must appear, exactly, inside the text of a span we actually sent.
 * The named span is preferred so attribution stays where the model put it; a
 * mislabelled field falls back to the other spans of the same record, which
 * keeps the citation truthful. No match anywhere means the model produced text
 * that is not in the record, and the candidate does not exist.
 */
export function verifyQuote(
  rawQuote: string,
  spans: FreeTextSpan[],
  namedField?: string,
): { span: FreeTextSpan; quote: string } | null {
  const quote = tidyQuote(rawQuote)
  if (quote.length === 0) return null

  const named = namedField ? spans.find((span) => span.field === namedField) : undefined
  if (named && named.text.includes(quote)) return { span: named, quote }

  const fallback = spans.find((span) => span.text.includes(quote))
  return fallback ? { span: fallback, quote } : null
}

/**
 * Priority comes from the record or not at all.
 *
 * The simulator also uses `routine`, which has no member in the team's
 * three-value enum. Mapping it onto `standard` would be us asserting a clinical
 * grade the source never gave, so it is reported as unsupplied instead.
 */
export function carryPriority(sourcePriority?: string): ClinicalPriority | typeof NOT_SUPPLIED {
  if (!sourcePriority) return NOT_SUPPLIED
  const normalised = sourcePriority.trim().toLowerCase()
  return PRIORITY_BANK.has(normalised) ? (normalised as ClinicalPriority) : NOT_SUPPLIED
}

/**
 * SNOMED only if the record supplies it.
 *
 * The simulator has no SNOMED anywhere — its codes are local `SIM-PROBLEM-N`
 * identifiers — so this returns unsupplied in practice. It reads the fields the
 * live write schema exposes (`documentSnomedCodes`) so a future record that
 * does carry one is picked up, and a code is never generated.
 */
export function snomedFromResource(resource: SimResource): string | typeof NOT_SUPPLIED {
  const single = resource.data.snomedId ?? resource.data.snomedCode
  if (typeof single === 'string' && single.trim().length > 0) return single.trim()

  const list = resource.data.documentSnomedCodes ?? resource.data.snomedCodes
  if (Array.isArray(list)) {
    const first = list.find((code): code is string => typeof code === 'string' && code.trim().length > 0)
    if (first) return first.trim()
  }
  return NOT_SUPPLIED
}

const DAY_MS = 86_400_000
/** A stated interval beyond this is treated as a misread rather than a deadline. */
const MAX_AMOUNT = 366

/**
 * Turn a stated relative interval into an absolute deadline.
 *
 * The only permitted input is a timeframe the source text states, and the only
 * permitted anchor is the source record's own timestamp. Months and years use
 * calendar arithmetic rather than an averaged number of days, so the result is
 * reproducible and is not an approximation dressed up as a date.
 */
export function resolveDueAt(
  timeframe: ModelTimeframe,
  span: FreeTextSpan,
): { dueAt: number; derivation: DueAtDerivation } | null {
  if (span.anchorTime === undefined) return null
  if (!Number.isInteger(timeframe.amount) || timeframe.amount <= 0) return null
  if (timeframe.amount > MAX_AMOUNT) return null

  const quote = tidyQuote(timeframe.quote)
  if (quote.length === 0 || !span.text.includes(quote)) return null

  const anchor = new Date(span.anchorTime)
  let dueAt: number
  switch (timeframe.unit) {
    case 'day':
      dueAt = span.anchorTime + timeframe.amount * DAY_MS
      break
    case 'week':
      dueAt = span.anchorTime + timeframe.amount * 7 * DAY_MS
      break
    case 'month':
      dueAt = Date.UTC(
        anchor.getUTCFullYear(),
        anchor.getUTCMonth() + timeframe.amount,
        anchor.getUTCDate(),
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds(),
      )
      break
    case 'year':
      dueAt = Date.UTC(
        anchor.getUTCFullYear() + timeframe.amount,
        anchor.getUTCMonth(),
        anchor.getUTCDate(),
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds(),
      )
      break
  }

  return {
    dueAt,
    derivation: {
      resourceId: span.resourceId,
      dueAt,
      quote,
      rule: `computed from ${span.resourceId} createdAt (simulator time ${span.anchorTime}) plus ${timeframe.amount} ${timeframe.unit}${timeframe.amount === 1 ? '' : 's'}, the interval stated by the source text`,
    },
  }
}

export type CandidateOutcome =
  | { ok: true; task: ExtractedTask; derivation?: DueAtDerivation }
  | { ok: false; rejected: RejectedCandidate }

/**
 * Apply every guard to one model candidate.
 *
 * Order matters only for the reported reason; each check is independent and all
 * must pass. `resource` is the record the spans came from, and is the sole
 * source of priority and SNOMED — the model has no say in either.
 */
export function acceptCandidate(
  candidate: ModelCandidate,
  spans: FreeTextSpan[],
  resource: SimResource,
): CandidateOutcome {
  const claimed: Pick<RejectedCandidate, 'claimedTag' | 'claimedQuote' | 'resourceId'> = {
    claimedTag: candidate.tag,
    claimedQuote: candidate.quote,
    resourceId: resource.id,
  }

  if (!isTaskTag(candidate.tag)) {
    return { ok: false, rejected: { ...claimed, reason: 'tag-not-in-bank' } }
  }

  if (candidate.quote.trim().length === 0) {
    return { ok: false, rejected: { ...claimed, reason: 'quote-empty' } }
  }

  const verified = verifyQuote(candidate.quote, spans, candidate.field)
  if (!verified) {
    return { ok: false, rejected: { ...claimed, reason: 'quote-not-found-in-source' } }
  }

  // A timeframe the source does not contain means the deadline was invented,
  // which discredits the candidate rather than just the date.
  let resolved: { dueAt: number; derivation: DueAtDerivation } | null = null
  if (candidate.timeframe) {
    resolved = resolveDueAt(candidate.timeframe, verified.span)
    if (!resolved && !verified.span.text.includes(tidyQuote(candidate.timeframe.quote))) {
      return { ok: false, rejected: { ...claimed, reason: 'timeframe-quote-not-found-in-source' } }
    }
  }

  const task: ExtractedTask = {
    tag: candidate.tag,
    summary: candidate.summary.trim(),
    patientId: verified.span.patientId,
    citation: {
      resourceId: verified.span.resourceId,
      version: verified.span.version,
      site: verified.span.site,
      field: verified.span.field,
      quote: verified.quote,
    },
    priority: carryPriority(resource.priority),
    snomedId: snomedFromResource(resource),
    ...(resolved ? { dueAt: resolved.dueAt } : {}),
  }

  return resolved ? { ok: true, task, derivation: resolved.derivation } : { ok: true, task }
}

/** Same tag quoting the same span twice is one task, not two. */
export function candidateFingerprint(task: ExtractedTask): string {
  return [task.citation.resourceId, task.citation.field ?? '', task.tag, task.citation.quote].join('|')
}
