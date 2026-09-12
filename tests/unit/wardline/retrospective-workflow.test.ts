import { describe, expect, it } from 'vitest'
import { buildRetrospectiveWorkflows } from '@/components/wardline/blood-workflow'
import { RETROSPECTIVE_MARKER, retrospectiveEvent } from '@/ctl/normalise/retrospective'
import type { SimResource } from '@/ctl/contracts'

function note(opts: {
  id: string
  stage: string
  investigation: string
  requestId: string
  at: string
  role?: string
}): SimResource {
  const meta = {
    patient_id: 'SIM-000006',
    investigation: opts.investigation,
    stage: opts.stage,
    clinical_event_at: opts.at,
    request_resource_id: opts.requestId,
    evidence_kind: 'retrospective-narrative',
    pathway_state: 'completed',
    responsible_role: opts.role ?? 'Ordering GP',
  }
  return {
    id: opts.id,
    patientId: 'SIM-000006',
    kind: 'consultation',
    title: opts.stage,
    status: 'saved',
    version: 1,
    site: 'gp',
    visibleTo: ['gp'],
    data: { text: `${RETROSPECTIVE_MARKER}\n${JSON.stringify(meta)}\n\nAuthored note.` },
    provenance: { changes: [] },
  }
}

describe('retrospectiveEvent', () => {
  it('returns the investigation key and request id from the envelope', () => {
    const event = retrospectiveEvent(
      note({
        id: 'r-7164',
        stage: 'collected',
        investigation: 'ML-SEED-SIM-000006-BLOOD-v1',
        requestId: 'r-7158',
        at: '2026-09-02T09:10:00+00:00',
      }),
    )
    expect(event).toMatchObject({
      stage: 'collected',
      investigation: 'ML-SEED-SIM-000006-BLOOD-v1',
      requestResourceId: 'r-7158',
      role: 'Ordering GP',
      completed: true,
    })
    expect(event?.time).toBe(Date.parse('2026-09-02T09:10:00+00:00'))
  })
})

describe('buildRetrospectiveWorkflows', () => {
  it('groups seed notes by request into one blood track and one CT track', () => {
    const workflows = buildRetrospectiveWorkflows([
      note({
        id: 'r-7158',
        stage: 'requested',
        investigation: 'ML-SEED-SIM-000006-BLOOD-v1',
        requestId: 'r-7158',
        at: '2026-09-01T09:20:00+00:00',
      }),
      note({
        id: 'r-7164',
        stage: 'collected',
        investigation: 'ML-SEED-SIM-000006-BLOOD-v1',
        requestId: 'r-7158',
        at: '2026-09-02T09:10:00+00:00',
        role: 'Practice phlebotomist',
      }),
      note({
        id: 'r-7182',
        stage: 'requested',
        investigation: 'ML-SEED-SIM-000006-CT-v1',
        requestId: 'r-7182',
        at: '2026-09-01T09:35:00+00:00',
        role: 'Referring GP',
      }),
    ])

    expect(workflows.map((row) => row.resourceId).sort()).toEqual(['r-7158', 'r-7182'])
    const blood = workflows.find((row) => row.resourceId === 'r-7158')
    expect(blood?.panelName).toBe('FBC, U&E and CRP')
    expect(blood?.steps.map((step) => step.label)).toEqual(['Requested', 'Collected'])
    expect(blood?.gaps).toHaveLength(1)
    expect(blood?.gaps[0]?.elapsedMs).toBe(
      Date.parse('2026-09-02T09:10:00+00:00') - Date.parse('2026-09-01T09:20:00+00:00'),
    )
    expect(blood?.origin).toBe('retrospective-seed')
  })

  it('ignores ordinary consultations without the seed envelope', () => {
    expect(
      buildRetrospectiveWorkflows([
        {
          id: 'r-9',
          kind: 'consultation',
          title: 'GP note',
          status: 'saved',
          version: 1,
          visibleTo: ['gp'],
          data: { text: 'Please book a follow-up.' },
          site: 'gp',
          patientId: 'SIM-000006',
          provenance: { changes: [] },
        },
      ]),
    ).toEqual([])
  })
})
