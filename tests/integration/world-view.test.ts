import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assembleLiveSnapshot } from '@/app/api/world/assemble-live'
import { assembleReplayComparison } from '@/app/api/world/assemble-replay'

beforeEach(() => {
  vi.stubEnv('COVENANT_FAKE_PORTS', '1')
  vi.stubEnv('OPENAI_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('world view assembly', () => {
  it('serves GET /api/world and GET /api/world/replay without writing', async () => {
    const { resetContainer, getContainer, writeCallLog } = await import('@/services/container')
    resetContainer()
    const writesBefore = writeCallLog(getContainer().write)?.length ?? 0
    const { GET: getLive } = await import('@/app/api/world/route')
    const { GET: getReplay } = await import('@/app/api/world/replay/route')
    const live = await getLive()
    const replay = await getReplay()
    expect(live.status).toBe(200)
    expect(replay.status).toBe(200)
    const liveBody = (await live.json()) as { snapshot: { provenance: { world: string } } | null }
    const replayBody = (await replay.json()) as {
      left: { heading: string; snapshots: unknown[] }
      right: { heading: string; snapshots: unknown[] }
    }
    expect(replayBody.left.heading).toBe('Protocol v3')
    expect(replayBody.right.snapshots.length).toBeGreaterThan(1)
    if (liveBody.snapshot) {
      expect(liveBody.snapshot.provenance.world.length).toBeGreaterThan(0)
    }
    expect(JSON.stringify(liveBody)).not.toContain('ANIMA_SIM_API_KEY')
    expect(writeCallLog(getContainer().write)).toHaveLength(writesBefore)
  })

  it('projects stored cases without calling a write port', async () => {
    const { resetContainer, getContainer, writeCallLog } = await import('@/services/container')
    resetContainer()
    const writesBefore = writeCallLog(getContainer().write)?.length ?? 0
    const snapshot = await assembleLiveSnapshot()
    if (snapshot) {
      expect(snapshot.provenance.denominator.cases).toBeGreaterThan(0)
      expect(snapshot.entities.length).toBe(snapshot.provenance.denominator.cases)
      expect(snapshot.provenance.world.length).toBeGreaterThan(0)
    }
    expect(writeCallLog(getContainer().write)).toHaveLength(writesBefore)
  })

  it('replays the after-hours trace into two visibly different societies', () => {
    const comparison = assembleReplayComparison()
    const v3 = comparison.left.snapshots.at(-1)!
    const v4 = comparison.right.snapshots.at(-1)!
    expect(v3.entities[0]!.neglectMinutes).toBeGreaterThan(v4.entities[0]!.neglectMinutes)
    expect(v3.provenance.replay?.label).toBe('Recorded simulator replay')
    expect(v4.provenance.denominator.events).toBeGreaterThan(0)
  })
})
