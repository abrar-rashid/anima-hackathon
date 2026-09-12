// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorldEmpty } from '@/components/world/WorldEmpty'

afterEach(() => {
  cleanup()
})

describe('WorldEmpty', () => {
  it('uses a status for empty and loading, and an alert for error', () => {
    const { rerender } = render(<WorldEmpty reason="empty" />)
    expect(screen.getByRole('status').textContent).toMatch(/invents nothing/i)
    rerender(<WorldEmpty reason="loading" />)
    expect(screen.getByRole('status').textContent).toMatch(/Waiting for a snapshot/i)
    rerender(<WorldEmpty reason="error" message="disk failed" />)
    expect(screen.getByRole('alert').textContent).toMatch(/disk failed/)
  })
})
