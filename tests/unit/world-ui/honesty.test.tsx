// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorldView } from '@/components/world/WorldView'
import { barrenSnapshot, unusualSnapshot } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('Pixel Societies honesty', () => {
  it('renders exactly the unusual prop values and invents no other society', () => {
    const snap = unusualSnapshot()
    render(<WorldView snapshot={snap} />)

    expect(screen.getByText('World team-unusual-fixture-99')).toBeTruthy()
    expect(screen.getByText(/Recorded simulator replay/)).toBeTruthy()
    expect(screen.getByText(/1999-12-31T23:59:00.000Z/)).toBeTruthy()
    expect(screen.getByText('Built from 17 cases and 83 events')).toBeTruthy()
    expect(screen.getByText('Clock paused at speed 3')).toBeTruthy()

    const atlas = document.querySelector('[data-world-atlas]')
    expect(atlas?.getAttribute('data-district-count')).toBe('1')
    expect(atlas?.getAttribute('data-entity-count')).toBe('1')
    expect(atlas?.getAttribute('data-thread-count')).toBe('0')
    expect(atlas?.getAttribute('data-event-count')).toBe('0')
    expect(atlas?.getAttribute('data-speed')).toBe('3')
    expect(atlas?.getAttribute('data-now')).toBe('1111111111111')
    expect(atlas?.getAttribute('data-paused')).toBe('true')
    expect(atlas?.getAttribute('data-motion')).toBe('static')

    expect(document.querySelector('[data-district="pharmacy"]')).toBeTruthy()
    expect(document.querySelector('[data-district="hospital"]')).toBeNull()
    expect(document.querySelector('[data-district="gp"]')).toBeNull()
    expect(document.querySelector('[data-thread]')).toBeNull()
    expect(document.querySelector('[data-event]')).toBeNull()
    expect(document.querySelector('[data-pending-tray]')).toBeNull()

    const phial = document.querySelector('[data-entity="ent-odd"]')
    expect(phial?.getAttribute('data-neglect')).toBe('777')
    expect(phial?.getAttribute('data-direction')).toBe('below')
    expect(phial?.getAttribute('data-rot-band')).toBe('rot')
    expect(phial?.getAttribute('data-rot-pixels')).toBe('18')
    expect(phial?.getAttribute('data-ownership')).toBe('STALE')
    expect(phial?.getAttribute('data-closure')).toBe('REOPENED')
    expect(phial?.getAttribute('data-exceptions')).toBe('11')
    expect(phial?.getAttribute('data-chases')).toBe('4')
    expect(phial?.getAttribute('data-duplicates')).toBe('2')

    const tables = screen.getByRole('region', { name: 'World as data' })
    expect(within(tables).getByText('Night dispensary')).toBeTruthy()
    expect(within(tables).getAllByText('ent-odd').length).toBeGreaterThan(0)
    expect(within(tables).getByText('SIM-000777')).toBeTruthy()
    expect(within(tables).getByText('blood-odd-xyz')).toBeTruthy()
    expect(within(tables).getByText('Odd analyte')).toBeTruthy()
    expect(within(tables).getByText('below the source-supplied reference range')).toBeTruthy()
    expect(within(tables).getByText('777')).toBeTruthy()
    expect(within(tables).getByText('11')).toBeTruthy()
    expect(within(tables).queryByText('Hospital')).toBeNull()
    expect(within(tables).getByText('No threads in this snapshot.')).toBeTruthy()
    expect(within(tables).getByText('No events in this snapshot.')).toBeTruthy()

    expect(screen.getAllByText('No events in this snapshot.').length).toBeGreaterThan(0)
    expect(screen.queryByText('240')).toBeNull()
    expect(screen.queryByText('team-ea32f6302052')).toBeNull()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  })

  it('draws no districts, phials, threads or events from a barren snapshot', () => {
    render(<WorldView snapshot={barrenSnapshot()} />)
    const atlas = document.querySelector('[data-world-atlas]')
    expect(atlas?.getAttribute('data-district-count')).toBe('0')
    expect(atlas?.getAttribute('data-entity-count')).toBe('0')
    expect(atlas?.getAttribute('data-thread-count')).toBe('0')
    expect(document.querySelector('[data-district]')).toBeNull()
    expect(document.querySelector('[data-entity]')).toBeNull()
    expect(document.querySelector('[data-thread]')).toBeNull()
    expect(screen.getByText('World team-barren')).toBeTruthy()
    expect(screen.getByText('Built from 0 cases and 0 events')).toBeTruthy()
    expect(screen.queryByText('Recorded simulator replay')).toBeNull()
    expect(screen.getByText('0 districts · 0 results · 0 threads')).toBeTruthy()
  })
})
