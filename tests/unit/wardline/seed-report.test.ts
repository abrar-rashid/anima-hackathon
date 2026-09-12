import { describe, expect, it } from 'vitest'
import { buildSeedReportWorkflows } from '@/components/wardline/seed-report'

describe('buildSeedReportWorkflows', () => {
  it('builds authored blood and CT tracks from the checked-in seed report', () => {
    const workflows = buildSeedReportWorkflows()
    expect(workflows.map((row) => row.resourceId).sort()).toEqual(['r-7158', 'r-7182'])

    const blood = workflows.find((row) => row.resourceId === 'r-7158')
    expect(blood?.patientId).toBe('SIM-000006')
    expect(blood?.panelName).toBe('FBC, U&E and CRP')
    expect(blood?.origin).toBe('retrospective-seed')
    expect(blood?.steps[0]).toMatchObject({ label: 'Requested', field: 'clinical_event_at' })
    expect(blood?.steps).toHaveLength(12)
    expect(blood?.gaps[0]?.elapsedMs).toBe(5 * 60 * 1000)

    const ct = workflows.find((row) => row.resourceId === 'r-7182')
    expect(ct?.panelName).toBe('CT chest without intravenous contrast')
    expect(ct?.steps).toHaveLength(11)
    expect(ct?.steps.at(-1)?.label).toBe('Follow up assigned')
  })
})
