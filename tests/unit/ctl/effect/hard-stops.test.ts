import { describe, expect, it } from 'vitest'
import openapi from '../../../fixtures/live/openapi.json'
import type { SimResource } from '@/ctl/contracts'
import { parseLiveActionSchema } from '@/ctl/effect/action-schema'
import { evaluateHardStops, payloadFingerprint, type HardStopInput } from '@/ctl/effect/hard-stops'

const schema = parseLiveActionSchema(openapi)!

function handover(overrides: Partial<SimResource> = {}): SimResource {
  return {
    id: 'discharge-summary-example',
    kind: 'discharge-summary',
    title: 'Discharge summary \u00b7 monitoring handover',
    status: 'sent',
    version: 1,
    visibleTo: ['hospital', 'gp'],
    site: 'gp',
    patientId: 'SIM-000001',
    owner: 'hospital',
    createdAt: 1789200000000,
    data: { stage: 'sent' },
    provenance: { changes: [] },
    ...overrides,
  }
}

/** A proposal that is fully clear: every stop below is one deviation from this. */
function clean(overrides: Partial<HardStopInput> = {}): HardStopInput {
  return {
    actionType: 'process_document',
    site: 'gp',
    payload: {
      type: 'process_document',
      resourceId: 'discharge-summary-example',
      documentCommand: 'review',
      expectedVersion: 1,
      patientId: 'SIM-000001',
    },
    findingPatientId: 'SIM-000001',
    source: handover(),
    sourceVersions: [{ id: 'discharge-summary-example', version: 1 }],
    schema,
    ...overrides,
  }
}

describe('a clear proposal', () => {
  it('produces no hard stops', () => {
    expect(evaluateHardStops(clean())).toEqual([])
  })
})

