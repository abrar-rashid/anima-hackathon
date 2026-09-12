// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PixelTownCanvas } from '@/components/town/PixelTownCanvas'
import { BUILDINGS, type TownSimulationData } from '@/components/town/town-engine'

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const data: TownSimulationData = {
  clock: { now: 1_789_286_400_000, paused: false, speed: 1 },
  patient: {
    id: 'SIM-000001',
    name: 'Amira Khan',
    recentLab: { name: 'CRP', value: 5.6, unit: 'mg/L', isAbnormal: true, refLow: 0, refHigh: 5 },
  },
  caseStatus: {
    ownershipState: 'ORDERER_OWNS',
    closureState: 'RESULT_AVAILABLE',
    currentOwner: 'hospital',
    deadlineMinutes: 30,
  },
  recentEvents: [{ id: 'e1', actor: 'hospital', detail: 'Result available' }],
  districts: {
    hospital: {
      id: 'hospital',
      name: "St. Jude's Acute Hospital",
      status: 'Holding Accountable',
      recentEvent: 'Acute admissions monitored',
    },
  },
}

describe('PixelTownCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders the expansive town chrome, eight districts, and clock controls', () => {
    const onAdvance = vi.fn()
    const onClose = vi.fn()
    render(<PixelTownCanvas data={data} onAdvanceClock={onAdvance} onCloseLoop={onClose} />)

    expect(screen.getByText(/Smallville Live Simulator/)).toBeTruthy()
    expect(screen.getByLabelText(/Expansive 16-bit care town/i)).toBeTruthy()
    expect(screen.getByLabelText(/Minimap of the full town/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+10m' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+30m' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+90m' })).toBeTruthy()

    for (const building of BUILDINGS) {
      expect(screen.getByRole('button', { name: new RegExp(building.short, 'i') })).toBeTruthy()
    }

    fireEvent.click(screen.getByRole('button', { name: '+30m' }))
    expect(onAdvance).toHaveBeenCalledWith(30)
    fireEvent.click(screen.getByRole('button', { name: 'Close the loop' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('opens a live building drawer from the district rail', () => {
    render(<PixelTownCanvas data={data} />)
    fireEvent.click(screen.getByRole('button', { name: /Hospital/i }))
    expect(screen.getByRole('heading', { name: /St\. Jude's Acute Hospital/ })).toBeTruthy()
    expect(screen.getByText('Holding Accountable')).toBeTruthy()
    expect(screen.getByText(/CRP 5\.6 mg\/L/)).toBeTruthy()
  })
})
