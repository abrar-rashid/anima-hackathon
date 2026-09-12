import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { taskReadbackFrom } from '@/adapters/anima/mapping'
import type { StaffIdentity } from '@/domain/types'

const DUMMY_KEY = 'test-anima-sim-key'

const gpView = JSON.parse(
  readFileSync(path.join(process.cwd(), 'fixtures/view.gp.SIM-000001.json'), 'utf8'),
) as Record<string, unknown>

const gpConnect = JSON.parse(
  readFileSync(path.join(process.cwd(), 'fixtures/gp-connect.SIM-000001.json'), 'utf8'),
) as Record<string, unknown>

const staff: StaffIdentity = {
  id: 'staff-test-1',
  name: 'Test Clinician',
  role: 'gp',
  teamId: 'gp',
  attribution: 'app-side',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('uncertain write recovery', () => {
  it('uncertain write (network throw) is followed by readback finding the task', async () => {
    vi.stubEnv('ANIMA_SIM_API_KEY', DUMMY_KEY)
    vi.stubEnv('ANIMA_SIM_BASE_URL', 'https://sim.example.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'POST') {
          throw new Error('network down')
        }
        const url = String(input)
        if (url.includes('/api/sites/gp/view')) {
          return new Response(JSON.stringify(gpView), { status: 200 })
        }
        if (url.includes('/api/nhs/gp-connect')) {
          return new Response(JSON.stringify(gpConnect), { status: 200 })
        }
        throw new Error(`unexpected ${url}`)
      }),
    )

    const { createAnimaClient } = await import('@/adapters/anima/client')
    const { AnimaWriteAdapter } = await import('@/adapters/anima/write-adapter')
    const { AnimaReadAdapter } = await import('@/adapters/anima/read-adapter')
    const client = createAnimaClient()
    const write = new AnimaWriteAdapter(client)
    const read = new AnimaReadAdapter(client)

    await expect(
      write.executeApprovedAction({
        site: 'gp',
        actionName: 'create_task',
        payload: {
          type: 'create_task',
          patientId: 'SIM-000001',
          title: 'Arrange post-discharge monitoring',
        },
        staffIdentity: staff,
        expectedSourceVersions: [],
        idempotencyKey: 'uncertain-key',
      }),
    ).rejects.toThrow('network down')

    const page = await read.getSiteRecords('gp', 'SIM-000001')
    const visible = page.items.find((item) => item.id === 'r-2')
    expect(visible?.kind).toBe('task')
    expect(visible?.status).toBe('open')
    expect(visible?.version).toBe(1)

    expect(taskReadbackFrom(gpConnect, 'r-2')).toEqual({ id: 'r-2', status: 'open', version: 1 })
  })
})
