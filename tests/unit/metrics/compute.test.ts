import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ELIGIBILITY_RULE_TEXT } from '@/domain/eligibility'
import type { DomainEvent, EventEnvelope, EvidenceRef, ProtocolVersion, StaffIdentity } from '@/domain/types'
import { computeCaseMetrics, computeLedgerTaskOutcomes } from '@/metrics/compute'
import type { LedgerTaskObservation } from '@/metrics/definitions'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function loadJson<T>(relative: string): T {
  return JSON.parse(readFileSync(join(root, relative), 'utf8')) as T
}

const v3 = loadJson<ProtocolVersion>('fixtures/protocols/v3.json')
const v4 = loadJson<ProtocolVersion>('fixtures/protocols/v4.json')
const afterHours = loadJson<EventEnvelope[]>('fixtures/traces/after-hours-timeout.json')

const T0 = 1_789_286_400_000
const AFTER_HOURS_NOW = T0 + 300 * 60_000
const PATIENT = 'SIM-000001'
const CASE_ID = 'case-after-hours-timeout'

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

function first(log: EventEnvelope[], type: DomainEvent['type']): EventEnvelope | undefined {
  return log.find((envelope) => envelope.event.type === type)
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

function envelope(eventId: string, event: DomainEvent, at: number, caseId = 'case-synth'): EventEnvelope {
  return {
    eventId,
    caseId,
    simulatorTime: at,
    actor: 'test',
    sourceVersion: 1,
    event,
  }
}

function resultAvailable(at: number, caseId = 'case-synth'): EventEnvelope {
  return envelope(
    `${caseId}-result`,
    {
      type: 'ResultAvailable',
      resultId: 'blood-v1-SIM-000002-crp-1',
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

function closedPathway(start: number, caseId: string): EventEnvelope[] {
  const t = (minutes: number) => start + minutes * 60_000
  return [
    resultAvailable(start, caseId),
    envelope(`${caseId}-review`, { type: 'ClinicalReviewRecorded', actor: hospital }, t(5), caseId),
    envelope(
      `${caseId}-plan`,
      { type: 'PlanRecorded', actor: hospital, planRef: evidence('PlanRecorded', `${caseId}-plan`, t(6)) },
      t(6),
      caseId,
    ),
    envelope(
      `${caseId}-transfer`,
      { type: 'TransferRequested', toTeam: 'gp', ackDeadlineAt: t(36) },
      t(7),
      caseId,
    ),
    envelope(`${caseId}-accept`, { type: 'TransferAccepted', actor: gp }, t(10), caseId),
    envelope(
      `${caseId}-contact`,
      { type: 'PatientContactEvidenced', evidence: evidence('PatientContactEvidenced', `${caseId}-msg`, t(12)) },
      t(12),
      caseId,
    ),
    envelope(
      `${caseId}-visible`,
      { type: 'ActionVisibleDownstream', evidence: evidence('ActionVisibleDownstream', `${caseId}-task`, t(14)) },
      t(14),
      caseId,
    ),
    envelope(
      `${caseId}-activity`,
      { type: 'ActivityEvidenced', evidence: evidence('ActivityEvidenced', `${caseId}-task`, t(14)) },
      t(14),
      caseId,
    ),
    envelope(
      `${caseId}-outcome`,
      { type: 'OutcomeEvidenced', evidence: evidence('OutcomeEvidenced', `${caseId}-out`, t(20)) },
      t(20),
      caseId,
    ),
  ]
}

describe('per-case metrics from replayed events', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('v4 accepted-owner latency is lower than v3 on the same after-hours trace', () => {
    const clock = { now: AFTER_HOURS_NOW }
    const baseline = computeCaseMetrics({
      events: afterHours,
      protocol: v3,
      clock,
      patientId: PATIENT,
      caseId: CASE_ID,
    })
    const candidate = computeCaseMetrics({
      events: afterHours,
      protocol: v4,
      clock,
      patientId: PATIENT,
      caseId: CASE_ID,
    })

    expect(baseline.latencies.accepted_owner_latency.status).toBe('completed')
    expect(candidate.latencies.accepted_owner_latency.status).toBe('completed')
    if (baseline.latencies.accepted_owner_latency.status !== 'completed') return
    if (candidate.latencies.accepted_owner_latency.status !== 'completed') return
    expect(candidate.latencies.accepted_owner_latency.minutes).toBeLessThan(
      baseline.latencies.accepted_owner_latency.minutes,
    )
  })

  it('acceptance relationship is computed from replayed events, not a hard-coded constant', () => {
    const transfer = first(afterHours, 'TransferRequested')
    const named = afterHours.find(
      (row) => row.event.type === 'TransferAccepted' && row.event.actor.id === 'gp-dr-named',
    )
    const duty = afterHours.find(
      (row) => row.event.type === 'TransferAccepted' && row.event.actor.id === 'gp-duty-1',
    )
    expect(transfer).toBeDefined()
    expect(named).toBeDefined()
    expect(duty).toBeDefined()

    const baseline = computeCaseMetrics({
      events: afterHours,
      protocol: v3,
      clock: { now: AFTER_HOURS_NOW },
      patientId: PATIENT,
      caseId: CASE_ID,
    })
    const candidate = computeCaseMetrics({
      events: afterHours,
      protocol: v4,
      clock: { now: AFTER_HOURS_NOW },
      patientId: PATIENT,
      caseId: CASE_ID,
    })

    expect(baseline.latencies.accepted_owner_latency).toMatchObject({
      status: 'completed',
      minutes: (named!.simulatorTime - transfer!.simulatorTime) / 60_000,
    })
    expect(candidate.latencies.accepted_owner_latency).toMatchObject({
      status: 'completed',
      minutes: (duty!.simulatorTime - transfer!.simulatorTime) / 60_000,
    })
  })

  it('v3 replay computes one timeout and more exceptions than v4', () => {
    const clock = { now: AFTER_HOURS_NOW }
    const baseline = computeCaseMetrics({
      events: afterHours,
      protocol: v3,
      clock,
      patientId: PATIENT,
      caseId: CASE_ID,
    })
    const candidate = computeCaseMetrics({
      events: afterHours,
      protocol: v4,
      clock,
      patientId: PATIENT,
      caseId: CASE_ID,
    })

    expect(baseline.counts.timeouts).toBe(1)
    expect(candidate.counts.timeouts).toBe(0)
    expect(baseline.counts.exceptions).toBeGreaterThan(candidate.counts.exceptions)
    expect(candidate.counts.exceptions).toBe(0)
  })

  it('v4 replay computes zero timeouts and zero exceptions', () => {
    const candidate = computeCaseMetrics({
      events: afterHours,
      protocol: v4,
      clock: { now: AFTER_HOURS_NOW },
      patientId: PATIENT,
      caseId: CASE_ID,
    })
    expect(candidate.counts.timeouts).toBe(0)
    expect(candidate.counts.exceptions).toBe(0)
    expect(candidate.counts.duplicateAlerts).toBe(0)
  })

  it('after-hours case is open, not completed, with elapsed time from result availability', () => {
    const metrics = computeCaseMetrics({
      events: afterHours,
      protocol: v3,
      clock: { now: AFTER_HOURS_NOW },
      patientId: PATIENT,
      caseId: CASE_ID,
    })

    expect(metrics.closure.outcome).toBe('open')
    expect(metrics.latencies.time_to_closed.status).toBe('open')
    if (metrics.latencies.time_to_closed.status !== 'open') return
    expect(metrics.latencies.time_to_closed.minutes).toBeNull()
    expect(metrics.latencies.time_to_closed.elapsedMinutes).toBe(300)
    expect(metrics.tasks.every((task) => task.completionMinutes === null || task.outcome === 'closed')).toBe(true)
    expect(metrics.tasks.some((task) => task.outcome === 'open' && task.completionMinutes === null)).toBe(true)
  })

  it('action and outcome evidence are open, never imputed as complete', () => {
    const metrics = computeCaseMetrics({
      events: afterHours,
      protocol: v4,
      clock: { now: AFTER_HOURS_NOW },
      patientId: PATIENT,
      caseId: CASE_ID,
    })

    expect(metrics.latencies.time_to_action_evidence.status).toBe('open')
    expect(metrics.latencies.time_to_outcome_evidence.status).toBe('open')
    expect(metrics.latencies.time_to_action_evidence.minutes).toBeNull()
    expect(metrics.latencies.time_to_outcome_evidence.minutes).toBeNull()
    expect(metrics.stalledStep).toBe('action_evidence')
  })

  it('same log and clock always produce the same metrics', () => {
    const input = {
      events: afterHours,
      protocol: v3,
      clock: { now: AFTER_HOURS_NOW },
      patientId: PATIENT,
      caseId: CASE_ID,
    }
    expect(computeCaseMetrics(input)).toEqual(computeCaseMetrics(input))
  })

  it('does not call Date.now', () => {
    const spy = vi.spyOn(Date, 'now')
    computeCaseMetrics({
      events: afterHours,
      protocol: v3,
      clock: { now: AFTER_HOURS_NOW },
      patientId: PATIENT,
      caseId: CASE_ID,
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('closed pathway reports completion latencies and a closed outcome', () => {
    const start = T0
    const events = closedPathway(start, 'case-closed')
    const metrics = computeCaseMetrics({
      events,
      protocol: ACCOUNTABLE,
      clock: { now: start + 20 * 60_000 },
      patientId: 'SIM-000002',
      caseId: 'case-closed',
    })

    expect(metrics.closure.outcome).toBe('closed')
    expect(metrics.latencies.time_to_closed).toMatchObject({ status: 'completed', minutes: 20 })
    expect(metrics.latencies.accepted_owner_latency).toMatchObject({ status: 'completed', minutes: 3 })
    expect(metrics.stalledStep).toBeNull()
  })

  it('past acknowledgement deadline without acceptance is overdue with elapsed time', () => {
    const start = T0
    const events = [
      resultAvailable(start, 'case-overdue'),
      envelope(
        'case-overdue-transfer',
        { type: 'TransferRequested', toTeam: 'gp', toActorId: 'gp-dr-named', ackDeadlineAt: start + 30 * 60_000 },
        start + 5 * 60_000,
        'case-overdue',
      ),
    ]
    const metrics = computeCaseMetrics({
      events,
      protocol: { ...ACCOUNTABLE, receiverMode: 'NAMED_ACTOR', ackDeadlineMinutes: 30 },
      clock: { now: start + 90 * 60_000 },
      patientId: 'SIM-000003',
      caseId: 'case-overdue',
    })

    expect(metrics.closure.outcome).toBe('overdue')
    expect(metrics.latencies.accepted_owner_latency.status).toBe('open')
    expect(metrics.latencies.accepted_owner_latency.minutes).toBeNull()
    if (metrics.latencies.accepted_owner_latency.status !== 'open') return
    expect(metrics.latencies.accepted_owner_latency.elapsedMinutes).toBe(85)
  })

  it('terminal contact failure is never_closed, not a completed latency', () => {
    const start = T0
    const events = [
      resultAvailable(start, 'case-unreached'),
      envelope('case-unreached-review', { type: 'ClinicalReviewRecorded', actor: hospital }, start + 5 * 60_000, 'case-unreached'),
      envelope(
        'case-unreached-plan',
        { type: 'PlanRecorded', actor: hospital, planRef: evidence('PlanRecorded', 'plan-1', start + 6 * 60_000) },
        start + 6 * 60_000,
        'case-unreached',
      ),
      envelope(
        'case-unreached-fail',
        { type: 'PatientContactFailed', messageId: 'msg-missed' },
        start + 12 * 60_000,
        'case-unreached',
      ),
    ]
    const metrics = computeCaseMetrics({
      events,
      protocol: ACCOUNTABLE,
      clock: { now: start + 40 * 60_000 },
      patientId: 'SIM-000004',
      caseId: 'case-unreached',
    })

    expect(metrics.closure.outcome).toBe('never_closed')
    expect(metrics.latencies.time_to_patient_contact.status).toBe('open')
    expect(metrics.latencies.time_to_patient_contact.minutes).toBeNull()
    expect(metrics.latencies.time_to_closed.status).toBe('open')
  })

  it('time-in-state records dwell and censors the current state', () => {
    const start = T0
    const events = closedPathway(start, 'case-dwell')
    const metrics = computeCaseMetrics({
      events,
      protocol: ACCOUNTABLE,
      clock: { now: start + 20 * 60_000 },
      patientId: 'SIM-000002',
      caseId: 'case-dwell',
    })

    const closedDwell = metrics.timeInState.find(
      (row) => row.track === 'closure' && row.state === 'CLOSED' && row.censored,
    )
    expect(closedDwell).toBeDefined()
    expect(closedDwell?.exitedAt).toBeNull()
    expect(closedDwell?.minutes).toBe(0)

    const reviewDwell = metrics.timeInState.find(
      (row) => row.track === 'closure' && row.state === 'CLINICALLY_REVIEWED' && !row.censored,
    )
    expect(reviewDwell).toMatchObject({ minutes: 1, enteredAt: start + 5 * 60_000, exitedAt: start + 6 * 60_000 })
  })
})

describe('ledger task outcomes (structural input, not src/tasks)', () => {
  const now = T0 + 120 * 60_000

  it('ledger task still open reports elapsed time and is not counted closed', () => {
    const observations: LedgerTaskObservation[] = [
      {
        episodeId: 'ep-1',
        timestamp: T0,
        taskId: 'task-open',
        status: 'open',
        owner: 'gp',
        deadline: T0 + 240 * 60_000,
      },
    ]

    const outcomes = computeLedgerTaskOutcomes(observations, { now })
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]).toMatchObject({
      taskId: 'task-open',
      outcome: 'open',
      completionMinutes: null,
      elapsedMinutes: 120,
    })
  })

  it('ledger task past deadline is overdue with no completion latency', () => {
    const observations: LedgerTaskObservation[] = [
      {
        episodeId: 'ep-1',
        timestamp: T0,
        taskId: 'task-late',
        status: 'open',
        owner: 'gp',
        deadline: T0 + 30 * 60_000,
      },
    ]

    const outcomes = computeLedgerTaskOutcomes(observations, { now })
    expect(outcomes[0]).toMatchObject({
      outcome: 'overdue',
      completionMinutes: null,
      elapsedMinutes: 120,
    })
  })

  it('ledger task with subsequent episode activity and no close is never_closed', () => {
    const observations: LedgerTaskObservation[] = [
      {
        episodeId: 'ep-1',
        timestamp: T0,
        taskId: 'task-blood',
        status: 'open',
        owner: 'diagnostics',
        deadline: null,
      },
      {
        episodeId: 'ep-1',
        timestamp: T0 + 60 * 60_000,
        taskId: 'task-follow-up',
        status: 'open',
        owner: 'gp',
        deadline: null,
      },
    ]

    const outcomes = computeLedgerTaskOutcomes(observations, { now })
    const blood = outcomes.find((row) => row.taskId === 'task-blood')
    expect(blood).toMatchObject({
      outcome: 'never_closed',
      completionMinutes: null,
    })
  })

  it('closed ledger task reports completion minutes from first open to close', () => {
    const observations: LedgerTaskObservation[] = [
      {
        episodeId: 'ep-2',
        timestamp: T0,
        taskId: 'task-done',
        status: 'open',
        owner: 'gp',
        deadline: T0 + 60 * 60_000,
      },
      {
        episodeId: 'ep-2',
        timestamp: T0 + 15 * 60_000,
        taskId: 'task-done',
        status: 'completed',
        owner: 'gp',
        deadline: T0 + 60 * 60_000,
      },
    ]

    const outcomes = computeLedgerTaskOutcomes(observations, { now })
    expect(outcomes[0]).toMatchObject({
      outcome: 'closed',
      completionMinutes: 15,
      elapsedMinutes: 15,
    })
  })
})
