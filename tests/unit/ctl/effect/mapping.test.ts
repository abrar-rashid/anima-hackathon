import { describe, expect, it } from 'vitest'
import openapi from '../../../fixtures/live/openapi.json'
import type { DetectorId, Finding, SimResource } from '@/ctl/contracts'
import { parseLiveActionSchema } from '@/ctl/effect/action-schema'
import { DETECTOR_ACTIONS, proposeForFinding, type ProposeContext } from '@/ctl/effect/mapping'

const schema = parseLiveActionSchema(openapi)!

function handover(overrides: Partial<SimResource> = {}): SimResource {
  return {
    id: 'discharge-summary-example',
    kind: 'discharge-summary',
    title: 'Discharge summary \u00b7 monitoring handover',
    status: 'sent',
    version: 1,
    priority: 'routine',
    owner: 'hospital',
    visibleTo: ['hospital', 'gp'],
    site: 'gp',
    patientId: 'SIM-000001',
    createdAt: 1789200000000,
    data: { stage: 'sent' },
    provenance: { changes: [] },
    ...overrides,
  }
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'unprocessed-handover:discharge-summary-example',
    detector: 'unprocessed-handover',
    summary: 'Discharge summary sent to the practice has not been reviewed or filed.',
    patientId: 'SIM-000001',
    site: 'gp',
    owner: 'gp',
    priority: 'routine',
    status: 'sent',
    dueAt: 1789286400000,
    createdAt: 1789200000000,
    breach: 'breached',
    overdueMs: 3_600_000,
    citations: [{ resourceId: 'discharge-summary-example', version: 1, site: 'gp' }],
    ...overrides,
  }
}

function ctx(overrides: Partial<ProposeContext> = {}): ProposeContext {
  return {
    now: 1789290000000,
    team: 'team12',
    schema,
    source: handover(),
    requiresStaffIdentity: false,
    ...overrides,
  }
}

describe('detector to action mapping', () => {
  it('maps an unprocessed handover onto a document review at the record’s current version', () => {
    const proposal = proposeForFinding(finding(), ctx())

    expect(proposal.actionType).toBe('process_document')
    expect(proposal.payload).toMatchObject({
      type: 'process_document',
      resourceId: 'discharge-summary-example',
      documentCommand: 'review',
      expectedVersion: 1,
      patientId: 'SIM-000001',
    })
    expect(proposal.hardStops).toEqual([])
    expect(proposal.supported).toBe(true)
  })

  it('maps an unaccepted referral onto accept, with optimistic concurrency', () => {
    const referral = handover({ id: 'r-40', kind: 'referral', status: 'open', version: 4, site: 'referrals' })
    const proposal = proposeForFinding(
      finding({
        detector: 'unaccepted-referral',
        site: 'referrals',
        citations: [{ resourceId: 'r-40', version: 4, site: 'referrals' }],
      }),
      ctx({ source: referral }),
    )

    expect(proposal.actionType).toBe('accept')
    expect(proposal.payload).toMatchObject({ resourceId: 'r-40', expectedVersion: 4 })
  })

  it('raises a chase task rather than recording unfinished work as complete', () => {
    for (const detector of [
      'overdue-task',
      'awaiting-result',
      'undispensed-prescription',
      'unanswered-request',
      'stalled-loop',
    ] as DetectorId[]) {
      const proposal = proposeForFinding(finding({ detector }), ctx())
      expect(proposal.actionType, detector).toBe('create_task')
      expect(Object.keys(proposal.payload), detector).not.toContain('expectedVersion')
    }
  })

  it('never proposes an action the live schema does not expose', () => {
    for (const mapping of Object.values(DETECTOR_ACTIONS)) {
      expect(schema.actionTypes).toContain(mapping.actionType)
    }
  })

  it('marks a proposal unsupported when the live schema could not be read', () => {
    const proposal = proposeForFinding(finding(), ctx({ schema: null }))

    expect(proposal.supported).toBe(false)
    expect(proposal.hardStops).toContain('unsupported-action')
  })
})

