// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EventTicker } from '@/components/world/EventTicker'
import { snapshot } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('EventTicker', () => {
  it('lists only the supplied events in chronological order', () => {
    render(<EventTicker events={snapshot().events} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toMatch(/ResultAvailable/)
    expect(items[1]?.textContent).toMatch(/TransferTimedOut/)
    expect(screen.getByRole('status').textContent).toMatch(/TransferTimedOut/)
  })

  it('says so when the snapshot has no events', () => {
    render(<EventTicker events={[]} />)
    expect(screen.getAllByText('No events in this snapshot.').length).toBeGreaterThan(0)
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})
