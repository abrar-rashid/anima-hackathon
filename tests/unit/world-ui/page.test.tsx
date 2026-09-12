// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import WorldError from '@/app/world/error'
import WorldLoading from '@/app/world/loading'
import WorldPage from '@/app/world/page'

afterEach(() => {
  cleanup()
})

describe('world route', () => {
  it('renders an honest empty atlas when no snapshot is assembled', async () => {
    const ui = await WorldPage()
    render(ui)
    expect(screen.getByRole('heading', { name: 'Pixel Societies' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/invents nothing/i)
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    expect(document.querySelector('[data-world-atlas]')).toBeNull()
  })

  it('has a loading state that does not invent a city', () => {
    render(<WorldLoading />)
    expect(screen.getByRole('status').textContent).toMatch(/No district, result or stitch is invented/i)
    expect(document.querySelector('[data-world-atlas]')).toBeNull()
    expect(document.querySelector('[data-entity]')).toBeNull()
  })

  it('has an honest error state that keeps the case workspace reachable', () => {
    render(
      <WorldError error={Object.assign(new Error('boom'), { digest: 'abc123' })} retry={() => undefined} />,
    )
    expect(screen.getByRole('alert').textContent).toMatch(/could not be drawn/i)
    expect(screen.getByText(/Error digest abc123/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Case workspace' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try drawing again' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
  })
})
