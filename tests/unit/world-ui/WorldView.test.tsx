// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorldView } from '@/components/world/WorldView'
import { snapshot } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('WorldView', () => {
  it('shows provenance, atlas, ticker, scrubber, legend and tables for a snapshot', () => {
    render(<WorldView snapshot={snapshot()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Pixel Societies' })).toBeTruthy()
    expect(screen.getByText('World team-ea32f6302052')).toBeTruthy()
    expect(screen.getByText('Recorded simulator replay · captured 2026-09-12T12:12:40.886Z')).toBeTruthy()
    expect(document.querySelector('[data-world-atlas]')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Recorded events' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Simulator time' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'How to read the atlas' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'World as data' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Case workspace' }).getAttribute('href')).toBe(
      '/case/SIM-000001',
    )
    expect(screen.getByRole('link', { name: 'Skip to world as data' })).toBeTruthy()
  })

  it('shows an honest empty state when no snapshot is supplied', () => {
    render(<WorldView />)
    expect(screen.getByRole('status').textContent).toMatch(/invents nothing/i)
    expect(document.querySelector('[data-world-atlas]')).toBeNull()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  })

  it('shows an honest error without offering a write', () => {
    render(<WorldView errorMessage="Projection failed." />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/could not be drawn/i)
    expect(alert.textContent).toMatch(/Projection failed/)
    expect(alert.textContent).toMatch(/no write was sent/i)
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  })

  it('does not treat direction as severity', () => {
    render(<WorldView snapshot={snapshot()} />)
    expect(document.body.textContent).toMatch(/source-supplied reference range/)
    expect(document.body.textContent).not.toMatch(/sicker|urgency|triage|critical|severe/i)
  })
})
