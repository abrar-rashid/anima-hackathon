// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CaseHeader } from '@/components/CaseHeader'
import {
  CAPTURED_AT,
  PATIENT_ID,
  PATIENT_NAME,
  RESULT_ID,
  RULE_TEXT,
  SIMULATOR_NOW,
  WORLD,
} from './fixtures'

const liveHeader = {
  patientName: PATIENT_NAME,
  patientId: PATIENT_ID,
  resultId: RESULT_ID,
  resultVersion: 1,
  classificationRuleText: RULE_TEXT,
  analyteName: 'C-reactive protein',
  value: 5.6,
  unit: 'mg/L',
  referenceLow: 0,
  referenceHigh: 5,
  direction: 'above' as const,
  orderingTeamId: 'hospital',
  currentAccountableOwner: 'hospital',
  requestedReceiver: 'gp',
  acceptingActorName: null as string | null,
  simulatorNow: SIMULATOR_NOW,
  protocolId: 'v3',
  connectionLive: true,
  replay: null as null | { label: 'Recorded simulator replay'; world: string; capturedAt: string },
}

afterEach(() => {
  cleanup()
})

describe('CaseHeader', () => {
  it('renders patient name and ID', () => {
    render(<CaseHeader {...liveHeader} />)
    expect(screen.getByRole('heading', { name: PATIENT_NAME })).toBeTruthy()
    expect(screen.getByText(PATIENT_ID)).toBeTruthy()
  })

  it('renders result ID and v<version>', () => {
    render(<CaseHeader {...liveHeader} />)
    expect(screen.getByText(RESULT_ID)).toBeTruthy()
    expect(screen.getByText('v1')).toBeTruthy()
  })

  it('renders the classification rule text verbatim', () => {
    render(<CaseHeader {...liveHeader} />)
    expect(screen.getByText(RULE_TEXT)).toBeTruthy()
  })

  it('renders the ordering team', () => {
    render(<CaseHeader {...liveHeader} />)
    expect(screen.getByText(/Ordering team/i)).toBeTruthy()
    expect(screen.getByText('hospital', { selector: '*' })).toBeTruthy()
  })

  it('always presents Current accountable owner: <team>', () => {
    render(<CaseHeader {...liveHeader} />)
    expect(screen.getByText('Current accountable owner: hospital')).toBeTruthy()
  })

  it('renders the requested receiver', () => {
    render(<CaseHeader {...liveHeader} />)
    expect(screen.getByText(/Requested receiver/i)).toBeTruthy()
    expect(screen.getByText('gp')).toBeTruthy()
  })

  it('renders simulator time', () => {
    render(<CaseHeader {...liveHeader} />)
    expect(screen.getByText(String(SIMULATOR_NOW))).toBeTruthy()
  })

  it('renders the protocol id', () => {
    render(<CaseHeader {...liveHeader} />)
    expect(screen.getByText('v3')).toBeTruthy()
  })

  it('renders Live connection state', () => {
    render(<CaseHeader {...liveHeader} />)
    expect(screen.getByText('Live')).toBeTruthy()
  })

  it('renders Recorded simulator replay · world · capturedAt', () => {
    render(
      <CaseHeader
        {...liveHeader}
        connectionLive={false}
        replay={{ label: 'Recorded simulator replay', world: WORLD, capturedAt: CAPTURED_AT }}
      />,
    )
    expect(screen.getByText(`Recorded simulator replay · ${WORLD} · ${CAPTURED_AT}`)).toBeTruthy()
  })
})
