import { describe, expect, it } from 'vitest'

import type { CovenantCase, EventEnvelope, OwnershipState } from '@/domain/types'
import {
  accountableAcceptanceAt,
  districtLabel,
  eventDetail,
  eventDistrict,
  minutesBetween,
  neglectMinutes,
  overdueMinutes,
  threadStateFromOwnership,
} from '@/world/derive'

const T0 = 1_789_286_400_000

function envelope(event: EventEnvelope['event'], at: number, eventId: string = event.type): EventEnvelope {
  return {
    eventId,
    caseId: 'case-after-hours-timeout',
    simulatorTime: at,
    actor: 'test',
    event,
  }
}

function baseCase(overrides: Partial<CovenantCase> = {}): CovenantCase {
  return {
    caseId: 'case-after-hours-timeout',
    patientId: 'SIM-000001',
    sourceResultId: 'blood-v1-SIM-000001-crp-5',
    sourceResultVersion: 1,
    sourceClassification: {
      rule: 'source-reference-range',
      ruleText: 'An analyte value lies outside the reference range supplied by the source laboratory (referenceLow..referenceHigh). No urgency, diagnosis or treatment is inferred.',
      analyteId: 'crp',
      analyteName: 'C-reactive protein',
      value: 5.6,
      unit: 'mg/L',
      referenceLow: 0,
      referenceHigh: 5,
      direction: 'above',
    },
    orderingTeamId: 'hospital',
    currentAccountableOwner: { teamId: 'hospital' },
    requestedReceiver: 'gp',
    acceptingActor: null,
    protocolVersion: 'v3',
    ownershipState: 'TRANSFER_REQUESTED',
    closureState: 'PLAN_RECORDED',
    submissionState: 'NOT_SUBMITTED',
    deadlines: { ackDeadlineAt: T0 + 140 * 60_000 },
    evidenceRefs: [],
    exceptionsEmitted: [],
    duplicateSuppressed: 0,
    manualChases: 0,
    eventLog: [],
    ...overrides,
  }
}

describe('world derive', () => {
  it('maps ownership state to thread state without using HTTP status', () => {
    const mapping: Record<OwnershipState, ReturnType<typeof threadStateFromOwnership>> = {
      ORDERER_OWNS: null,
      TRANSFER_REQUESTED: 'REQUESTED',
      ACCEPTED: 'ACCEPTED',
      DECLINED: 'DECLINED',
      OVERDUE: 'OVERDUE',
      OWNER_UNAVAILABLE: 'RECEIVER_UNAVAILABLE',
      STALE: 'STALE',
    }
    for (const [ownership, expected] of Object.entries(mapping)) {
      expect(threadStateFromOwnership(ownership as OwnershipState)).toBe(expected)
    }
  })

  it('computes neglect minutes from ResultAvailable to now until an accountable accept', () => {
    const available = envelope(
      {
        type: 'ResultAvailable',
        resultId: 'blood-v1-SIM-000001-crp-5',
        resultVersion: 1,
        orderingTeamId: 'hospital',
        requestedReceiver: 'gp',
        classification: baseCase().sourceClassification,
      },
      T0,
    )
    const log = [available]
    const covenant = baseCase({ eventLog: log, ownershipState: 'TRANSFER_REQUESTED' })

    const later = T0 + 90 * 60_000
    const earlier = T0 + 30 * 60_000
    expect(neglectMinutes(covenant, log, later)).toBeGreaterThan(neglectMinutes(covenant, log, earlier))
    expect(neglectMinutes(covenant, log, later)).toBe(minutesBetween(T0, later))
  })

  it('freezes neglect at the accountable acceptance, ignoring a rejected earlier accept in the raw log', () => {
    const available = envelope(
      {
        type: 'ResultAvailable',
        resultId: 'blood-v1-SIM-000001-crp-5',
        resultVersion: 1,
        orderingTeamId: 'hospital',
        requestedReceiver: 'gp',
        classification: baseCase().sourceClassification,
      },
      T0,
    )
    const rejectedDuty = envelope(
      {
        type: 'TransferAccepted',
        actor: {
          id: 'gp-duty-1',
          name: 'Dr. Elena Voss',
          role: 'duty-clinician',
          teamId: 'gp',
          attribution: 'app-side',
        },
      },
      T0 + 45 * 60_000,
      'evt-transfer-accepted-duty',
    )
    const named = envelope(
      {
        type: 'TransferAccepted',
        actor: {
          id: 'gp-dr-named',
          name: 'Dr. James Okonkwo',
          role: 'gp-partner',
          teamId: 'gp',
          attribution: 'app-side',
        },
      },
      T0 + 260 * 60_000,
      'evt-transfer-accepted-named',
    )
    const rawLog = [available, rejectedDuty, named]
    const settledLog = [available, named]
    const covenant = baseCase({
      ownershipState: 'ACCEPTED',
      acceptingActor: {
        id: 'gp-dr-named',
        name: 'Dr. James Okonkwo',
        role: 'gp-partner',
        teamId: 'gp',
        attribution: 'app-side',
      },
      currentAccountableOwner: { teamId: 'gp', actorId: 'gp-dr-named' },
      eventLog: settledLog,
    })

    expect(accountableAcceptanceAt(covenant, rawLog)).toBe(named.simulatorTime)
    const frozen = neglectMinutes(covenant, rawLog, T0 + 300 * 60_000)
    expect(frozen).toBe(minutesBetween(T0, named.simulatorTime))
    expect(frozen).toBe(neglectMinutes(covenant, rawLog, T0 + 400 * 60_000))
  })

  it('computes overdue minutes from the deadline and clock, and zeros after acceptance', () => {
    const deadline = T0 + 120 * 60_000
    const before = overdueMinutes(deadline, T0 + 60 * 60_000, 'REQUESTED')
    const after = overdueMinutes(deadline, T0 + 150 * 60_000, 'OVERDUE')
    expect(before).toBe(0)
    expect(after).toBeGreaterThan(0)
    expect(after).toBe(minutesBetween(deadline, T0 + 150 * 60_000))
    expect(overdueMinutes(deadline, T0 + 200 * 60_000, 'ACCEPTED')).toBe(0)
    expect(overdueMinutes(null, T0 + 200 * 60_000, 'REQUESTED')).toBe(0)
  })

  it('builds event detail from the event fields only', () => {
    expect(eventDetail({ type: 'TransferTimedOut' })).toBe('TransferTimedOut')
    expect(eventDetail({ type: 'ClockTick', now: T0 })).toBe(`ClockTick now=${T0}`)
    expect(eventDistrict({ type: 'ClockTick', now: T0 })).toBeNull()
    expect(eventDistrict({ type: 'ManualChase', byTeam: 'hospital' })).toBe('hospital')
    expect(districtLabel('gp-duty')).toBe('GP duty')
  })
})
