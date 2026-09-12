// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NeighbourhoodView } from '@/components/neighbourhood/NeighbourhoodView'
import { createWorld, freezeWorld, stepWorld } from '@/components/neighbourhood/engine'
import { actorSkins } from '@/components/neighbourhood/sprites-actors'
import { fixtureModel } from './fixture-town'

/**
 * The reduced-motion path.
 *
 * With `prefers-reduced-motion: reduce` the town must still render and still be
 * readable: nothing animates, but the sites, their counts and the document
 * trail are all present. This also covers the case where the environment gives
 * us no 2D canvas at all — jsdom does not — which must degrade to the data
 * tables rather than blanking the page.
 */

function stubMatchMedia(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the town under prefers-reduced-motion', () => {
  it('renders the map surface and says animation is paused', () => {
    stubMatchMedia(true)
    render(<NeighbourhoodView initial={fixtureModel()} />)

    expect(screen.getByTestId('neighbourhood-canvas')).toBeTruthy()
    expect(document.body.textContent).toContain('animation paused for reduced motion')
  })

  it('still lists every site, its counts and the event trail', () => {
    stubMatchMedia(true)
    const model = fixtureModel()
    const { container } = render(<NeighbourhoodView initial={model} />)

    expect(container.querySelectorAll('[data-row-site]').length).toBe(7)
    expect(container.querySelectorAll('[data-row-doc]').length).toBe(model.docs.length)
    expect(container.querySelectorAll('[data-row-work]').length).toBeGreaterThan(0)

    const text = document.body.textContent ?? ''
    expect(text).toContain('Riverside Practice')
    expect(text).toMatch(/\d[\d,]* of \d[\d,]* resources scanned/)
  })

  it('keeps the keyboard route to every building when motion is reduced', () => {
    stubMatchMedia(true)
    const model = fixtureModel()
    render(<NeighbourhoodView initial={model} />)

    for (const site of model.sites) {
      const label = site.placeName ?? site.site
      expect(screen.getAllByRole('button', { name: new RegExp(label, 'i') }).length).toBeGreaterThan(0)
    }
    expect(screen.getByText(/Skip the map and read the neighbourhood as data/i)).toBeTruthy()
  })

  it('degrades with a named reason when the environment has no 2D canvas', () => {
    stubMatchMedia(true)
    render(<NeighbourhoodView initial={fixtureModel()} />)
    // jsdom supplies no 2D context, which is the same failure mode as a browser
    // refusing one. The map says so and the tables carry the information.
    expect(screen.getByTestId('canvas-unavailable').textContent).toContain(
      'The neighbourhood is listed as data below the map',
    )
  })

  it('renders with motion allowed too', () => {
    stubMatchMedia(false)
    render(<NeighbourhoodView initial={fixtureModel()} />)
    expect(screen.getByTestId('neighbourhood-canvas')).toBeTruthy()
    expect(document.body.textContent).not.toContain('animation paused for reduced motion')
  })
})

describe('the frozen world still shows what is happening', () => {
  it('spreads actors along their routes and parks documents mid-journey', () => {
    const model = fixtureModel()
    const world = createWorld(model, actorSkins())
    expect(world.actors.length).toBeGreaterThan(0)
    expect(world.docs).toHaveLength(0)

    freezeWorld(world)

    // Documents are visible rather than hidden at a doorstep.
    expect(world.docs.length).toBeGreaterThan(0)
    for (const flying of world.docs) {
      expect(flying.travelled).toBeGreaterThan(0)
      expect(flying.travelled).toBeLessThan(flying.routeLength)
    }
    expect(world.actors.some((actor) => actor.travelled > 0)).toBe(true)
    expect(world.agent.bubble.length).toBeGreaterThan(0)
  })

  it('does not advance when frozen', () => {
    const model = fixtureModel()
    const world = createWorld(model, actorSkins())
    freezeWorld(world)
    const before = world.actors.map((actor) => actor.travelled)
    const docsBefore = world.docs.map((flying) => flying.travelled)

    stepWorld(world, 1000, model, { agentBusy: false, frozen: true })
    stepWorld(world, 1000, model, { agentBusy: false, frozen: true })

    expect(world.actors.map((actor) => actor.travelled)).toEqual(before)
    expect(world.docs.map((flying) => flying.travelled)).toEqual(docsBefore)
    expect(world.elapsedMs).toBe(0)
  })

  it('advances and launches documents when motion is allowed', () => {
    const model = fixtureModel()
    const world = createWorld(model, actorSkins())
    const before = world.actors[0]!.travelled

    for (let i = 0; i < 40; i += 1) {
      stepWorld(world, 100, model, { agentBusy: false, frozen: false })
    }

    expect(world.actors[0]!.travelled).toBeGreaterThan(before)
    expect(world.docs.length).toBeGreaterThan(0)
    expect(world.elapsedMs).toBe(4000)
    // The bubble only ever restates fields of a real event.
    const source = world.agent.source
    expect(source).not.toBeNull()
    expect(world.agent.bubble[0]).toBe(source!.type)
  })
})
