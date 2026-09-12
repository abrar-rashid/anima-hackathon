import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { ELIGIBILITY_RULE_TEXT } from '@/domain/eligibility'
import type { DomainEvent, EventEnvelope, EvidenceRef, ProtocolVersion, StaffIdentity } from '@/domain/types'
import { aggregateCaseMetrics } from '@/metrics/aggregate'
import { computeCaseMetrics } from '@/metrics/compute'
import { SMALL_N_THRESHOLD } from '@/metrics/definitions'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const afterHours = JSON.parse(
  readFileSync(join(root, 'fixtures/traces/after-hours-timeout.json'), 'utf8'),
) as EventEnvelope[]
const v3 = JSON.parse(readFileSync(join(root, 'fixtures/protocols/v3.json'), 'utf8')) as ProtocolVersion
const v4 = JSON.parse(readFileSync(join(root, 'fixtures/protocols/v4.json'), 'utf8')) as ProtocolVersion

const T0 = 1_789_286_400_000
const AFTER_HOURS_NOW = T0 + 300 * 60_000

const ACCOUNTABLE: ProtocolVersion = {
  id: 'v-accountable',
  supersedes: null,
  receiverMode: 'ACCOUNTABLE_TEAM',
  ackDeadlineMinutes: 30,
  fallbackTeamId: 'gp-duty',
  exceptionRoute: 'duty-clinician-task',
  dedupeWindowMinutes: 15,
  clinicalPolicyRefs: ['local-abnormal-result-policy-2026'],
  approval: { status: 'DRAFT', approvers: [], rollbackTarget: null },
}

const gp: StaffIdentity = {
  id: 'gp-duty-1',
  name: 'Dr Ada Sim',
  role: 'Duty GP',
  teamId: 'gp',
  attribution: 'app-side',
}

const hospital: StaffIdentity = {
  id: 'hosp-1',
  name: 'Dr Morgan Bell',
  role: 'Hospital clinician',
  teamId: 'hospital',
  attribution: 'app-side',
}

function evidence(eventType: string, resourceId: string, at: number): EvidenceRef {
  return {
    site: 'gp',
    resourceId,
    resourceVersion: 1,
    observedAtSimulatorTime: at,
    eventType,
  }
}

function envelope(eventId: string, event: DomainEvent, at: number, caseId: string): EventEnvelope {
  return {
    eventId,
    caseId,
    simulatorTime: at,
    actor: 'test',
    sourceVersion: 1,
    event,
  }
}

function resultAvailable(at: number, caseId: string): EventEnvelope {
  return envelope(
    `${caseId}-result`,
    {
      type: 'ResultAvailable',
      resultId: `blood-${caseId}`,
      resultVersion: 1,
      orderingTeamId: 'hospital',
      requestedReceiver: 'gp',
      classification: {
        rule: 'source-reference-range',
        ruleText: ELIGIBILITY_RULE_TEXT,
        analyteId: 'crp',
        analyteName: 'C-reactive protein',
        value: 6,
        unit: 'mg/L',
        referenceLow: 0,
        referenceHigh: 5,
        direction: 'above',
      },
    },
    at,
    caseId,
  )
}

