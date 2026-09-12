// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DecisionBlock } from '@/design/patterns/decision-block'
import { EvidenceRow } from '@/design/patterns/evidence-row'
import { HeroFact } from '@/design/patterns/hero-fact'

afterEach(() => {
  cleanup()
})

describe('HeroFact', () => {
  it('makes the fact the heading and refuses an unverified proven state', () => {
    render(
      <HeroFact
        fact="hospital"
        meaning="Accountable now. Transfer is requested, not accepted."
        state="proven"
        verified={false}
        headingId="owner-fact"
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'hospital' })).toBeTruthy()
    expect(screen.getByText('Not verified by readback')).toBeTruthy()
    expect(screen.queryByText('Proven by readback')).toBeNull()
  })
})

describe('EvidenceRow', () => {
  it('labels id, version, actor and time', () => {
    render(
      <EvidenceRow
        id="blood-v1-SIM-000001-crp-5"
        version={1}
        actor="hospital"
        time="2026-09-12T12:12:40.886Z"
      />,
    )
    expect(screen.getByText('Id').tagName).toBe('DT')
    expect(screen.getByText('blood-v1-SIM-000001-crp-5')).toBeTruthy()
    expect(screen.getByText('v1')).toBeTruthy()
    expect(screen.getByText('hospital')).toBeTruthy()
    expect(document.querySelector('time')?.getAttribute('dateTime')).toBe('2026-09-12T12:12:40.886Z')
  })
})

describe('DecisionBlock', () => {
  it('keeps the reason visible when the action is unavailable', () => {
    const onAction = vi.fn()
    render(
      <DecisionBlock
        actionLabel="Approve covenant actions"
        available={false}
        reason="The receiving team must accept. The ordering team cannot accept on the receiver's behalf."
        onAction={onAction}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Approve covenant actions is not available' })).toBeTruthy()
    expect(screen.getByText(/receiving team must accept/)).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Approve covenant actions' })
    expect(button).toHaveProperty('disabled', true)
    fireEvent.click(button)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('enables the action when available and still shows why', () => {
    const onAction = vi.fn()
    render(
      <DecisionBlock
        actionLabel="Approve covenant actions"
        available
        reason="Selected actions will write to the simulator. Outcome stays unproven until readback."
        onAction={onAction}
      />,
    )
    const button = screen.getByRole('button', { name: 'Approve covenant actions' })
    expect(button).toHaveProperty('disabled', false)
    fireEvent.click(button)
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Outcome stays unproven until readback/)).toBeTruthy()
  })
})
