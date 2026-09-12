// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from '@/design/primitives/button'
import { DesignRoot } from '@/design/primitives/design-root'

afterEach(() => {
  cleanup()
})

describe('Button', () => {
  it('exposes a named button role', () => {
    render(
      <DesignRoot>
        <Button>Approve covenant actions</Button>
      </DesignRoot>,
    )
    expect(screen.getByRole('button', { name: 'Approve covenant actions' })).toBeTruthy()
  })

  it('uses a genuine disabled state instead of opacity-only inertness', () => {
    render(
      <DesignRoot>
        <Button disabled>Approve covenant actions</Button>
      </DesignRoot>,
    )
    const button = screen.getByRole('button', { name: 'Approve covenant actions' })
    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button).toHaveProperty('type', 'button')
    expect(window.getComputedStyle(button).opacity === '' || Number(window.getComputedStyle(button).opacity) >= 1).toBe(
      true,
    )
  })

  it('announces busy work without claiming a proven outcome', () => {
    render(
      <DesignRoot>
        <Button busy>Approve covenant actions</Button>
      </DesignRoot>,
    )
    const button = screen.getByRole('button', { name: 'Working. Outcome is not yet proven.' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button).toHaveProperty('disabled', true)
  })
})
