import { describe, it, expect } from 'vitest'
import {
  classify,
  deriveOrderingTeam,
  ELIGIBILITY_RULE_TEXT,
  selectEligible,
  type BloodReportRecord,
} from '@/domain/eligibility'

const hero: BloodReportRecord = {
  id: 'blood-v1-SIM-000001-crp-5',
  version: 1,
  patientId: 'SIM-000001',
  visibleTo: ['gp', 'hospital', 'diagnostics'],
  owner: 'diagnostics',
  status: 'available',
  collectedAt: 1789113600000,
  analytes: [
    {
      id: 'crp',
      name: 'C-reactive protein',
      unit: 'mg/L',
      value: 5.6,
      referenceLow: 0,
      referenceHigh: 5,
    },
  ],
}

const inRange: BloodReportRecord = {
  ...hero,
  id: 'blood-v1-SIM-000001-na-1',
  collectedAt: 1789200000000,
  analytes: [
    {
      id: 'na',
      name: 'Sodium',
      unit: 'mmol/L',
      value: 140,
      referenceLow: 135,
      referenceHigh: 145,
    },
  ],
}

const olderOther: BloodReportRecord = {
  ...hero,
  id: 'blood-v1-SIM-000002-crp-1',
  patientId: 'SIM-000002',
  collectedAt: 1789000000000,
  analytes: [
    {
      id: 'crp',
      name: 'C-reactive protein',
      unit: 'mg/L',
      value: 12,
      referenceLow: 0,
      referenceHigh: 5,
    },
  ],
}

const newerOther: BloodReportRecord = {
  ...olderOther,
  id: 'blood-v1-SIM-000003-crp-1',
  patientId: 'SIM-000003',
  collectedAt: 1789300000000,
}

describe('eligibility', () => {
  it('ELIGIBILITY_RULE_TEXT is the displayed deterministic rule', () => {
    expect(ELIGIBILITY_RULE_TEXT).toBe(
      'An analyte value lies outside the reference range supplied by the source laboratory (referenceLow..referenceHigh). No urgency, diagnosis or treatment is inferred.',
    )
  })

  it('classify returns the first out-of-range analyte in array order', () => {
    const mixed: BloodReportRecord = {
      ...hero,
      analytes: [
        {
          id: 'na',
          name: 'Sodium',
          unit: 'mmol/L',
          value: 140,
          referenceLow: 135,
          referenceHigh: 145,
        },
        {
          id: 'crp',
          name: 'C-reactive protein',
          unit: 'mg/L',
          value: 5.6,
          referenceLow: 0,
          referenceHigh: 5,
        },
        {
          id: 'wcc',
          name: 'White cell count',
          unit: '10^9/L',
          value: 2.1,
          referenceLow: 4,
          referenceHigh: 11,
        },
      ],
    }
    expect(classify(mixed)).toEqual({
      rule: 'source-reference-range',
      ruleText: ELIGIBILITY_RULE_TEXT,
      analyteId: 'crp',
      analyteName: 'C-reactive protein',
      value: 5.6,
      unit: 'mg/L',
      referenceLow: 0,
      referenceHigh: 5,
      direction: 'above',
    })
    expect(classify(inRange)).toBeNull()
  })

  it('classify uses below when value is under referenceLow', () => {
    const low: BloodReportRecord = {
      ...hero,
      analytes: [
        {
          id: 'wcc',
          name: 'White cell count',
          unit: '10^9/L',
          value: 2.1,
          referenceLow: 4,
          referenceHigh: 11,
        },
      ],
    }
    expect(classify(low)?.direction).toBe('below')
  })

  it('selectEligible prefers preferPatientId when that patient is eligible', () => {
    const picked = selectEligible([newerOther, olderOther, hero], {
      preferPatientId: 'SIM-000001',
    })
    expect(picked?.report.id).toBe('blood-v1-SIM-000001-crp-5')
    expect(picked?.classification.analyteId).toBe('crp')
  })

  it('selectEligible otherwise picks most recent collectedAt then id asc', () => {
    const sameTimeA: BloodReportRecord = {
      ...newerOther,
      id: 'blood-z-later-id',
      collectedAt: 1789300000000,
    }
    const sameTimeB: BloodReportRecord = {
      ...newerOther,
      id: 'blood-a-earlier-id',
      collectedAt: 1789300000000,
      patientId: 'SIM-000004',
    }
    const picked = selectEligible([olderOther, sameTimeA, sameTimeB], {})
    expect(picked?.report.id).toBe('blood-a-earlier-id')
  })

  it('selectEligible skips completed result ids and withdrawn or cancelled status', () => {
    const withdrawn: BloodReportRecord = { ...hero, status: 'withdrawn' }
    const cancelled: BloodReportRecord = { ...newerOther, status: 'cancelled' }
    expect(selectEligible([withdrawn, cancelled], {})).toBeNull()
    expect(
      selectEligible([hero, newerOther], {
        existingCompleteCaseResultIds: ['blood-v1-SIM-000001-crp-5'],
      })?.report.id,
    ).toBe(newerOther.id)
  })

  it('selectEligible treats non-available simulator status as eligible unless withdrawn or cancelled', () => {
    const reported: BloodReportRecord = { ...hero, status: 'reported' }
    expect(selectEligible([reported], {})?.report.id).toBe(hero.id)
  })

  it('selectEligible requires visibleTo to include at least two of gp/hospital', () => {
    const gpOnly: BloodReportRecord = { ...hero, visibleTo: ['gp', 'diagnostics'] }
    expect(selectEligible([gpOnly], {})).toBeNull()
  })

  it('deriveOrderingTeam returns hospital-orders / gp-receives when a discharge summary is present', () => {
    const withDischarge = deriveOrderingTeam({
      visibleTo: ['gp', 'hospital', 'diagnostics'],
      hasHospitalDischargeSummary: true,
    })
    expect(withDischarge.orderingTeamId).toBe('hospital')
    expect(withDischarge.requestedReceiver).toBe('gp')
    expect(withDischarge.ruleText.length).toBeGreaterThan(0)

    const without = deriveOrderingTeam({
      visibleTo: ['gp', 'hospital'],
      hasHospitalDischargeSummary: false,
    })
    expect(without.orderingTeamId).toBe('gp')
    expect(without.requestedReceiver).toBe('hospital')
  })
})
