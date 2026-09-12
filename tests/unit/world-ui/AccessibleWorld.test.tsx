// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AccessibleWorld } from '@/components/world/AccessibleWorld'
import { snapshot } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('AccessibleWorld', () => {
  it('exposes every snapshot field in tables', () => {
    const snap = snapshot()
    render(<AccessibleWorld snapshot={snap} />)
    const region = screen.getByRole('region', { name: 'World as data' })
    expect(within(region).getByText(snap.entities[0]!.analyteName)).toBeTruthy()
    expect(within(region).getByText(String(snap.entities[0]!.neglectMinutes))).toBeTruthy()
    expect(within(region).getByText('Overdue — stitch frayed')).toBeTruthy()
    expect(within(region).getByText('ResultAvailable')).toBeTruthy()
    expect(within(region).getByText(snap.entities[0]!.resultId)).toBeTruthy()
  })
})
