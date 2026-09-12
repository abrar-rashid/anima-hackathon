// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EvidencePane } from '@/components/EvidencePane'
import { RESULT_ID, RULE_TEXT } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('EvidencePane', () => {
  it('shows the source excerpt without inferring clinical meaning', () => {
    render(
      <EvidencePane
        analyteName="C-reactive protein"
        value={5.6}
        unit="mg/L"
        referenceLow={0}
        referenceHigh={5}
        direction="above"
        ruleText={RULE_TEXT}
        resultId={RESULT_ID}
        resultVersion={1}
        visibility={['gp', 'hospital', 'diagnostics']}
        citations={[
          {
            site: 'diagnostics',
            resourceId: RESULT_ID,
            resourceVersion: 1,
            observedAtSimulatorTime: 1_789_117_200_000,
            eventType: 'ResultAvailable',
          },
        ]}
        missingEvidence={['clinical review']}
        conflicts={[]}
        existingTasks={[]}
      />,
    )
    expect(screen.getByText(/C-reactive protein/)).toBeTruthy()
    expect(screen.getByText(/5\.6/)).toBeTruthy()
    expect(screen.getByText(/above the reference range supplied by the source/)).toBeTruthy()
    expect(screen.getByText(RULE_TEXT)).toBeTruthy()
    expect(screen.getByText(RESULT_ID)).toBeTruthy()
    expect(screen.queryByText(/this result is urgent|recommended treatment/i)).toBeNull()
  })
})
