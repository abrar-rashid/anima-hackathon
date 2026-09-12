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
  it('redirects home to the preflight patient', async () => {
    const { redirect } = await import('next/navigation')
    const { default: Home } = await import('@/app/page')
    Home()
    expect(redirect).toHaveBeenCalledWith('/case/SIM-000001')
  })

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
