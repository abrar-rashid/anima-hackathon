// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Segmented } from '@/design/primitives/segmented'
import { Tabs } from '@/design/primitives/tabs'

afterEach(() => {
  cleanup()
})

describe('Tabs', () => {
  it('uses tab semantics and moves with arrow keys', () => {
    render(
      <Tabs
        label="Case views"
        defaultValue="evidence"
        tabs={[
          { id: 'evidence', label: 'Evidence', content: 'Readback citations' },
          { id: 'protocol', label: 'Protocol', content: 'Protocol preview' },
        ]}
      />,
    )
    const evidence = screen.getByRole('tab', { name: 'Evidence' })
    const protocol = screen.getByRole('tab', { name: 'Protocol' })
    expect(evidence.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toMatch(/Readback citations/)
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(protocol.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toMatch(/Protocol preview/)
  })
})

describe('Segmented', () => {
  it('exposes a radiogroup and changes with keyboard', () => {
    const onChange = vi.fn()
    render(
      <Segmented
        label="Owner view"
        value="current"
        onChange={onChange}
        options={[
          { value: 'current', label: 'Current owner' },
          { value: 'next', label: 'Requested receiver' },
        ]}
      />,
    )
    const group = screen.getByRole('radiogroup', { name: 'Owner view' })
    expect(screen.getByRole('radio', { name: 'Current owner' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('next')
  })
})