describe('each hard stop is produced by its triggering condition', () => {
  it('patient-mismatch: the payload names a different patient from the record', () => {
    const stops = evaluateHardStops(
      clean({ payload: { ...clean().payload, patientId: 'SIM-000009' } }),
    )
    expect(stops).toContain('patient-mismatch')
  })

  it('patient-mismatch: the finding names a different patient from the payload', () => {
    expect(evaluateHardStops(clean({ findingPatientId: 'SIM-000042' }))).toContain('patient-mismatch')
  })

  it('destination-mismatch: the destination cannot see the record', () => {
    const stops = evaluateHardStops(
      clean({ source: handover({ visibleTo: ['hospital'] }) }),
    )
    expect(stops).toContain('destination-mismatch')
  })

  it('destination-mismatch: the target is not a destination the live schema accepts', () => {
    const stops = evaluateHardStops(
      clean({
        actionType: 'create_task',
        payload: {
          type: 'create_task',
          patientId: 'SIM-000001',
          title: 'Chase unclosed work',
          target: 'st-judes',
        },
      }),
    )
    expect(stops).toContain('destination-mismatch')
  })

  it('missing-staff-identity: a clinical surface with no named approver', () => {
    expect(evaluateHardStops(clean({ requiresStaffIdentity: true }))).toContain(
      'missing-staff-identity',
    )
    expect(
      evaluateHardStops(
        clean({
          requiresStaffIdentity: true,
          staff: { id: 'staff-1', name: 'Dr Morgan Bell', role: 'gp' },
        }),
      ),
    ).not.toContain('missing-staff-identity')
  })

  it('source-absent: the record could not be read', () => {
    expect(evaluateHardStops(clean({ source: undefined }))).toContain('source-absent')
  })

  it('source-not-current: the record already records this processing', () => {
    const stops = evaluateHardStops(clean({ source: handover({ data: { stage: 'reviewed' } }) }))
    expect(stops).toContain('source-not-current')
  })

  it('source-not-current: provenance already shows the action was taken', () => {
    const stops = evaluateHardStops(
      clean({
        source: handover({
          provenance: {
            changes: [
              {
                time: 1789286400000,
                actor: { kind: 'team', name: 'team12' },
                action: 'review',
                source: 'gp',
                version: 2,
              },
            ],
          },
        }),
      }),
    )
    expect(stops).toContain('source-not-current')
  })

  it('source-not-current: the record has reached a terminal status', () => {
    expect(evaluateHardStops(clean({ source: handover({ status: 'filed' }) }))).toContain(
      'source-not-current',
    )
  })

  it('unsupported-action: the live schema does not expose the action type', () => {
    expect(evaluateHardStops(clean({ actionType: 'close_the_loop' }))).toContain(
      'unsupported-action',
    )
  })

  it('unsupported-action: the live schema could not be read, so support is unverified', () => {
    expect(evaluateHardStops(clean({ schema: null }))).toContain('unsupported-action')
  })

  it('unsupported-action: the payload carries a field the live schema does not expose', () => {
    const stops = evaluateHardStops(
      clean({ payload: { ...clean().payload, clinicalPriority: 'urgent' } }),
    )
    expect(stops).toContain('unsupported-action')
  })

  it('unsupported-action: the document command is not one the schema accepts', () => {
    const stops = evaluateHardStops(
      clean({ payload: { ...clean().payload, documentCommand: 'close' } }),
    )
    expect(stops).toContain('unsupported-action')
  })

  it('missing-required-field: a field the action needs is absent or blank', () => {
    const withoutVersion = { ...clean().payload }
    delete withoutVersion.expectedVersion
    expect(evaluateHardStops(clean({ payload: withoutVersion }))).toContain('missing-required-field')

    const blankTitle = evaluateHardStops(
      clean({
        actionType: 'create_task',
        payload: { type: 'create_task', patientId: 'SIM-000001', title: '   ' },
      }),
    )
    expect(blankTitle).toContain('missing-required-field')
  })

  it('idempotency-conflict: the key was already used for a different payload', () => {
    const input = clean({ idempotencyKey: 'team12|SIM-000001|r-1|1|v1|process_document|gp' })
    const stops = evaluateHardStops({
      ...input,
      usedIdempotencyKeys: { [input.idempotencyKey!]: 'a-different-payload' },
    })
    expect(stops).toContain('idempotency-conflict')
  })

  it('idempotency-conflict: not raised when the replay is the identical payload', () => {
    const input = clean({ idempotencyKey: 'team12|SIM-000001|r-1|1|v1|process_document|gp' })
    const stops = evaluateHardStops({
      ...input,
      usedIdempotencyKeys: { [input.idempotencyKey!]: payloadFingerprint(input.payload) },
    })
    expect(stops).not.toContain('idempotency-conflict')
  })

  it('stale-source-version: the record moved on after the proposal was built', () => {
    const stops = evaluateHardStops(clean({ source: handover({ version: 2 }) }))
    expect(stops).toContain('stale-source-version')
  })

  it('stale-source-version: expectedVersion no longer matches the live record', () => {
    const stops = evaluateHardStops(
      clean({
        source: handover({ version: 3 }),
        sourceVersions: [{ id: 'discharge-summary-example', version: 3 }],
      }),
    )
    expect(stops).toContain('stale-source-version')
  })

  it('requires-clinical-interpretation: ordering a test needs a panel and an urgency', () => {
    const stops = evaluateHardStops(
      clean({
        actionType: 'order_test',
        payload: {
          type: 'order_test',
          patientId: 'SIM-000001',
          title: 'Full blood count',
          bloodTestOrder: {
            panelId: 'fbc',
            panel: 'Full blood count',
            specimen: 'EDTA blood',
            priority: 'routine',
            collection: 'now',
            clinicalDetails: 'Follow-up request.',
          },
        },
      }),
    )
    expect(stops).toContain('requires-clinical-interpretation')
  })

  it('requires-clinical-interpretation: raised whenever a caller flags a field as a judgement', () => {
    expect(evaluateHardStops(clean({ requiresClinicalInterpretation: true }))).toContain(
      'requires-clinical-interpretation',
    )
  })
})

describe('payloadFingerprint', () => {
  it('ignores key order and sees through nesting', () => {
    expect(payloadFingerprint({ a: 1, b: { c: 2, d: [3, 4] } })).toBe(
      payloadFingerprint({ b: { d: [3, 4], c: 2 }, a: 1 }),
    )
  })

  it('changes when a nested value changes', () => {
    expect(payloadFingerprint({ a: { b: 1 } })).not.toBe(payloadFingerprint({ a: { b: 2 } }))
  })
})
