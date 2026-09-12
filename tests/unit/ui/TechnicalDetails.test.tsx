// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TechnicalDetails } from '@/components/TechnicalDetails'
import { CASE_ID, RESULT_ID } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('TechnicalDetails', () => {
  it('exposes IDs, versions and Activity links in a disclosure', () => {
    render(
      <TechnicalDetails
        caseId={CASE_ID}
        resultId={RESULT_ID}
        resultVersion={1}
        activityLinks={[{ activityId: 'act-1', label: 'create_task provenance' }]}
        payload={{ type: 'create_task', patientId: 'SIM-000001' }}
      />,
    )
    const details = screen.getByText('Technical details').closest('details')
    expect(details).toBeTruthy()
    const region = details as HTMLElement
    expect(within(region).getByText(CASE_ID)).toBeTruthy()
    expect(within(region).getByText(RESULT_ID)).toBeTruthy()
    expect(within(region).getByText('act-1')).toBeTruthy()
    expect(within(region).getAllByText(/create_task/).length).toBeGreaterThan(0)
  })

  it('renders the Activity actor and time so a receipt can be matched to the audit record', () => {
    render(
      <TechnicalDetails
        caseId={CASE_ID}
        resultId={RESULT_ID}
        resultVersion={1}
        activityLinks={[{ activityId: 'act-1', label: 'create_task provenance' }]}
        activityActor="execution"
        activityTime={1_789_286_400_000}
      />,
    )
    const details = screen.getByText('Technical details').closest('details') as HTMLElement
    expect(within(details).getByText('execution')).toBeTruthy()
    expect(within(details).getByText('1789286400000')).toBeTruthy()
  })
})
