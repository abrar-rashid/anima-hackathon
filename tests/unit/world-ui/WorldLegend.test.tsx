// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorldLegend } from '@/components/world/WorldLegend'
import { snapshot } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('WorldLegend', () => {
  it('documents every visual state in words, not colour alone', () => {
    render(<WorldLegend snapshot={snapshot()} />)
    for (const id of [
      'occupied',
      'empty-district',
      'above',
      'below',
      'fresh',
      'dust',
      'crack',
      'rot',
      'REQUESTED',
      'ACCEPTED',
      'DECLINED',
      'OVERDUE',
      'RECEIVER_UNAVAILABLE',
      'STALE',
      'pending-tray',
    ]) {
      expect(document.querySelector(`[data-legend="${id}"]`)).toBeTruthy()
    }
    expect(screen.getAllByText(/Not a severity/).length).toBeGreaterThan(0)
    expect(screen.getByText(/This frame/)).toBeTruthy()
  })
})
