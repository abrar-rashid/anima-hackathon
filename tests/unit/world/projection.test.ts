import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { replayTrace } from '@/domain/twin'
import type { EventEnvelope, ProtocolVersion } from '@/domain/types'
import { project } from '@/world/projection'
import type { WorldProjectionInput } from '@/world/types'
import { WORLD_SITES } from '@/world/types'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function loadJson<T>(relative: string): T {
  return JSON.parse(readFileSync(join(root, relative), 'utf8')) as T
}

const WORLD = 'team-ea32f6302052'
const T0 = 1_789_286_400_000
const CAPTURED_AT = '2026-09-12T12:12:40.886Z'
const caseSeed = { caseId: 'case-after-hours-timeout', patientId: 'SIM-000001' }

const v3 = loadJson<ProtocolVersion>('fixtures/protocols/v3.json')
const trace = loadJson<EventEnvelope[]>('fixtures/traces/after-hours-timeout.json')

function settledInput(
  protocol: ProtocolVersion,
  now = T0 + 300 * 60_000,
): WorldProjectionInput {
  const run = replayTrace(trace, protocol, caseSeed)
  return {
    cases: [{ case: run.finalState, eventLog: run.finalState.eventLog }],
    clock: { now, paused: true, speed: 60 },
    world: WORLD,
    replay: { label: 'Recorded simulator replay', capturedAt: CAPTURED_AT },
  }
}

describe('world projection', () => {
  it('returns a deep-equal snapshot when given the same input twice', () => {
    const input = settledInput(v3)
    const first = project(input)
    const second = project(input)
    expect(second).toEqual(first)
    expect(JSON.parse(JSON.stringify(second))).toEqual(JSON.parse(JSON.stringify(first)))
  })

  it('does not mutate its input', () => {
    const input = settledInput(v3)
    const before = JSON.stringify(input)
    project(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('gives every entity a non-empty owner district that exists in the snapshot', () => {
    const snapshot = project(settledInput(v3))
    expect(snapshot.entities.length).toBeGreaterThan(0)
    for (const entity of snapshot.entities) {
      expect(entity.ownerTeamId.length).toBeGreaterThan(0)
      const district = snapshot.districts.find((row) => row.teamId === entity.ownerTeamId)
      expect(district).toBeDefined()
      expect(district?.ownedEntityIds).toContain(entity.entityId)
    }
  })

  it('carries the world id and an honest denominator for one trace', () => {
    const input = settledInput(v3)
    const snapshot = project(input)
    expect(snapshot.provenance.world).toBe(WORLD)
    expect(snapshot.provenance.denominator.cases).toBe(input.cases.length)
    expect(snapshot.provenance.denominator.events).toBe(input.cases[0]!.eventLog.length)
    expect(snapshot.provenance.denominator.events).toBe(snapshot.events.length)
    expect(snapshot.provenance.denominator.cases).toBe(1)
  })

  it('labels a captured replay with the verbatim recorded-simulator-replay text and capture time', () => {
    const snapshot = project(settledInput(v3))
    expect(snapshot.provenance.replay).toEqual({
      label: 'Recorded simulator replay',
      capturedAt: CAPTURED_AT,
    })
    expect(snapshot.paused).toBe(true)
    expect(snapshot.speed).toBe(60)
  })

  it('projects the source-supplied CRP facts without inferring severity', () => {
    const snapshot = project(settledInput(v3))
    expect(snapshot.entities).toHaveLength(1)
    const entity = snapshot.entities[0]!
    expect(entity.patientId).toBe('SIM-000001')
    expect(entity.resultId).toBe('blood-v1-SIM-000001-crp-5')
    expect(entity.resultVersion).toBe(1)
    expect(entity.analyteName).toBe('C-reactive protein')
    expect(entity.direction).toBe('above')
    expect(entity.direction === 'above' || entity.direction === 'below').toBe(true)
    const encoded = JSON.stringify(entity)
    expect(encoded).not.toMatch(/severit|urgenc|risk|priority|score/i)
  })

  it('emits WORLD_SITES districts in display order and only real extra teams', () => {
    const snapshot = project(settledInput(v3))
    const siteIds = snapshot.districts.slice(0, WORLD_SITES.length).map((row) => row.teamId)
    expect(siteIds).toEqual([...WORLD_SITES])
    for (const district of snapshot.districts) {
      expect(district.label.length).toBeGreaterThan(0)
    }
  })

  it('sets live provenance.replay to null when no replay capture is supplied', () => {
    const input = settledInput(v3)
    delete input.replay
    const snapshot = project(input)
    expect(snapshot.provenance.replay).toBeNull()
  })

  it('counts events from the supplied log, not an invented population', () => {
    const empty: WorldProjectionInput = {
      cases: [],
      clock: { now: T0, paused: true, speed: 60 },
      world: WORLD,
    }
    const snapshot = project(empty)
    expect(snapshot.entities).toEqual([])
    expect(snapshot.threads).toEqual([])
    expect(snapshot.events).toEqual([])
    expect(snapshot.provenance.denominator).toEqual({ cases: 0, events: 0 })
    expect(snapshot.districts).toHaveLength(WORLD_SITES.length)
  })
})
