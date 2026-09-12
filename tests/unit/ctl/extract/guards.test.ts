import { describe, expect, it } from 'vitest'
import { NOT_SUPPLIED, TASK_TAGS, type SimResource } from '@/ctl/contracts'
import {
  acceptCandidate,
  carryPriority,
  isTaskTag,
  resolveDueAt,
  snomedFromResource,
  verifyQuote,
} from '@/ctl/extract/guards'
import type { FreeTextSpan } from '@/ctl/extract/free-text'
import type { ModelCandidate } from '@/ctl/extract/schema'

const SOURCE_TEXT =
  'Follow-up arrangements require confirmation by the receiving team. Please book a review appointment in 4 weeks.'

function span(overrides: Partial<FreeTextSpan> = {}): FreeTextSpan {
  return {
    resourceId: 'r-1',
    version: 1,
    site: 'hospital',
    field: 'data.sections.followUp',
    text: SOURCE_TEXT,
    patientId: 'SIM-000001',
    anchorTime: 1789200000000,
    kind: 'discharge-summary',
    title: 'Discharge summary',
    ...overrides,
  }
}

function resource(overrides: Partial<SimResource> = {}): SimResource {
  return {
    id: 'r-1',
    kind: 'discharge-summary',
    title: 'Discharge summary',
    status: 'sent',
    version: 1,
    visibleTo: ['hospital', 'gp'],
    data: {},
    provenance: { changes: [] },
    site: 'hospital',
    patientId: 'SIM-000001',
    createdAt: 1789200000000,
    ...overrides,
  }
}

function candidate(overrides: Partial<ModelCandidate> = {}): ModelCandidate {
  return {
    field: 'data.sections.followUp',
    tag: 'book-follow-up-appointment',
    summary: 'Book a review appointment',
    quote: 'Please book a review appointment in 4 weeks.',
    timeframe: null,
    ...overrides,
  }
}

describe('the quote verification guard', () => {
  it('discards a candidate whose quote is not in the source text', () => {
    const fabricated = candidate({
      quote: 'Start amoxicillin 500 mg three times daily for seven days.',
    })

    const outcome = acceptCandidate(fabricated, [span()], resource())

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.rejected.reason).toBe('quote-not-found-in-source')
    expect(outcome.rejected.claimedQuote).toBe(fabricated.quote)
  })

  it('discards a quote that only nearly matches the source', () => {
    // One word changed. A near miss is still a fabrication.
    const outcome = acceptCandidate(
      candidate({ quote: 'Please book a review appointment in 6 weeks.' }),
      [span()],
      resource(),
    )
    expect(outcome.ok).toBe(false)
  })

  it('discards a paraphrase even when it is clinically reasonable', () => {
    const outcome = acceptCandidate(
      candidate({ quote: 'Book the patient a follow-up review in four weeks' }),
      [span()],
      resource(),
    )
    expect(outcome.ok).toBe(false)
  })

  it('keeps a verbatim quote and stores it exactly as the source holds it', () => {
    const outcome = acceptCandidate(candidate(), [span()], resource())

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.task.citation.quote).toBe('Please book a review appointment in 4 weeks.')
    expect(SOURCE_TEXT).toContain(outcome.task.citation.quote)
  })

  it('rejects an empty quote', () => {
    const outcome = acceptCandidate(candidate({ quote: '   ' }), [span()], resource())
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.rejected.reason).toBe('quote-empty')
  })

  it('re-attributes a quote when the model names the wrong field, rather than trusting the label', () => {
    const spans = [span({ field: 'data.sections.gpActions', text: 'Nothing outstanding.' }), span()]

    const verified = verifyQuote(
      'Please book a review appointment in 4 weeks.',
      spans,
      'data.sections.gpActions',
    )

    expect(verified?.span.field).toBe('data.sections.followUp')
  })

  it('never matches against text that was not supplied to the model', () => {
    expect(verifyQuote('Chase blood culture results', [span()])).toBeNull()
  })
})

describe('the tag bank guard', () => {
  it('discards a candidate whose tag is not in the bank', () => {
    const outcome = acceptCandidate(
      candidate({ tag: 'prescribe-antibiotics' }),
      [span()],
      resource(),
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.rejected.reason).toBe('tag-not-in-bank')
    expect(outcome.rejected.claimedTag).toBe('prescribe-antibiotics')
  })

  it('discards a tag that is a near variant of a real one', () => {
    for (const tag of ['book-followup-appointment', 'Book-Follow-Up-Appointment', 'contact_patient']) {
      expect(isTaskTag(tag)).toBe(false)
    }
  })

  it('accepts every tag in the bank and nothing else', () => {
    for (const tag of TASK_TAGS) expect(isTaskTag(tag)).toBe(true)
    expect(isTaskTag('')).toBe(false)
    expect(isTaskTag('other')).toBe(false)
  })
})

