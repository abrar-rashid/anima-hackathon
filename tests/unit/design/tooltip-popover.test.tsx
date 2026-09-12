// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Popover } from '@/design/primitives/popover'
import { Tooltip } from '@/design/primitives/tooltip'

afterEach(() => {
  cleanup()
})

describe('Tooltip', () => {
  it('is reachable from keyboard focus and names the trigger', () => {
    render(
      <Tooltip content="Outcome stays unproven until readback.">
        <button type="button">Why this is disabled</button>
      </Tooltip>,
    )
    const trigger = screen.getByRole('button', { name: 'Why this is disabled' })
    fireEvent.focus(trigger)
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toMatch(/unproven until readback/)
    expect(trigger.getAttribute('aria-describedby')).toBe(tip.id)
  })
})

describe('Popover', () => {
  it('opens a labelled dialog and returns focus on Escape', () => {
    render(
      <Popover triggerLabel="Idempotency" title="Idempotency key">
        <p>Key issued for SIM-000001</p>
      </Popover>,
    )
    const trigger = screen.getByRole('button', { name: 'Idempotency' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Idempotency key' })).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