function closedPathway(start: number, caseId: string, acceptAtMin: number): EventEnvelope[] {
  const t = (minutes: number) => start + minutes * 60_000
  return [
    resultAvailable(start, caseId),
    envelope(`${caseId}-review`, { type: 'ClinicalReviewRecorded', actor: hospital }, t(2), caseId),
    envelope(
      `${caseId}-plan`,
      { type: 'PlanRecorded', actor: hospital, planRef: evidence('PlanRecorded', `${caseId}-plan`, t(3)) },
      t(3),
      caseId,
    ),
    envelope(
      `${caseId}-transfer`,
      { type: 'TransferRequested', toTeam: 'gp', ackDeadlineAt: t(acceptAtMin + 30) },
      t(4),
      caseId,
    ),
    envelope(`${caseId}-accept`, { type: 'TransferAccepted', actor: gp }, t(acceptAtMin), caseId),
    envelope(
      `${caseId}-contact`,
      { type: 'PatientContactEvidenced', evidence: evidence('PatientContactEvidenced', `${caseId}-msg`, t(acceptAtMin + 2)) },
      t(acceptAtMin + 2),
      caseId,
    ),
    envelope(
      `${caseId}-visible`,
      { type: 'ActionVisibleDownstream', evidence: evidence('ActionVisibleDownstream', `${caseId}-task`, t(acceptAtMin + 3)) },
      t(acceptAtMin + 3),
      caseId,
    ),
    envelope(
      `${caseId}-activity`,
      { type: 'ActivityEvidenced', evidence: evidence('ActivityEvidenced', `${caseId}-task`, t(acceptAtMin + 3)) },
      t(acceptAtMin + 3),
      caseId,
    ),
    envelope(
      `${caseId}-outcome`,
      { type: 'OutcomeEvidenced', evidence: evidence('OutcomeEvidenced', `${caseId}-out`, t(acceptAtMin + 6)) },
      t(acceptAtMin + 6),
      caseId,
    ),
  ]
}

function hasDenominator(value: { denominator: { cases: number; events: number; traces: number } }): void {
  expect(value.denominator.cases).toBeGreaterThanOrEqual(0)
  expect(value.denominator.events).toBeGreaterThanOrEqual(0)
  expect(value.denominator.traces).toBeGreaterThanOrEqual(0)
  expect(Object.keys(value.denominator).sort()).toEqual(['cases', 'events', 'traces'])
}

