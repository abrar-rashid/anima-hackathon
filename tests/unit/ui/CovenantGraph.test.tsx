// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CovenantGraph, type CovenantGraphTrack } from '@/components/CovenantGraph'
import { RESULT_ID } from './fixtures'

const tracks: CovenantGraphTrack[] = [
  {
    id: 'ownership',
    label: 'Ownership',
    nodes: [
      {
        id: 'ORDERER_OWNS',
        label: 'Orderer owns',
        icon: '●',
        active: true,
        source: {
          recordId: RESULT_ID,
          version: 1,
          actor: 'diagnostics',
          event: 'ResultAvailable',
        },
      },
      { id: 'TRANSFER_REQUESTED', label: 'Transfer requested', icon: '→', active: false },
      { id: 'ACCEPTED', label: 'Accepted owner', icon: '✓', active: false },
    ],
  },
  {
    id: 'care',
    label: 'Care',
    nodes: [
      { id: 'RESULT_AVAILABLE', label: 'Result available', icon: '●', active: true },
      { id: 'CLINICALLY_REVIEWED', label: 'Reviewed', icon: '▣', active: false },
      { id: 'PLAN_RECORDED', label: 'Plan recorded', icon: '✎', active: false },
      { id: 'PATIENT_INFORMED', label: 'Patient informed', icon: '✉', active: false },
      { id: 'ACTION_STARTED', label: 'Action started', icon: '▸', active: false },
      { id: 'OUTCOME_EVIDENCED', label: 'Outcome evidenced', icon: '✓', active: false },
      { id: 'CLOSED', label: 'Closed', icon: '■', active: false },
    ],
  },
]

afterEach(() => {
  cleanup()
})

describe('CovenantGraph', () => {
  it('renders two labelled tracks', () => {
    render(<CovenantGraph tracks={tracks} currentOwner="hospital" />)
    expect(screen.getByRole('region', { name: 'Ownership' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Care' })).toBeTruthy()
  })

  it('renders text and an icon for each node', () => {
    render(<CovenantGraph tracks={tracks} currentOwner="hospital" />)
    const ownership = screen.getByRole('region', { name: 'Ownership' })
    for (const label of ['Orderer owns', 'Transfer requested', 'Accepted owner']) {
      const button = within(ownership).getByRole('button', { name: new RegExp(label) })
      expect(button.textContent).toMatch(label)
      expect(button.querySelector('[aria-hidden="true"]')?.textContent?.trim()).toBeTruthy()
    }
  })

  it('marks the active node with aria-current="step"', () => {
    render(<CovenantGraph tracks={tracks} currentOwner="hospital" />)
    const active = screen.getByRole('button', { name: /Orderer owns/ })
    expect(active.getAttribute('aria-current')).toBe('step')
    expect(screen.getByRole('button', { name: /Transfer requested/ }).getAttribute('aria-current')).toBeNull()
  })

  it('shows source record id, version, actor and event when a node is selected', () => {
    render(<CovenantGraph tracks={tracks} currentOwner="hospital" />)
    fireEvent.click(screen.getByRole('button', { name: /Orderer owns/ }))
    const detail = screen.getByRole('region', { name: 'Selected node evidence' })
    expect(within(detail).getByText(RESULT_ID)).toBeTruthy()
    expect(within(detail).getByText('1')).toBeTruthy()
    expect(within(detail).getByText('diagnostics')).toBeTruthy()
    expect(within(detail).getByText('ResultAvailable')).toBeTruthy()
  })

  it('keeps Current accountable owner visible on the graph', () => {
    render(<CovenantGraph tracks={tracks} currentOwner="hospital" />)
    expect(screen.getByText('Current accountable owner: hospital')).toBeTruthy()
  })
})
