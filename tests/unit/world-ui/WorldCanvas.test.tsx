// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorldCanvas } from '@/components/world/WorldCanvas'
import { snapshot } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('WorldCanvas', () => {
  it('maps each snapshot district, entity and thread onto the SVG', () => {
    const snap = snapshot()
    render(<WorldCanvas snapshot={snap} />)
    expect(document.querySelector('[data-district="hospital"]')?.getAttribute('data-owned-count')).toBe(
      '1',
    )
    expect(document.querySelector('[data-district="gp"]')?.getAttribute('data-pending-count')).toBe('1')
    expect(document.querySelector('[data-district="community"]')?.getAttribute('data-occupied')).toBe(
      'false',
    )
    expect(document.querySelector('[data-entity]')?.getAttribute('data-neglect')).toBe('240')
    expect(document.querySelector('[data-thread="thread-hospital-gp"]')?.getAttribute('data-thread-state')).toBe(
      'OVERDUE',
    )
    expect(
      document.querySelector('[data-thread="thread-hospital-gp"]')?.getAttribute('data-overdue-minutes'),
    ).toBe('100')
    expect(document.querySelector('[data-pending-tray]')?.getAttribute('data-pending-tray')).toBe(
      snap.entities[0]?.entityId,
    )
  })

  it('freezes motion when paused or when reduced motion is requested', () => {
    const { rerender } = render(<WorldCanvas snapshot={snapshot({ paused: false })} reducedMotion={false} />)
    expect(document.querySelector('[data-world-atlas]')?.getAttribute('data-motion')).toBe('live')
    rerender(<WorldCanvas snapshot={snapshot({ paused: false })} reducedMotion={true} />)
    expect(document.querySelector('[data-world-atlas]')?.getAttribute('data-motion')).toBe('static')
    rerender(<WorldCanvas snapshot={snapshot({ paused: true })} reducedMotion={false} />)
    expect(document.querySelector('[data-world-atlas]')?.getAttribute('data-motion')).toBe('static')
  })
})
