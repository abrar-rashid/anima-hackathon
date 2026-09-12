// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('app pages', () => {
  // `/` is now an async server component (the Close The Loop worklist) that
  // reads the simulator directly via `assembleWorklist`. It is covered by the
  // component-level suites in tests/unit/worklist/*, which exercise
  // `WorklistView` with fixture props instead of rendering the page function
  // (an async server component cannot be rendered synchronously by RTL).

  it('renders an honest error panel when the case API cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const { default: CasePage } = await import('@/app/case/[patientId]/page')
    const ui = await CasePage({ params: Promise.resolve({ patientId: 'SIM-000001' }) })
    render(ui)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/could not be loaded/i)
    expect(alert.textContent).not.toMatch(/handover complete|diagnos|treatment/i)
    expect(screen.getByText('SIM-000001')).toBeTruthy()
  })
})
