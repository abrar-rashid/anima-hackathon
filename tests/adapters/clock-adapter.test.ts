import { afterEach, describe, expect, it, vi } from 'vitest'

const DUMMY_KEY = 'test-anima-sim-key'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('clock-adapter', () => {
  it('reads the clock and advances with paused true and advanceMinutes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (!url.includes('/api/clock')) throw new Error(`unexpected ${url}`)
      if ((init?.method ?? 'GET') === 'POST') {
        const body = JSON.parse(String(init?.body)) as { paused: boolean; advanceMinutes: number }
        expect(body.paused).toBe(true)
        expect(body.advanceMinutes).toBe(30)
        return new Response(
          JSON.stringify({
            now: 1789286400000 + 30 * 60 * 1000,
            paused: true,
            speed: 0,
            events: [],
          }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({ now: 1789286400000, paused: true, speed: 0, events: [] }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('ANIMA_SIM_API_KEY', DUMMY_KEY)
    vi.stubEnv('ANIMA_SIM_BASE_URL', 'https://sim.example.test')
    const { createAnimaClient } = await import('@/adapters/anima/client')
    const { AnimaClockAdapter } = await import('@/adapters/anima/clock-adapter')
    const clock = new AnimaClockAdapter(createAnimaClient())

    await expect(clock.read()).resolves.toEqual({ now: 1789286400000, paused: true, speed: 0 })
    await expect(clock.advanceApproved(30)).resolves.toEqual({
      now: 1789286400000 + 30 * 60 * 1000,
      paused: true,
      advancedMinutes: 30,
    })
  })
})