describe('population aggregation', () => {
  const openV3 = computeCaseMetrics({
    events: afterHours,
    protocol: v3,
    clock: { now: AFTER_HOURS_NOW },
    patientId: 'SIM-000001',
    caseId: 'case-after-hours-timeout',
  })
  const openV4 = computeCaseMetrics({
    events: afterHours,
    protocol: v4,
    clock: { now: AFTER_HOURS_NOW },
    patientId: 'SIM-000001',
    caseId: 'case-after-hours-timeout',
  })
  const closedFast = computeCaseMetrics({
    events: closedPathway(T0, 'case-fast', 8),
    protocol: ACCOUNTABLE,
    clock: { now: T0 + 20 * 60_000 },
    patientId: 'SIM-000002',
    caseId: 'case-fast',
  })
  const closedSlow = computeCaseMetrics({
    events: closedPathway(T0, 'case-slow', 18),
    protocol: ACCOUNTABLE,
    clock: { now: T0 + 30 * 60_000 },
    patientId: 'SIM-000003',
    caseId: 'case-slow',
  })

  it('every aggregate carries a denominator with cases, events, and traces', () => {
    const population = aggregateCaseMetrics([openV3, closedFast, closedSlow])

    hasDenominator(population.latencies.accepted_owner_latency)
    hasDenominator(population.latencies.orderer_unaccepted)
    hasDenominator(population.latencies.time_to_clinical_review)
    hasDenominator(population.latencies.time_to_plan_recorded)
    hasDenominator(population.latencies.time_to_patient_contact)
    hasDenominator(population.latencies.time_to_action_evidence)
    hasDenominator(population.latencies.time_to_outcome_evidence)
    hasDenominator(population.latencies.time_to_closed)
    hasDenominator(population.counts.timeouts)
    hasDenominator(population.counts.exceptions)
    hasDenominator(population.counts.manualChases)
    hasDenominator(population.counts.duplicateAlerts)
    hasDenominator(population.counts.reopens)
    hasDenominator(population.closure.closed)
    hasDenominator(population.closure.open)
    hasDenominator(population.closure.overdue)
    hasDenominator(population.closure.neverClosed)
    hasDenominator(population.smallN)
    for (const row of population.stalledByStep) hasDenominator(row)
    for (const row of population.timeInState) hasDenominator(row)
  })

  it('one after-hours trace is one trace in the denominator', () => {
    const population = aggregateCaseMetrics([openV3])
    expect(population.smallN.denominator).toEqual({
      cases: 1,
      events: afterHours.length,
      traces: 1,
    })
    expect(population.latencies.accepted_owner_latency.denominator.traces).toBe(1)
  })

  it('distributions use completed observations only and keep open work out of the median', () => {
    const population = aggregateCaseMetrics([openV3, closedFast, closedSlow])
    const closed = population.latencies.time_to_closed

    expect(closed.completedN).toBe(2)
    expect(closed.openN).toBe(1)
    expect(closed.missingN).toBe(0)
    expect(closed.median).not.toBeNull()
    expect(closedFast.latencies.time_to_closed.status).toBe('completed')
    expect(closedSlow.latencies.time_to_closed.status).toBe('completed')
    if (closedFast.latencies.time_to_closed.status !== 'completed') return
    if (closedSlow.latencies.time_to_closed.status !== 'completed') return
    const expected = [closedFast.latencies.time_to_closed.minutes, closedSlow.latencies.time_to_closed.minutes].sort(
      (a, b) => a - b,
    )
    expect(closed.median).toBe((expected[0]! + expected[1]!) / 2)
    expect(openV3.latencies.time_to_closed.status).toBe('open')
  })

  it('open work is counted separately and never folded into completed latency', () => {
    const population = aggregateCaseMetrics([openV3, openV4])
    const action = population.latencies.time_to_action_evidence
    expect(action.completedN).toBe(0)
    expect(action.openN).toBe(2)
    expect(action.median).toBeNull()
    expect(action.highPercentile).toBeNull()
  })

  it('missing values are counted missing, not filled', () => {
    const empty = computeCaseMetrics({
      events: [],
      protocol: ACCOUNTABLE,
      clock: { now: T0 },
      patientId: 'SIM-000099',
      caseId: 'case-empty',
    })
    const population = aggregateCaseMetrics([empty])
    expect(population.latencies.time_to_clinical_review.missingN).toBe(1)
    expect(population.latencies.time_to_clinical_review.median).toBeNull()
    expect(population.latencies.time_to_clinical_review.highPercentile).toBeNull()
  })

  it('small-n flag is true when the completed sample is below the threshold', () => {
    const population = aggregateCaseMetrics([openV3, closedFast, closedSlow])
    expect(population.latencies.accepted_owner_latency.completedN).toBeLessThan(SMALL_N_THRESHOLD)
    expect(population.latencies.accepted_owner_latency.tooSmallToGeneralise).toBe(true)
    expect(population.smallN.tooSmallToGeneralise).toBe(true)
    expect(population.smallN.threshold).toBe(SMALL_N_THRESHOLD)
  })

  it('stalled-by-step counts carry a denominator and do not treat open work as complete', () => {
    const population = aggregateCaseMetrics([openV3, closedFast])
    const action = population.stalledByStep.find((row) => row.step === 'action_evidence')
    expect(action).toBeDefined()
    expect(action?.open).toBeGreaterThanOrEqual(1)
    expect(action?.denominator.cases).toBe(2)
    expect(closedFast.stalledStep).toBeNull()
  })

  it('v4 population accepted-owner median is lower than v3 when both close on the same trace', () => {
    const v3Pop = aggregateCaseMetrics([openV3])
    const v4Pop = aggregateCaseMetrics([openV4])
    expect(v3Pop.latencies.accepted_owner_latency.median).not.toBeNull()
    expect(v4Pop.latencies.accepted_owner_latency.median).not.toBeNull()
    expect(v4Pop.latencies.accepted_owner_latency.median!).toBeLessThan(v3Pop.latencies.accepted_owner_latency.median!)
  })
})
