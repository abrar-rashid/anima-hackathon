// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandCockpit, type CockpitData } from '@/components/cockpit/CommandCockpit'

afterEach(() => {
  cleanup()
})

function fixture(overrides: Partial<CockpitData> = {}): CockpitData {
  return {
    patient: {
      id: 'SIM-000001',
      name: 'Amira Khan',
      age: 74,
      problems: [
        { term: 'CKD Stage 3', code: 'SIM-PROBLEM-2', status: 'active', date: '2026-05-15' },
        { term: 'Heart failure', code: 'SIM-PROBLEM-1', status: 'resolved', date: '2026-08-13' },
      ],
      recentLab: { name: 'CRP', value: 5.6, unit: 'mg/L', refLow: 0, refHigh: 5, isAbnormal: true },
      observations: [],
    },
    tasks: [
      {
        task_id: 'TASK-CRP-TRANSFER',
        episode_id: 'EP-SIM-000001-01',
        timestamp: '2026-09-12T08:00:00.000Z',
        title: 'Acknowledge CRP Handover',
        status: 'OPEN',
        owner: 'St. Jude Hospital Acute Team',
        note: 'CRP exceeds source reference range.',
        deadline: '2026-09-12T09:00:00.000Z',
        clinical_priority: 'urgent',
        snomed_id: 'not-supplied-by-source',
        performed_by: 'Unassigned',
        requested_id: 'Dr Morgan Bell (Hospital)',
      },
      {
        task_id: 'TASK-MED-REVIEW',
        episode_id: 'EP-SIM-000001-01',
        timestamp: '2026-09-12T07:00:00.000Z',
        title: '4-Week Kidney Function Review',
        status: 'PENDING_LABS',
        owner: 'High St GP Surgery',
        note: 'Extracted from discharge summary.',
        deadline: '2026-10-10T09:00:00.000Z',
        clinical_priority: 'standard',
        snomed_id: 'not-supplied-by-source',
        performed_by: 'Unassigned',
        requested_id: 'Ward 4 Senior Registrar',
      },
    ],
    caseSnapshot: {
      case: {
        caseId: 'case-SIM-000001',
        ownershipState: 'ORDERER_OWNS',
        closureState: 'RESULT_AVAILABLE',
        currentAccountableOwner: { teamId: 'hospital' },
        requestedReceiver: 'gp',
      },
      proposal: { actions: [] },
      connection: { world: 'team-test', simulatorNow: Date.parse('2026-09-12T08:30:00.000Z'), live: false },
    },
    clock: { now: Date.parse('2026-09-12T08:30:00.000Z'), paused: true, speed: 0 },
    ...overrides,
  }
}

describe('CommandCockpit', () => {
  it('renders the patient ribbon, unclosed banner, ledger, and ADK panel', () => {
    render(<CommandCockpit data={fixture()} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Amira Khan' })).toBeTruthy()
    expect(screen.getByText('SIM-000001')).toBeTruthy()
    expect(screen.getByText('#942 104 8821')).toBeTruthy()
    expect(screen.getByText('CKD Stage 3')).toBeTruthy()
    expect(screen.getByText(/Unclosed clinical task detected/i)).toBeTruthy()
    expect(screen.getByText(/An analyte value lies outside source reference range/i)).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Team 12 task ledger/i })).toBeTruthy()
    expect(screen.getByText('EP-SIM-000001-01')).toBeTruthy()
    expect(screen.getByText('Acknowledge CRP Handover')).toBeTruthy()
    expect(screen.getByText('@animahealth/adk')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Close The Loop \(Execute via Anima ADK\)/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Hospital requests/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Duty GP acknowledges/i })).toBeTruthy()
    expect(screen.getByLabelText('Live execution receipt')).toBeTruthy()
  })

  it('adds a clinician task to the current episode ledger', () => {
    render(<CommandCockpit data={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: /Add clinical task/i }))
    fireEvent.change(screen.getByPlaceholderText(/Confirm patient contact/i), {
      target: { value: 'Post-Discharge Monitoring' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add to ledger/i }))
    expect(screen.getByText('Post-Discharge Monitoring')).toBeTruthy()
  })

  it('filters the ledger and submits an ADK close action', async () => {
    const onExecuteAct = vi.fn().mockResolvedValue({
      ok: true,
      step: 'auto_close',
      message: 'Loop closed',
      receipts: [{ actionIndex: 0, status: 'VISIBLE_DOWNSTREAM', resourceId: 'task-1', activityId: 'act-1' }],
    })
    render(<CommandCockpit data={fixture()} onExecuteAct={onExecuteAct} />)

    fireEvent.click(screen.getByRole('button', { name: 'Urgent' }))
    expect(screen.getByText('Acknowledge CRP Handover')).toBeTruthy()
    expect(screen.queryByText('4-Week Kidney Function Review')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Close The Loop/i }))
    expect(onExecuteAct).toHaveBeenCalledWith('auto_close')
  })
})
