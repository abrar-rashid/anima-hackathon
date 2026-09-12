// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmptyState } from '@/design/primitives/empty-state'
import { ErrorState } from '@/design/primitives/error-state'
import { Skeleton } from '@/design/primitives/skeleton'

afterEach(() => {
  cleanup()
})

describe('Skeleton', () => {
  it('announces an honest loading status without invented facts', () => {
    render(<Skeleton />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).toMatch(/No records have been returned yet/)
    expect(status.textContent).not.toMatch(/Dr |hospital|5\.6/)
  })
})

describe('EmptyState', () => {
  it('pairs teaching copy with a visible mark', () => {
    render(
      <EmptyState
        title="No covenant has been compiled"
        body="Open a synthetic case and wait for the compiler to return a proposal."
      />,
    )
    expect(screen.getByRole('heading', { name: 'No covenant has been compiled' })).toBeTruthy()
    expect(document.querySelector('svg')).toBeTruthy()
  })
})

describe('ErrorState', () => {
  it('exposes an alert with recovery', () => {
    render(
      <ErrorState
        title="Readback did not confirm the write"
        body="The simulator accepted the request. Destination visibility is not confirmed."
        recovery="Refresh the case from current returned evidence."
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/did not confirm/)
    expect(alert.textContent).toMatch(/Refresh the case/)
    expect(alert.querySelector('svg')).toBeTruthy()
  })
})
