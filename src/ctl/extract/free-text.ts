import type { SimResource, Site } from '@/ctl/contracts'

/**
 * Collect the free text a model is allowed to read.
 *
 * Pure: no I/O, no clock, no randomness. Everything downstream cites one of
 * these spans, so a span records exactly where its text came from — resource,
 * version, site and field path — and nothing else is ever handed to the model.
 *
 * Structured clinical values (observation `value`, report `analytes`, problem
 * codes) are deliberately excluded. Reading a number and calling it high or low
 * is clinical interpretation, which this layer must not do.
 */

/** One string of source text, with everything needed to cite it. */
export interface FreeTextSpan {
  resourceId: string
  version: number
  site: Site
  /** Data path within the resource, e.g. `data.sections.followUp`. */
  field: string
  /** The source string, verbatim. Quotes are verified against this. */
  text: string
  patientId: string
  /** Source-supplied priority, verbatim and uninterpreted. */
  priority?: string
  /** The resource's own timestamp: the only anchor for a relative timeframe. */
  anchorTime?: number
  kind: string
  title: string
}

/**
 * Resource kinds that carry clinician-authored narrative. Observed in the
 * captured site views; a kind not listed here is not read.
 */
export const FREE_TEXT_KINDS: readonly string[] = [
  'discharge-summary',
  'document',
  'report',
  'encounter',
  'consultation',
  'note',
  'hospital-note',
  'handover',
]

/** Top-level `data` keys holding narrative on those kinds. */
const TEXT_FIELDS: readonly string[] = ['text', 'note', 'reviewNote', 'filingNote', 'reason']

/** Ignore trivial strings: a label or a single word carries no instruction. */
const MIN_TEXT_LENGTH = 12

/** Guard against a pathological payload consuming the whole prompt budget. */
const MAX_TEXT_LENGTH = 10_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function usableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length < MIN_TEXT_LENGTH) return null
  return trimmed.length > MAX_TEXT_LENGTH ? trimmed.slice(0, MAX_TEXT_LENGTH) : trimmed
}

/**
 * Every readable span in these resources, in resource order then field order.
 *
 * A resource with no `patientId` is skipped: an extracted task with no patient
 * cannot be cited or acted on, and attributing it to a patient would be an
 * invention.
 */
export function collectFreeText(resources: SimResource[]): FreeTextSpan[] {
  const spans: FreeTextSpan[] = []

  for (const resource of resources) {
    if (!FREE_TEXT_KINDS.includes(resource.kind)) continue
    if (!resource.patientId) continue

    const base = {
      resourceId: resource.id,
      version: resource.version,
      site: resource.site,
      patientId: resource.patientId,
      kind: resource.kind,
      title: resource.title,
      ...(resource.priority ? { priority: resource.priority } : {}),
      ...(anchorTimeOf(resource) !== undefined ? { anchorTime: anchorTimeOf(resource)! } : {}),
    }

    // Same text often appears both as `data.text` and inside `data.sections`.
    // Keeping one copy stops the model proposing the same task twice.
    const seen = new Set<string>()

    for (const field of TEXT_FIELDS) {
      const text = usableText(resource.data[field])
      if (!text || seen.has(text)) continue
      seen.add(text)
      spans.push({ ...base, field: `data.${field}`, text })
    }

    const sections = resource.data.sections
    if (isRecord(sections)) {
      for (const [key, raw] of Object.entries(sections)) {
        const text = usableText(raw)
        if (!text || seen.has(text)) continue
        seen.add(text)
        spans.push({ ...base, field: `data.sections.${key}`, text })
      }
    }
  }

  return spans
}

function anchorTimeOf(resource: SimResource): number | undefined {
  return resource.createdAt ?? resource.provenance.created?.time
}

/** Group spans by resource so each model call is scoped to one citable source. */
export function groupSpansByResource(spans: FreeTextSpan[]): Map<string, FreeTextSpan[]> {
  const groups = new Map<string, FreeTextSpan[]>()
  for (const span of spans) {
    const existing = groups.get(span.resourceId)
    if (existing) existing.push(span)
    else groups.set(span.resourceId, [span])
  }
  return groups
}
