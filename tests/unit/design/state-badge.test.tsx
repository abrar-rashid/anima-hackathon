// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StateBadge } from '@/design/primitives/state-badge'
import type { StateTone } from '@/design/types'

afterEach(() => {
  cleanup()
})

const tones: StateTone[] = ['idle', 'owned', 'awaiting', 'proven', 'blocked', 'unverified']

describe('StateBadge', () => {
  it.each(tones)('pairs %s text with a hidden shape', (tone) => {
    render(<StateBadge tone={tone} label={`${tone} label`} />)
    const badge = screen.getByText(`${tone} label`).closest('[data-state-badge]')
    expect(badge).toBeTruthy()
    expect(badge?.getAttribute('data-state-tone')).toBe(tone)
    expect(badge?.querySelector('[aria-hidden="true"] svg')).toBeTruthy()
    expect(badge?.textContent).toMatch(`${tone} label`)
  })
})
