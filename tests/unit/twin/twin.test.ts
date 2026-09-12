import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { validatePatch } from '@/domain/patch-grammar'
import { compare, replayTrace } from '@/domain/twin'
import type { EventEnvelope, ProtocolVersion } from '@/domain/types'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function loadJson<T>(relative: string): T {
  return JSON.parse(readFileSync(join(root, relative), 'utf8')) as T
}

const v3 = loadJson<ProtocolVersion>('fixtures/protocols/v3.json')
const v4 = loadJson<ProtocolVersion>('fixtures/protocols/v4.json')
const trace = loadJson<EventEnvelope[]>('fixtures/traces/after-hours-timeout.json')
const caseSeed = { caseId: 'case-after-hours-timeout', patientId: 'SIM-000001' }

function sha256Trace(events: EventEnvelope[]): string {
  return createHash('sha256').update(JSON.stringify(events)).digest('hex')
}

function first(log: EventEnvelope[], type: EventEnvelope['event']['type']): EventEnvelope | undefined {
  return log.find((envelope) => envelope.event.type === type)
}

describe('operational-latency twin', () => {
  it('computes candidate.metrics.acceptedOwnerLatencyMin < baseline.metrics.acceptedOwnerLatencyMin', () => {
    const baseline = replayTrace(trace, v3, caseSeed)
    const candidate = replayTrace(trace, v4, caseSeed)
    expect(candidate.metrics.acceptedOwnerLatencyMin).not.toBeNull()
    expect(baseline.metrics.acceptedOwnerLatencyMin).not.toBeNull()
    expect(candidate.metrics.acceptedOwnerLatencyMin!).toBeLessThan(baseline.metrics.acceptedOwnerLatencyMin!)

    const transfer = first(trace, 'TransferRequested')
    const dutyAccept = trace.find(
      (envelope) =>
        envelope.event.type === 'TransferAccepted' &&
        envelope.event.actor.id === 'gp-duty-1',
    )
    expect(transfer).toBeDefined()
    expect(dutyAccept).toBeDefined()
    expect(candidate.metrics.acceptedOwnerLatencyMin).toBe(
      (dutyAccept!.simulatorTime - transfer!.simulatorTime) / 60_000,
    )
  })

  it('computes baseline.metrics.timeouts === 1', () => {
    const baseline = replayTrace(trace, v3, caseSeed)
    expect(baseline.metrics.timeouts).toBe(1)
  })

  it('computes candidate.metrics.timeouts === 0', () => {
    const candidate = replayTrace(trace, v4, caseSeed)
    expect(candidate.metrics.timeouts).toBe(0)
  })

  it('proves sameTrace === true via a shared sha-256 of the trace JSON', () => {
    const traceHash = sha256Trace(trace)
    const baseline = replayTrace(trace, v3, caseSeed)
    const candidate = replayTrace(trace, v4, caseSeed)
    const result = compare(baseline, candidate)

    expect(sha256Trace(trace)).toBe(traceHash)
    expect(result.sameTrace).toBe(true)
    expect(traceHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns FAILED_INVARIANTS when a candidate with dedupeWindowMinutes: 0 and ackDeadlineMinutes: 1 produces more exceptions than baseline (invariant 10)', () => {
    const baseline = replayTrace(trace, v4, caseSeed)
    const patched = validatePatch(v4, { dedupeWindowMinutes: 0, ackDeadlineMinutes: 1 })
    expect(patched.ok).toBe(true)
    if (!patched.ok) return

    const worse = replayTrace(trace, patched.candidate, caseSeed)
    expect(worse.finalState.exceptionsEmitted.length).toBeGreaterThan(
      baseline.finalState.exceptionsEmitted.length,
    )

    const result = compare(baseline, worse)
    expect(result.candidateStatus).toBe('FAILED_INVARIANTS')
    expect(result.candidate.invariants.some((row) => row.id === 10 && !row.passed)).toBe(true)
  })

  it('computes two manual chases on the v3 replay', () => {
    const baseline = replayTrace(trace, v3, caseSeed)
    expect(baseline.metrics.manualChases).toBe(baseline.finalState.manualChases)
    expect(baseline.metrics.manualChases).toBe(2)
  })

  it('computes zero exceptions under v4', () => {
    const candidate = replayTrace(trace, v4, caseSeed)
    expect(candidate.finalState.exceptionsEmitted).toHaveLength(0)
    expect(candidate.metrics.duplicateAlerts).toBe(0)
    expect(candidate.metrics.timeouts).toBe(0)
  })
})
