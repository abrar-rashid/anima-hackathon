import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const DUMMY_KEY = 'test-anima-sim-key'

const gpView = JSON.parse(
  readFileSync(path.join(process.cwd(), 'fixtures/view.gp.SIM-000001.json'), 'utf8'),
) as Record<string, unknown>

const diagnosticsView = JSON.parse(
  readFileSync(path.join(process.cwd(), 'fixtures/view.diagnostics.SIM-000001.json'), 'utf8'),
) as Record<string, unknown>

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function loadRead() {
  vi.stubEnv('ANIMA_SIM_API_KEY', DUMMY_KEY)
  vi.stubEnv('ANIMA_SIM_BASE_URL', 'https://sim.example.test')
  const { createAnimaClient } = await import('@/adapters/anima/client')
  const { AnimaReadAdapter } = await import('@/adapters/anima/read-adapter')
  return new AnimaReadAdapter(createAnimaClient())
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('read-adapter', () => {
  it('pagination requests offset 0..total', async () => {
    const requested: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        const offset = Number(new URL(url).searchParams.get('offset') ?? '0')
        requested.push(offset)
        const id = `r-page-${offset}`
        return jsonResponse({
          now: 1789286400000,
          resources: [
            {
              id,
              kind: 'task',
              title: 'paged',
              status: 'open',
              owner: 'gp',
              visibleTo: ['gp'],
              version: 1,
              createdAt: 1789200000000,
              data: {},
              patientId: 'SIM-000001',
            },
          ],
          resourceTotal: 3,
          resourceOffset: offset,
          resourceLimit: 1,
          events: [],
        })
      }),
    )

    const read = await loadRead()
    const page = await read.getSiteRecords('gp', 'SIM-000001')
    expect(requested).toEqual([0, 1, 2])
    expect(requested[0]).toBe(0)
    expect(requested[requested.length - 1]).toBeLessThan(3)
    expect(page.total).toBe(3)
    expect(page.items.map((item) => item.id)).toEqual(['r-page-0', 'r-page-1', 'r-page-2'])
  })

  it('getCurrentResult scans the diagnostics fixture for the latest blood report', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/sites/diagnostics/view')) return jsonResponse(diagnosticsView)
        throw new Error(`unexpected ${url}`)
      }),
    )
    const read = await loadRead()
    const result = await read.getCurrentResult('SIM-000001')
    expect(result).not.toBeNull()
    expect(result?.id).toBe('blood-v1-SIM-000001-crp-5')
    expect(result?.version).toBe(1)
    expect(result?.patientId).toBe('SIM-000001')
    expect(result?.collectedAt).toBe(1789113600000)
    expect(result?.owner).toBe('diagnostics')
    expect(result?.classification).toEqual({
      rule: 'source-reference-range',
      ruleText:
        'An analyte value lies outside the reference range supplied by the source laboratory (referenceLow..referenceHigh). No urgency, diagnosis or treatment is inferred.',
      analyteId: 'crp',
      analyteName: 'C-reactive protein',
      value: 5.6,
      unit: 'mg/L',
      referenceLow: 0,
      referenceHigh: 5,
      direction: 'above',
    })
    expect(result).not.toHaveProperty('abnormal')
  })

  it('getActivity merges clock events with view events filtered by resourceIds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/clock') || url.includes('/api/clock?')) {
          return jsonResponse({
            now: 1789286400000,
            paused: true,
            speed: 0,
            events: [
              {
                id: 'clock-1',
                time: 1789286400000,
                type: 'clock.tick',
                actor: 'simulator',
                detail: '[redacted]',
                resourceId: 'r-2',
                patientId: 'SIM-000001',
                visibleTo: ['gp'],
              },
            ],
          })
        }
        if (url.includes('/api/sites/gp/view')) {
          return jsonResponse({
            ...gpView,
            events: [
              {
                id: 'e-task',
                time: 1789200000000,
                type: 'task.created',
                actor: 'gp',
                detail: '[redacted]',
                resourceId: 'r-2',
                patientId: 'SIM-000001',
                visibleTo: ['gp'],
              },
              {
                id: 'e-other',
                time: 1789200000000,
                type: 'request.arrived',
                actor: 'patient-demand',
                detail: '[redacted]',
                resourceId: 'r-5270',
                patientId: 'SIM-028410',
                visibleTo: ['gp'],
              },
            ],
          })
        }
        throw new Error(`unexpected ${url}`)
      }),
    )
    const read = await loadRead()
    const activity = await read.getActivity('case-1', ['r-2'])
    expect(activity.map((entry) => entry.id).sort()).toEqual(['clock-1', 'e-task'])
    expect(activity.every((entry) => entry.resourceId === 'r-2')).toBe(true)
    expect(activity.some((entry) => entry.id === 'e-other')).toBe(false)
  })
})
