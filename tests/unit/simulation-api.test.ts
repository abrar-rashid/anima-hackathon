import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/anima/readers', () => ({
  readClock: async () => ({
    clock: { now: 1_789_286_400_000, paused: true, speed: 0 },
    events: [],
  }),
  readTeam: async () => ({
    team: 'team12',
    world: 'team-test',
    scopes: ['gp', 'hospital', 'diagnostics', 'community', 'pharmacy', 'referrals', 'wearables'],
  }),
  findPatient: async (patientId: string) => ({
    id: patientId,
    name: 'not-supplied-by-source',
    birthDate: null,
    conditions: [],
    goals: [],
    needs: [],
    localIds: {},
    synthetic: true,
  }),
  readCatalogue: async () => ({
    data: [
      { id: 'gp', name: 'Riverside Practice', subtitle: 'GP', color: '#abc' },
      { id: 'hospital', name: 'Northbank General', subtitle: 'Hospital', color: '#def' },
    ],
    fetchedAt: Date.now(),
    stale: false,
  }),
  readPatientAcrossSites: async () => ({
    slices: [
      { site: 'gp', resources: [], events: [] },
      { site: 'hospital', resources: [], events: [] },
    ],
    failedSites: [],
  }),
}))

import { GET as getLive } from '@/app/api/simulation/live/route'
import { POST as postClock } from '@/app/api/simulation/clock/route'
import { resetContainer } from '@/services/container'

describe('Simulation Live & Clock APIs', () => {
  const originalEnv = process.env.COVENANT_FAKE_PORTS

  beforeEach(() => {
    process.env.COVENANT_FAKE_PORTS = '1'
    resetContainer()
  })

  afterEach(() => {
    process.env.COVENANT_FAKE_PORTS = originalEnv
    resetContainer()
  })

  it('GET /api/simulation/live returns live patient, tasks, districts, and clock', async () => {
    const req = new Request('http://localhost:3000/api/simulation/live?patientId=SIM-000001')
    const res = await getLive(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.patient).toBeDefined()
    expect(data.patient.id).toBe('SIM-000001')
    expect(typeof data.patient.name).toBe('string')
    expect(data.clock).toBeDefined()
    expect(typeof data.clock.now).toBe('number')
    expect(Array.isArray(data.tasks)).toBe(true)
    expect(data.districts.hospital).toBeDefined()
    expect(data.districts.gp).toBeDefined()
    expect(data.districts.diagnostics).toBeDefined()
    expect(data.districts.community).toBeDefined()
    expect(data.districts.referrals).toBeDefined()
    expect(data.districts.wearables).toBeDefined()
    expect(data.districts.pharmacy).toBeDefined()
    expect(data.districts.patient).toBeUndefined()
  })

  it('POST /api/simulation/clock advances the simulation time', async () => {
    const req = new Request('http://localhost:3000/api/simulation/clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advanceMinutes: 30 }),
    })
    const res = await postClock(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.advancedMinutes).toBe(30)
    expect(typeof data.now).toBe('number')
  })
})