describe('what the payload is allowed to contain', () => {
  it('sets no priority field: the write schema has none and we would not fill it', () => {
    const proposal = proposeForFinding(finding({ detector: 'overdue-task' }), ctx())

    expect(proposal.payload).not.toHaveProperty('priority')
    expect(Object.keys(proposal.payload).every((key) => schema.fields.includes(key))).toBe(true)
  })

  it('builds the chase title from the record’s own title', () => {
    const proposal = proposeForFinding(finding({ detector: 'overdue-task' }), ctx())

    expect(proposal.payload.title).toBe(
      'Chase unclosed work: Discharge summary \u00b7 monitoring handover',
    )
  })

  it('writes only facts: the detector, the source, the source priority, and the arithmetic', () => {
    const text = String(proposeForFinding(finding({ detector: 'overdue-task' }), ctx()).payload.text)

    expect(text).toContain('detector overdue-task')
    expect(text).toContain('gp/discharge-summary-example v1')
    expect(text).toContain('Source-supplied priority: routine')
    expect(text).toContain('Past that deadline by 60 minutes at simulator time 1789290000000')
    expect(text).toContain('Synthetic simulation record')
  })

  it('says a priority is absent rather than choosing one', () => {
    const text = String(
      proposeForFinding(finding({ detector: 'overdue-task', priority: undefined }), ctx()).payload
        .text,
    )
    expect(text).toContain('No priority supplied by source.')
  })

  it('routes a chase task to the accountable owner only when that owner is a real site', () => {
    expect(proposeForFinding(finding({ detector: 'overdue-task', owner: 'gp' }), ctx()).payload.target).toBe('gp')
    expect(
      proposeForFinding(finding({ detector: 'overdue-task', owner: 'gp-duty' }), ctx()).payload,
    ).not.toHaveProperty('target')
  })

  it('keeps every string inside the limits the live schema sets', () => {
    const long = 'x'.repeat(900)
    const proposal = proposeForFinding(
      finding({ detector: 'overdue-task' }),
      ctx({ source: handover({ title: long }) }),
    )
    expect(String(proposal.payload.title).length).toBeLessThanOrEqual(500)
  })
})

describe('citations, versions and the idempotency key', () => {
  it('carries the finding’s citations and the versions they name', () => {
    const proposal = proposeForFinding(finding(), ctx())

    expect(proposal.citations).toEqual(finding().citations)
    expect(proposal.sourceVersions).toEqual([{ id: 'discharge-summary-example', version: 1 }])
  })

  it('is deterministic for the same finding, source and rules', () => {
    expect(proposeForFinding(finding(), ctx()).idempotencyKey).toBe(
      proposeForFinding(finding(), ctx()).idempotencyKey,
    )
  })

  it('changes when the source version, the action or the destination changes', () => {
    const baseline = proposeForFinding(finding(), ctx()).idempotencyKey

    expect(proposeForFinding(finding(), ctx({ source: handover({ version: 2 }) })).idempotencyKey).not.toBe(
      baseline,
    )
    expect(proposeForFinding(finding({ detector: 'overdue-task' }), ctx()).idempotencyKey).not.toBe(
      baseline,
    )
    expect(proposeForFinding(finding(), ctx({ team: 'team13' })).idempotencyKey).not.toBe(baseline)
  })

  it('explains itself in words, citing the source and the choice of action', () => {
    const proposal = proposeForFinding(finding(), ctx())

    expect(proposal.rationale).toContain('unprocessed-handover fired on discharge-summary-example v1')
    expect(proposal.rationale).toContain('reviewing it is the recorded next step')
  })

  it('reports source-absent when the cited record could not be read', () => {
    const proposal = proposeForFinding(finding(), ctx({ source: undefined }))
    expect(proposal.hardStops).toContain('source-absent')
  })
})
