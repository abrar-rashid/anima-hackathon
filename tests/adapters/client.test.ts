import { afterEach, describe, expect, it, vi } from 'vitest'

const DUMMY_KEY = 'test-anima-sim-key'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('anima client', () => {
  it('throws Anima client is server-only when window is defined', async () => {
    vi.resetModules()
    vi.stubGlobal('window', { document: {} })
    await expect(import('@/adapters/anima/client')).rejects.toThrow('Anima client is server-only')
  })

  it('request adds a bearer header, parses JSON, and never logs headers or the key', async () => {
    vi.stubEnv('ANIMA_SIM_API_KEY', DUMMY_KEY)
    vi.stubEnv('ANIMA_SIM_BASE_URL', 'https://sim.example.test')
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ team: 'team12', world: 'team-ea32f6302052', scopes: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { createAnimaClient } = await import('@/adapters/anima/client')
    const client = createAnimaClient()
    const result = await client.request<{ team: string }>('/api/team')

    expect(result.status).toBe(200)
    expect(result.body.team).toBe('team12')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    const url = call?.[0]
    const init = call?.[1]
    expect(url).toBe('https://sim.example.test/api/team')
    const headers = new Headers((init as RequestInit | undefined)?.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${DUMMY_KEY}`)

    const logged = [...log.mock.calls, ...info.mock.calls, ...debug.mock.calls, ...warn.mock.calls, ...error.mock.calls]
      .flat()
      .map((value) => String(value))
      .join('\n')
    expect(logged).not.toContain(DUMMY_KEY)
    expect(logged).not.toMatch(/Authorization/i)
    expect(logged).not.toContain('Bearer')
    log.mockRestore()
    info.mockRestore()
    debug.mockRestore()
    warn.mockRestore()
    error.mockRestore()
  })
})
