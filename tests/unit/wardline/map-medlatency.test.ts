import { describe, expect, it } from 'vitest'
import { mapMedlatencyPresentation } from '@/components/wardline/map-medlatency'

const packet = {
  overview: {
    patient: { id: 'DEMO-005', display_name: 'Casey Linden' },
    analysis_mode: 'fixture_replay',
    dataset: { label: 'AUTHORED COMPLETE-WORKFLOW FIXTURE — not observed in Anima' },
  },
  tasks: [
    {
      id: 'task_1',
      label: 'Obtain, review and communicate full blood count',
      family: 'diagnostic',
      responsible: 'GP',
      active: true,
      overdue: false,
      work_started: true,
      deadline: null,
      resolution: {
        fulfillment: 'fulfilled',
        lifecycle: 'active',
        assessment: 'evidenced',
        progress: 'requested / reviewed',
        next_step: 'No unresolved fulfillment criterion',
      },
      stages: [
        {
          stage: 'requested',
          assessment: 'evidenced',
          evidence: [
            {
              resource_id: 'test-request',
              snapshot_id: 'snap-1',
              pointer: '/data/text',
              quote: 'GP: obtain a full blood count.',
            },
          ],
        },
        {
          stage: 'reviewed',
          assessment: 'evidenced',
          evidence: [
            {
              resource_id: 'test-reviewed',
              snapshot_id: 'snap-2',
              pointer: '/data/text',
              quote: 'Result reviewed.',
            },
          ],
        },
      ],
      candidates: [],
      review_flags: [],
    },
  ],
  timeline: [
    {
      id: 'e1',
      resource_id: 'test-request',
      time: '2026-09-05T09:00:00Z',
      clock: 'simulation',
      kind: 'plan',
      label: 'Test Request',
      hidden_by_default: false,
    },
    {
      id: 'e2',
      resource_id: 'test-reviewed',
      time: '2026-09-05T11:00:00Z',
      clock: 'simulation',
      kind: 'plan',
      label: 'Test reviewed',
      hidden_by_default: false,
    },
  ],
}

describe('mapMedlatencyPresentation', () => {
  it('maps tasks and evidenced stages onto Wardline shapes', () => {
    const mapped = mapMedlatencyPresentation(packet)
    expect(mapped.validated).toBe(true)
    expect(mapped.analysisMode).toBe('fixture_replay')
    expect(mapped.tasks).toHaveLength(1)
    expect(mapped.tasks[0]).toMatchObject({
      id: 'task_1',
      title: 'Obtain, review and communicate full blood count',
      patientId: 'DEMO-005',
      patientName: 'Casey Linden',
      owner: 'GP',
      status: 'completed',
      detector: 'medlatency',
    })
    expect(mapped.tasks[0]?.citations[0]?.quote).toBe('GP: obtain a full blood count.')
    expect(mapped.workflows).toHaveLength(1)
    expect(mapped.workflows[0]?.steps.map((step) => step.label)).toEqual(['Requested', 'Reviewed'])
    expect(mapped.workflows[0]?.gaps[0]?.elapsedMs).toBe(2 * 60 * 60 * 1000)
    expect(mapped.workflows[0]?.origin).toBe('medlatency')
  })

  it('does not treat a failed or missing analysis as zero outstanding tasks', () => {
    const mapped = mapMedlatencyPresentation({
      overview: {
        patient: { id: 'SIM-000006', display_name: 'Eleanor Chen' },
        analysis_mode: 'not_analysed',
      },
      tasks: [],
    })
    expect(mapped.validated).toBe(false)
    expect(mapped.tasks).toEqual([])
    expect(mapped.workflows).toEqual([])
    expect(mapped.analysisMode).toBe('not_analysed')
  })
})
