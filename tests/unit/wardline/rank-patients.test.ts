import { describe, expect, it } from 'vitest'
import type { Finding, SimPatient } from '@/ctl/contracts'
import {
  FEATURED_PATIENT_IDS,
  operationalWeight,
  pinRankOf,
  rankPatients,
} from '@/components/wardline/rank-patients'

function patient(id: string, name: string, extras: Partial<SimPatient> = {}): SimPatient {
  return {
    id,
    name,
    conditions: extras.conditions ?? [],
    goals: extras.goals ?? [],
    needs: extras.needs ?? [],
    localIds: extras.localIds ?? {},
    ...extras,
  }
}

function finding(patientId: string, id = `f-${patientId}`): Finding {
  return {
    id,
    detector: 'unprocessed-handover',
    summary: 'Unfinished handover',
    patientId,
    site: 'hospital',
    status: 'open',
    breach: 'no-deadline',
    citations: [],
  }
}

describe('rankPatients', () => {
  it('pins Eleanor Chen (SIM-000006) first', () => {
    const ranked = rankPatients(
      [
        patient('SIM-000099', 'Zara Cole', { conditions: ['asthma'], needs: ['review'] }),
        patient('SIM-000001', 'Amira Khan'),
        patient('SIM-000006', 'Eleanor Chen'),
      ],
      [finding('SIM-000099'), finding('SIM-000099', 'f-2')],
    )
    expect(ranked[0]?.id).toBe('SIM-000006')
    expect(ranked[0]?.name).toBe('Eleanor Chen')
    expect(FEATURED_PATIENT_IDS[0]).toBe('SIM-000006')
    expect(pinRankOf('SIM-000006')).toBe(0)
  })

  it('keeps featured pins ahead of unpinned rows with more tasks', () => {
    const ranked = rankPatients(
      [patient('SIM-000080', 'Busy Person'), patient('SIM-000001', 'Amira Khan')],
      [finding('SIM-000080'), finding('SIM-000080', 'f-2'), finding('SIM-000080', 'f-3')],
    )
    expect(ranked.map((row) => row.id)).toEqual(['SIM-000001', 'SIM-000080'])
  })

  it('orders unpinned patients by linked tasks, then directory richness', () => {
    const ranked = rankPatients(
      [
        patient('SIM-000040', 'Lean Record'),
        patient('SIM-000041', 'Rich Record', {
          conditions: ['hf'],
          needs: ['home visit'],
          goals: ['stay home'],
          localIds: { gp: 'RIV-1' },
        }),
        patient('SIM-000042', 'Two Tasks'),
      ],
      [finding('SIM-000042'), finding('SIM-000042', 'f-b')],
    )
    expect(ranked.map((row) => row.id)).toEqual(['SIM-000042', 'SIM-000041', 'SIM-000040'])
    expect(ranked[1]?.operationalWeight).toBe(operationalWeight(ranked[1]!, 0))
  })

  it('dedupes by id', () => {
    const ranked = rankPatients(
      [patient('SIM-000006', 'Eleanor Chen'), patient('SIM-000006', 'Eleanor Chen')],
      [],
    )
    expect(ranked).toHaveLength(1)
  })
})
