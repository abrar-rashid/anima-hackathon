// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LiveRegion } from '@/components/LiveRegion'

afterEach(() => {
  cleanup()
})

describe('LiveRegion', () => {
  it('announces submission and readback changes from a polite status region', () => {
    const { rerender } = render(<LiveRegion message="Write submitted. Destination visibility is not yet confirmed." />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).toMatch(/Write submitted/)
    rerender(<LiveRegion message="Readback: action is visible downstream. Activity evidence is not yet confirmed." />)
    expect(screen.getByRole('status').textContent).toMatch(/visible downstream/)
  })
})
