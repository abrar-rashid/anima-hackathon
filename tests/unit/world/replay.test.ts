import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { replayTrace } from '@/domain/twin'
import type { EventEnvelope, ProtocolVersion } from '@/domain/types'
import { replay } from '@/world/replay'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function loadJson<T>(relative: string): T {
  return JSON.parse(readFileSync(join(root, relative), 'utf8')) as T
}

const WORLD = 'team-ea32f6302052'
const CAPTURED_AT = '2026-09-12T12:12:40.886Z'
const caseSeed = { caseId: 'case-after-hours-timeout', patientId: 'SIM-000001' }

const v3 = loadJson<ProtocolVersion>('fixtures/protocols/v3.json')
const v4 = loadJson<ProtocolVersion>('fixtures/protocols/v4.json')
const trace = loadJson<EventEnvelope[]>('fixtures/traces/after-hours-timeout.json')

function replayProtocol(protocol: ProtocolVersion) {
  return replay({
    trace,
    protocol,
    caseSeed,
    world: WORLD,
    capturedAt: CAPTURED_AT,
    clock: { paused: true, speed: 60 },
  })
}

function entityAt(snapshots: ReturnType<typeof replay>, index: number) {
  const snapshot = snapshots[index]
  expect(snapshot).toBeDefined()
  const entity = snapshot!.entities[0]
  expect(entity).toBeDefined()
  return { snapshot: snapshot!, entity: entity! }
}

describe('world replay', () => {
  it('keeps every entity owner district non-empty in every snapshot of a full replay', () => {
    for (const protocol of [v3, v4]) {
      const snapshots = replayProtocol(protocol)
      expect(snapshots.length).toBeGreaterThan(1)
      for (const snapshot of snapshots) {
        expect(snapshot.entities.length).toBeGreaterThan(0)
        for (const entity of snapshot.entities) {
          expect(entity.ownerTeamId.length).toBeGreaterThan(0)
          const district = snapshot.districts.find((row) => row.teamId === entity.ownerTeamId)
          expect(district, `missing district for ${entity.ownerTeamId} at t=${snapshot.now}`).toBeDefined()
          expect(district!.ownedEntityIds).toContain(entity.entityId)
        }
      }
    }
  })

  it('computes neglect and overdue minutes from the trace rather than as constants', () => {
    const snapshots = replayProtocol(v3)
    const neglects = snapshots.map((snapshot) => snapshot.entities[0]!.neglectMinutes)
    const overdues = snapshots.flatMap((snapshot) => snapshot.threads.map((thread) => thread.overdueMinutes))

    expect(new Set(neglects).size).toBeGreaterThan(1)
    expect(new Set(overdues).size).toBeGreaterThan(1)

    const mid = Math.floor(snapshots.length / 2)
    const { entity: earlier } = entityAt(snapshots, 1)
    const { entity: later } = entityAt(snapshots, mid)
    const acceptedIndex = snapshots.findIndex((snapshot) => snapshot.entities[0]?.ownershipState === 'ACCEPTED')
    expect(acceptedIndex).toBeGreaterThan(0)
    expect(snapshots[acceptedIndex - 1]!.entities[0]!.neglectMinutes).toBeLessThan(
      snapshots[acceptedIndex]!.entities[0]!.neglectMinutes,
    )
    expect(later.neglectMinutes).toBeGreaterThan(earlier.neglectMinutes)

    const firstOverdue = snapshots.find((snapshot) => snapshot.threads.some((thread) => thread.overdueMinutes > 0))
    expect(firstOverdue).toBeDefined()
    const firstOverdueIndex = snapshots.indexOf(firstOverdue!)
    const laterOverdue = snapshots[snapshots.length - 1]!.threads[0]
    const earlyOverdue = snapshots[firstOverdueIndex]!.threads[0]
    expect(laterOverdue).toBeDefined()
    expect(earlyOverdue).toBeDefined()
  })

  it('produces visibly different snapshot series for v3 and v4 of the same trace', () => {
    const v3Series = replayProtocol(v3)
    const v4Series = replayProtocol(v4)
    const v3Final = v3Series[v3Series.length - 1]!
    const v4Final = v4Series[v4Series.length - 1]!
    const v3Twin = replayTrace(trace, v3, caseSeed)
    const v4Twin = replayTrace(trace, v4, caseSeed)

    const v3Entity = v3Final.entities[0]!
    const v4Entity = v4Final.entities[0]!

    expect(v4Entity.neglectMinutes).toBeLessThan(v3Entity.neglectMinutes)
    expect(v4Entity.exceptionCount).toBeLessThan(v3Entity.exceptionCount)
    expect(v4Twin.finalState.exceptionsEmitted.length).toBeLessThan(
      v3Twin.finalState.exceptionsEmitted.length,
    )
    expect(v4Entity.exceptionCount).toBe(v4Twin.finalState.exceptionsEmitted.length)
    expect(v3Entity.exceptionCount).toBe(v3Twin.finalState.exceptionsEmitted.length)

    const v3AcceptedNow = v3Series.find((snapshot) => snapshot.entities[0]?.ownershipState === 'ACCEPTED')?.now
    const v4AcceptedNow = v4Series.find((snapshot) => snapshot.entities[0]?.ownershipState === 'ACCEPTED')?.now
    expect(v3AcceptedNow).toBeDefined()
    expect(v4AcceptedNow).toBeDefined()
    expect(v4AcceptedNow!).toBeLessThan(v3AcceptedNow!)

    expect(v4Entity.ownerActorId).not.toBe(v3Entity.ownerActorId)
    expect(v3Series.some((snapshot) => snapshot.threads.some((thread) => thread.state === 'OVERDUE'))).toBe(
      true,
    )
    expect(v4Series.some((snapshot) => snapshot.threads.some((thread) => thread.state === 'OVERDUE'))).toBe(
      false,
    )
    expect(v3Final.events.some((event) => event.kind === 'TransferTimedOut')).toBe(true)
    expect(v4Final.events.some((event) => event.kind === 'TransferTimedOut')).toBe(false)

    expect(JSON.stringify(v3Series)).not.toEqual(JSON.stringify(v4Series))
  })

  it('stamps every replay snapshot with the verbatim label, capture time, world id and honest denominator', () => {
    const snapshots = replayProtocol(v4)
    for (const snapshot of snapshots) {
      expect(snapshot.provenance.replay).toEqual({
        label: 'Recorded simulator replay',
        capturedAt: CAPTURED_AT,
      })
      expect(snapshot.provenance.world).toBe(WORLD)
      expect(snapshot.provenance.denominator.cases).toBe(1)
      expect(snapshot.provenance.denominator.events).toBe(snapshot.events.length)
      expect(snapshot.paused).toBe(true)
      expect(snapshot.speed).toBe(60)
    }
    const last = snapshots[snapshots.length - 1]!
    expect(last.provenance.denominator.events).toBeGreaterThan(0)
  })

  it('is deterministic across two replays of the same trace and protocol', () => {
    expect(replayProtocol(v3)).toEqual(replayProtocol(v3))
    expect(replayProtocol(v4)).toEqual(replayProtocol(v4))
  })
})
