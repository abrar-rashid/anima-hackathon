import { loadPreflight } from '@/services/case-service'
import { getContainer } from '@/services/container'
import { project } from '@/world/projection'
import type { WorldSnapshot } from '@/world/types'
import { listStoredCases } from './list-stored-cases'

/**
 * Project the covenants currently in the case store against the container clock.
 * Honours COVENANT_FAKE_PORTS / live selection already made by the container.
 * Reads only — never opens a case, never advances the clock, never writes.
 */
export async function assembleLiveSnapshot(): Promise<WorldSnapshot | null> {
  const container = getContainer()
  const stored = listStoredCases(container.store)
  if (stored.length === 0) return null

  const clock = await container.clock.read()
  const preflight = loadPreflight()
  const replay =
    container.replay === null
      ? null
      : { label: container.replay.label, capturedAt: container.replay.capturedAt }

  return project({
    cases: stored.map((record) => ({ case: record.case, eventLog: record.case.eventLog })),
    clock: { now: clock.now, paused: clock.paused, speed: clock.speed },
    world: preflight.world,
    replay,
  })
}