describe('priority is carried from the source, never chosen', () => {
  it('carries a source priority that is a member of the clinical enum', () => {
    const outcome = acceptCandidate(candidate(), [span()], resource({ priority: 'urgent' }))
    expect(outcome.ok && outcome.task.priority).toBe('urgent')
  })

  it('reports a source priority outside the enum as unsupplied rather than mapping it', () => {
    // The simulator uses `routine`, which has no member in emergency/urgent/standard.
    // Choosing `standard` for it would be us grading the work.
    const outcome = acceptCandidate(candidate(), [span()], resource({ priority: 'routine' }))
    expect(outcome.ok && outcome.task.priority).toBe(NOT_SUPPLIED)
  })

  it('reports an absent source priority as unsupplied', () => {
    const outcome = acceptCandidate(candidate(), [span()], resource())
    expect(outcome.ok && outcome.task.priority).toBe(NOT_SUPPLIED)
  })

  it('ignores any priority the model tries to supply', () => {
    const withPriority = { ...candidate(), priority: 'emergency' } as ModelCandidate
    const outcome = acceptCandidate(withPriority, [span()], resource())
    expect(outcome.ok && outcome.task.priority).toBe(NOT_SUPPLIED)
  })

  it('normalises case but invents nothing', () => {
    expect(carryPriority('URGENT')).toBe('urgent')
    expect(carryPriority('semi-urgent')).toBe(NOT_SUPPLIED)
    expect(carryPriority(undefined)).toBe(NOT_SUPPLIED)
  })
})

describe('deadlines', () => {
  it('omits dueAt when the text states no timeframe', () => {
    const outcome = acceptCandidate(candidate(), [span()], resource())
    expect(outcome.ok && outcome.task.dueAt).toBeUndefined()
  })

  it('computes dueAt from the source record timestamp and records the arithmetic', () => {
    const outcome = acceptCandidate(
      candidate({ timeframe: { quote: 'in 4 weeks', amount: 4, unit: 'week' } }),
      [span()],
      resource(),
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.task.dueAt).toBe(1789200000000 + 4 * 7 * 86_400_000)
    expect(outcome.derivation?.rule).toContain('1789200000000')
    expect(outcome.derivation?.quote).toBe('in 4 weeks')
  })

  it('discards a candidate whose timeframe phrase is not in the source', () => {
    const outcome = acceptCandidate(
      candidate({ timeframe: { quote: 'within 48 hours', amount: 2, unit: 'day' } }),
      [span()],
      resource(),
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.rejected.reason).toBe('timeframe-quote-not-found-in-source')
  })

  it('omits dueAt when the record has no timestamp to anchor to', () => {
    const anchorless = span({ anchorTime: undefined })
    expect(resolveDueAt({ quote: 'in 4 weeks', amount: 4, unit: 'week' }, anchorless)).toBeNull()
  })

  it('uses calendar arithmetic for months rather than an averaged month', () => {
    const january = span({
      text: 'Review in 1 month.',
      anchorTime: Date.UTC(2026, 0, 31, 9, 0, 0),
    })
    const resolved = resolveDueAt({ quote: 'in 1 month', amount: 1, unit: 'month' }, january)
    expect(resolved?.dueAt).toBe(Date.UTC(2026, 1, 31, 9, 0, 0))
  })

  it('rejects an implausible interval instead of producing a distant date', () => {
    expect(
      resolveDueAt({ quote: 'in 4 weeks', amount: 9999, unit: 'year' }, span()),
    ).toBeNull()
    expect(resolveDueAt({ quote: 'in 4 weeks', amount: 0, unit: 'week' }, span())).toBeNull()
  })
})

describe('snomed', () => {
  it('is unsupplied for a simulator record, because the simulator has no SNOMED', () => {
    expect(snomedFromResource(resource())).toBe(NOT_SUPPLIED)
    expect(
      snomedFromResource(resource({ data: { problems: [{ code: 'SIM-PROBLEM-2', term: 'CKD' }] } })),
    ).toBe(NOT_SUPPLIED)
  })

  it('is read from the record when the record genuinely carries one', () => {
    expect(snomedFromResource(resource({ data: { snomedId: '183487005' } }))).toBe('183487005')
    expect(
      snomedFromResource(resource({ data: { documentSnomedCodes: ['373942005'] } })),
    ).toBe('373942005')
  })
})
