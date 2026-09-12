// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StateBadge } from '@/components/StateBadge'

afterEach(() => {
  cleanup()
})

describe('StateBadge', () => {
  it('never communicates state by colour alone', () => {
    render(<StateBadge label="SUBMITTED" icon="●" tone="accent" />)
    const badge = screen.getByText('SUBMITTED').closest('[data-state-badge]')
    expect(badge).toBeTruthy()
    expect(badge?.querySelector('[aria-hidden="true"]')?.textContent).toBe('●')
    expect(badge?.textContent).toMatch(/SUBMITTED/)
  })
})
