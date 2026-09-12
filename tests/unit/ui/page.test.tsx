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
  it('renders the unified Close The Loop application home', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        world: 'team-ea32f6302052',
        live: false,
        clock: { now: 1789286400000, paused: true, speed: 0 },
        patient: {
          id: 'SIM-000001',
          name: 'Amira Khan',
          age: 64,
          gender: 'Female',
          problems: [],
          recentLab: { name: 'CRP', value: 5.6, unit: 'mg/L', isAbnormal: true },
        },
        caseSnapshot: {
          case: {
            caseId: 'case-SIM-000001',
            ownershipState: 'ORDERER_OWNS',
            closureState: 'RESULT_AVAILABLE',
            currentAccountableOwner: { teamId: 'hospital' },
            requestedReceiver: 'gp',
          },
          proposal: null,
          connection: { world: 'team-ea32f6302052', simulatorNow: 1789286400000, live: false },
        },
        tasks: [],
        districts: {},
        recentEvents: [],
      }),
    }))

    const { default: Home } = await import('@/app/page')
    render(<Home />)
    expect(screen.getByRole('heading', { level: 1, name: /Close The Loop/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Pixel Town/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Command Cockpit/i })).toBeTruthy()
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
