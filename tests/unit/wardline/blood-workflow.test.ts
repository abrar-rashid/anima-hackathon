import { describe, expect, it } from 'vitest'
import type { SimResource } from '@/ctl/contracts'
import {
  buildBloodWorkflows,
  congregateByPatient,
  latestBloodWorkflows,
  selectBloodWorkflows,
} from '@/components/wardline/blood-workflow'

const PANEL_NAMES: Record<string, string> = {
  crp: 'C-reactive protein (CRP)',
  fbc: 'Full blood count (FBC)',
}

function blood(
  id: string,
  collectedAt: number,
  createdAt: number,
  panelId = 'crp',
  analytes: string[] = [],
): SimResource {
  const panelName = PANEL_NAMES[panelId] ?? panelId
  return {
    id,
    kind: 'report',
    title: `${panelName} · synthetic blood results`,
    status: 'available',
    version: 1,
    visibleTo: ['diagnostics', 'gp'],
    data: {
      kind: 'blood-result',
      panel: { id: panelId, name: panelName },
      laboratory: 'Northbank training laboratory',
      collectedAt,
      analytes: analytes.map((name) => ({ id: name, name, unit: '', value: 0 })),
    },
    site: 'diagnostics',
    patientId: 'SIM-000001',
    createdAt,
    provenance: {
      created: {
        time: createdAt,
        action: 'seed_blood_results',
        source: 'diagnostics',
        version: 1,
        actor: { kind: 'simulation', name: 'Dr Robin Vial' },
      },
      changes: [],
    },
  }
}

describe('buildBloodWorkflows', () => {
  it('uses collectedAt and result-recorded time, and measures the gap', () => {
    const [workflow] = buildBloodWorkflows([blood('blood-v1-SIM-000001-crp-5', 1_000, 3_600_000 + 1_000)])
    expect(workflow?.steps.map((step) => step.label)).toEqual(['Sample collected', 'Blood results'])
    expect(workflow?.gaps).toHaveLength(1)
    expect(workflow?.gaps[0]?.elapsedMs).toBe(3_600_000)
    expect(workflow?.gaps[0]?.label).toBe('Transport & processing latency')
    expect(workflow?.steps[0]?.tone).toBe('doctors')
  })

  it('does not invent steps that the record did not timestamp', () => {
    const [workflow] = buildBloodWorkflows([blood('blood-v1-SIM-000001-crp-5', 1_000, 2_000)])
    expect(workflow?.steps).toHaveLength(2)
    expect(workflow?.steps.some((step) => /antibiotic|prescrib|administ/i.test(step.label))).toBe(false)
  })

  it('keeps only the newest draw per panel', () => {
    const latest = latestBloodWorkflows(
      buildBloodWorkflows([
        blood('blood-v1-SIM-000001-crp-0', 1_000, 2_000),
        blood('blood-v1-SIM-000001-crp-5', 9_000, 10_000),
      ]),
    )
    expect(latest.map((row) => row.resourceId)).toEqual(['blood-v1-SIM-000001-crp-5'])
  })

  it('plots extra sourced *At fields without inventing missing ones', () => {
    const [workflow] = buildBloodWorkflows([
      {
        ...blood('blood-v1-SIM-000001-crp-5', 2_000, 3_000),
        data: {
          kind: 'blood-result',
          panel: { id: 'crp', name: 'C-reactive protein (CRP)' },
          laboratory: 'Northbank training laboratory',
          requestedAt: 500,
          collectedAt: 2_000,
          reviewedAt: 8_000,
          analytes: [],
        },
      },
    ])
    expect(workflow?.steps.map((step) => step.label)).toEqual([
      'Requested',
      'Sample collected',
      'Blood results',
      'Result reviewed',
    ])
    expect(workflow?.gaps.map((gap) => gap.elapsedMs)).toEqual([1_500, 1_000, 5_000])
    expect(workflow?.gaps.map((gap) => gap.label)).toEqual([
      'Sample collection latency',
      'Transport & processing latency',
      'Review latency',
    ])
  })

  it('dedupes the same blood result seen on two sites', () => {
    const first = blood('blood-v1-SIM-000001-crp-5', 1_000, 2_000)
    const second = { ...first, site: 'gp' as const }
    expect(buildBloodWorkflows([first, second])).toHaveLength(1)
  })

  it('folds panels and analytes that share a time into one patient timeline', () => {
    const [workflow] = congregateByPatient(
      buildBloodWorkflows([
        blood('blood-v1-SIM-000001-crp-5', 1_000, 3_601_000, 'crp', ['C-reactive protein']),
        blood('blood-v1-SIM-000001-fbc-5', 1_000, 3_601_000, 'fbc', ['Haemoglobin', 'Platelets']),
      ]),
    )
    expect(workflow?.resourceId).toBe('blood:SIM-000001')
    expect(workflow?.steps.map((step) => step.label)).toEqual(['Sample collected', 'Blood results'])
    expect(workflow?.gaps[0]?.elapsedMs).toBe(3_600_000)
    expect(workflow?.panels).toEqual(['C-reactive protein (CRP)', 'Full blood count (FBC)'])
    expect(workflow?.analytes).toEqual(['C-reactive protein', 'Haemoglobin', 'Platelets'])
  })

  it('selects one congregated timeline per patient from the latest draw', () => {
    const rows = selectBloodWorkflows(
      buildBloodWorkflows([
        blood('blood-v1-SIM-000001-crp-0', 1_000, 2_000, 'crp'),
        blood('blood-v1-SIM-000001-crp-5', 9_000, 10_000, 'crp'),
        blood('blood-v1-SIM-000001-fbc-5', 9_000, 10_000, 'fbc'),
      ]),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.memberIds).toEqual(['blood-v1-SIM-000001-crp-5', 'blood-v1-SIM-000001-fbc-5'])
    expect(rows[0]?.steps).toHaveLength(2)
  })

  it('skips non-blood reports', () => {
    expect(
      buildBloodWorkflows([
        {
          id: 'r-9',
          kind: 'report',
          title: 'Imaging',
          status: 'available',
          version: 1,
          visibleTo: ['diagnostics'],
          data: { text: 'not blood' },
          site: 'diagnostics',
          provenance: { changes: [] },
        },
      ]),
    ).toEqual([])
  })
})
