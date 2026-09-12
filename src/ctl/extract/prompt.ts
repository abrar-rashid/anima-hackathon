import { TASK_TAGS } from '@/ctl/contracts'
import type { FreeTextSpan } from './free-text'

/**
 * Everything the model is told, in one reviewable place.
 *
 * The prompt is not a safety mechanism. Every rule stated here is also enforced
 * in `guards.ts` against the returned candidate, because a prompt is a request
 * and a guard is a guarantee. The prompt exists to raise the hit rate, not to
 * be trusted.
 */

/** Plain-language gloss per tag, so mapping does not depend on the tag string alone. */
const TAG_GUIDE: Record<(typeof TASK_TAGS)[number], string> = {
  'book-follow-up-appointment': 'the text asks for a follow-up appointment, review or clinic slot to be booked',
  'chase-outstanding-result': 'the text asks for a result, report or investigation outcome to be chased or awaited',
  'arrange-blood-test': 'the text asks for bloods, a specific panel, or venepuncture to be arranged',
  'medication-review': 'the text asks for medication to be reviewed, reconciled or checked',
  'refer-to-specialist': 'the text asks for a referral to another service or specialty',
  'arrange-home-visit': 'the text asks for a visit to the patient at home',
  'contact-patient': 'the text asks for the patient or their carer to be contacted, called or written to',
  'review-correspondence': 'the text asks for this letter, handover or document to be read, actioned or filed',
  'monitor-observation': 'the text asks for an observation or measurement to be repeated or monitored',
  'update-care-plan': 'the text asks for a care plan, safety plan or record to be updated',
  'confirm-follow-up-arrangements': 'the text says follow-up arrangements still need confirming by someone',
  'arrange-post-discharge-monitoring': 'the text asks for monitoring to be set up after discharge',
}

export const EXTRACTION_SYSTEM_PROMPT = [
  'You extract already-written instructions from clinical free text in a synthetic simulation. You are not a clinician and you make no clinical decisions.',
  '',
  'You will be given numbered spans of text taken verbatim from one record. Return one candidate for each piece of follow-up work the text explicitly states. Return an empty list when the text states none.',
  '',
  'Absolute rules:',
  '1. Extract only what the text says. If a clinician did not write it down, it does not exist. Never add work that a reader might think is a good idea.',
  '2. `quote` must be a contiguous substring of the span text, copied character for character, including its original spelling, punctuation and capitalisation. Do not tidy it, translate it, join two separate sentences, or paraphrase it. A candidate whose quote is not found in the source text is discarded.',
  '3. `tag` must be one of the listed tags. There is no other option, and there is no "other". If the text states work that fits none of them, omit that candidate entirely rather than forcing it into the nearest tag.',
  '4. `field` must repeat the `field` label of the span you read, exactly as given.',
  '5. `timeframe` is non-null only when the text itself states an interval, such as "in 4 weeks" or "within 3 days". The deadline is computed elsewhere from the record\'s own timestamp. Never state or imply a date the text does not contain.',
  '6. Do not judge urgency, severity, priority or risk. Do not diagnose. Do not decide whether a value is normal or abnormal. Do not name a treatment the text does not name. There is no field for any of these, and inventing one in the summary is a failure.',
  '7. `summary` restates the instruction in a few plain words. It carries no information absent from the quote.',
  '',
  'Tags, and what each one means:',
  ...TASK_TAGS.map((tag) => `- ${tag}: ${TAG_GUIDE[tag]}`),
].join('\n')

/**
 * The record's spans, labelled so a candidate can name its source.
 *
 * Only text, field labels and the patient's synthetic ID are sent. No key, no
 * team credential, no wall-clock time, and no derived clinical value.
 */
export function buildExtractionUserMessage(spans: FreeTextSpan[]): string {
  const [first] = spans
  if (!first) return 'No text supplied.'

  const header = [
    `Synthetic patient: ${first.patientId}`,
    `Record: ${first.resourceId} version ${first.version} (${first.kind}) at site ${first.site}`,
    `Record title: ${first.title}`,
    '',
    'Spans:',
  ]

  const body = spans.map(
    (span) => `field: ${span.field}\ntext: """\n${span.text}\n"""`,
  )

  return [...header, body.join('\n\n')].join('\n')
}
