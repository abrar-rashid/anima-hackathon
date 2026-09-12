import { describe, it, expect } from 'vitest'
import {
  initialCase,
  reduce,
  replayAll,
  type ReduceResult,
} from '@/domain/case-reducer'
import { ELIGIBILITY_RULE_TEXT } from '@/domain/eligibility'
import type {
  CovenantCase,
  DomainEvent,
  EventEnvelope,
  EvidenceRef,
  ProtocolVersion,
  StaffIdentity,
} from '@/domain/types'

const NOW = 1_789_286_400_000

const protocol: ProtocolVersion = {
  id: 'proto-v1',
  supersedes: null,
  receiverMode: 'ACCOUNTABLE_TEAM',
  ackDeadlineMinutes: 30,
  fallbackTeamId: 'gp-duty',
  exceptionRoute: 'duty-clinician-task',
  dedupeWindowMinutes: 15,
  clinicalPolicyRefs: ['policy-a'],
  approval: { status: 'DRAFT', approvers: [], rollbackTarget: null },
}

const namedProtocol: ProtocolVersion = {
  ...protocol,
  id: 'proto-named',
  receiverMode: 'NAMED_ACTOR',
}

const gpClinician: StaffIdentity = {
  id: 'staff-gp-1',
  name: 'Dr GP',
  role: 'gp',
  teamId: 'gp',
  attribution: 'app-side',
}

const hospitalClinician: StaffIdentity = {
  id: 'staff-hosp-1',
  name: 'Dr Hospital',
  role: 'consultant',
  teamId: 'hospital',
  attribution: 'app-side',
}

const classification = {
  rule: 'source-reference-range' as const,
  ruleText: ELIGIBILITY_RULE_TEXT,
  analyteId: 'crp',
  analyteName: 'C-reactive protein',
  value: 5.6,
  unit: 'mg/L',
  referenceLow: 0,
  referenceHigh: 5,
  direction: 'above' as const,
}

function ev(eventType: string, resourceId: string, at = NOW): EvidenceRef {
  return {
    site: 'gp',
    resourceId,
    resourceVersion: 1,
    observedAtSimulatorTime: at,
    eventType,
  }
}

function envelope(eventId: string, event: DomainEvent, at = NOW): EventEnvelope {
  return {
    eventId,
    caseId: 'case-1',
    simulatorTime: at,
    actor: 'test',
    sourceVersion: 1,
    event,
  }
}

function fresh(): CovenantCase {
  return initialCase({ caseId: 'case-1', patientId: 'SIM-000001', protocol })
}

function mustOk(result: ReduceResult): CovenantCase {
  expect(result.ok).toBe(true)
  return result.state
}

function mustFail(result: ReduceResult): { state: CovenantCase; reason: string } {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('expected reduce to fail')
  return { state: result.state, reason: result.reason }
}

function resultAvailable(at = NOW): EventEnvelope {
  return envelope(
    `result-${at}`,
    {
      type: 'ResultAvailable',
      resultId: 'blood-v1-SIM-000001-crp-5',
      resultVersion: 1,
      orderingTeamId: 'hospital',
      requestedReceiver: 'gp',
      classification,
    },
    at,
  )
}

function transferRequested(at = NOW, toActorId?: string): EventEnvelope {
  return envelope(
    `xfer-${at}`,
    {
      type: 'TransferRequested',
      toTeam: 'gp',
      toActorId,
      ackDeadlineAt: 1,
    },
    at,
  )
}

function apply(events: EventEnvelope[], proto: ProtocolVersion = protocol): ReduceResult {
  let state = initialCase({ caseId: 'case-1', patientId: 'SIM-000001', protocol: proto })
  let last: ReduceResult = { ok: true, state }
  for (const e of events) {
    last = reduce(state, e, proto)
    if (!last.ok) return last
    state = last.state
  }
  return last
}

describe('case-reducer', () => {
  it('currentAccountableOwner.teamId is never empty including on initialCase', () => {
    const state = fresh()
    expect(state.currentAccountableOwner.teamId).toBe(protocol.fallbackTeamId)
    expect(state.currentAccountableOwner.teamId.length).toBeGreaterThan(0)
  })

  it('ResultAvailable sets owner = orderingTeamId, ownership ORDERER_OWNS, closure RESULT_AVAILABLE', () => {
    const state = mustOk(apply([resultAvailable()]))
    expect(state.currentAccountableOwner).toEqual({ teamId: 'hospital' })
    expect(state.orderingTeamId).toBe('hospital')
    expect(state.requestedReceiver).toBe('gp')
    expect(state.ownershipState).toBe('ORDERER_OWNS')
    expect(state.closureState).toBe('RESULT_AVAILABLE')
    expect(state.sourceResultId).toBe('blood-v1-SIM-000001-crp-5')
    expect(state.sourceClassification.analyteName).toBe('C-reactive protein')
  })

  it('TransferRequested -> TRANSFER_REQUESTED; owner unchanged; ackDeadlineAt from protocol not payload', () => {
    const requested = mustOk(apply([resultAvailable(), transferRequested(NOW)]))
    expect(requested.ownershipState).toBe('TRANSFER_REQUESTED')
    expect(requested.currentAccountableOwner).toEqual({ teamId: 'hospital' })
    expect(requested.deadlines.ackDeadlineAt).toBe(NOW + protocol.ackDeadlineMinutes * 60_000)
    expect(requested.deadlines.ackDeadlineAt).not.toBe(1)
  })

  it('ActionSubmitted -> SUBMITTED and ActionVisibleDownstream -> VISIBLE_DOWNSTREAM; neither changes ownership or closure', () => {
    const submitted = mustOk(
      apply([
        resultAvailable(),
        envelope('sub-1', {
          type: 'ActionSubmitted',
          actionKind: 'create_task',
          idempotencyKey: 'k1',
          receipt: ev('ActionSubmitted', 'task-1'),
        }),
      ]),
    )
    expect(submitted.submissionState).toBe('SUBMITTED')
    expect(submitted.ownershipState).toBe('ORDERER_OWNS')
    expect(submitted.currentAccountableOwner).toEqual({ teamId: 'hospital' })
    expect(submitted.closureState).toBe('RESULT_AVAILABLE')

    const visible = mustOk(
      reduce(
        submitted,
        envelope('vis-1', {
          type: 'ActionVisibleDownstream',
          evidence: ev('ActionVisibleDownstream', 'task-1'),
        }),
        protocol,
      ),
    )
    expect(visible.submissionState).toBe('VISIBLE_DOWNSTREAM')
    expect(visible.ownershipState).toBe('ORDERER_OWNS')
    expect(visible.currentAccountableOwner).toEqual({ teamId: 'hospital' })
    expect(visible.closureState).toBe('RESULT_AVAILABLE')
  })

  it('transfer does not occur on visibility or submission', () => {
    const state = mustOk(
      apply([
        resultAvailable(),
        envelope('sub-2', {
          type: 'ActionSubmitted',
          actionKind: 'create_task',
          idempotencyKey: 'k2',
          receipt: ev('ActionSubmitted', 'task-2'),
        }),
        envelope('vis-2', {
          type: 'ActionVisibleDownstream',
          evidence: ev('ActionVisibleDownstream', 'task-2'),
        }),
      ]),
    )
    expect(state.ownershipState).toBe('ORDERER_OWNS')
    expect(state.acceptingActor).toBeNull()
  })

  it('TransferAccepted requires TRANSFER_REQUESTED|OVERDUE|OWNER_UNAVAILABLE and actor.teamId === requestedReceiver', () => {
    const beforeRequest = mustOk(apply([resultAvailable()]))
    const tooEarly = reduce(
      beforeRequest,
      envelope('acc-early', { type: 'TransferAccepted', actor: gpClinician }),
      protocol,
    )
    expect(tooEarly.ok).toBe(false)
    expect(tooEarly.state.ownershipState).toBe('ORDERER_OWNS')

    const requested = mustOk(apply([resultAvailable(), transferRequested()]))
    const wrongTeam = reduce(
      requested,
      envelope('acc-wrong', { type: 'TransferAccepted', actor: hospitalClinician }),
      protocol,
    )
    expect(wrongTeam.ok).toBe(false)
    expect(wrongTeam.state.ownershipState).toBe('TRANSFER_REQUESTED')
  })

  it('TransferAccepted from OWNER_UNAVAILABLE is valid under ACCOUNTABLE_TEAM', () => {
    const unavailable = mustOk(
      apply([
        resultAvailable(),
        transferRequested(),
        envelope('unavail-acc', { type: 'ReceiverUnavailable', actorId: 'staff-gp-1' }),
      ]),
    )
    expect(unavailable.ownershipState).toBe('OWNER_UNAVAILABLE')
    expect(unavailable.currentAccountableOwner.teamId).toBe('hospital')

    const accepted = mustOk(
      reduce(
        unavailable,
        envelope('acc-from-unavail', { type: 'TransferAccepted', actor: gpClinician }),
        protocol,
      ),
    )
    expect(accepted.ownershipState).toBe('ACCEPTED')
    expect(accepted.currentAccountableOwner).toEqual({ teamId: 'gp', actorId: 'staff-gp-1' })
    expect(accepted.acceptingActor).toEqual(gpClinician)
  })

  it('TransferAccepted from OWNER_UNAVAILABLE is invalid under NAMED_ACTOR for a non-matching actor', () => {
    const unavailable = mustOk(
      apply(
        [
          resultAvailable(),
          transferRequested(NOW, 'staff-gp-1'),
          envelope('unavail-named', { type: 'ReceiverUnavailable', actorId: 'staff-gp-1' }),
        ],
        namedProtocol,
      ),
    )
    expect(unavailable.ownershipState).toBe('OWNER_UNAVAILABLE')

    const duty: StaffIdentity = { ...gpClinician, id: 'gp-duty-1', name: 'Dr Duty' }
    const rejected = mustFail(
      reduce(
        unavailable,
        envelope('acc-duty-named', { type: 'TransferAccepted', actor: duty }),
        namedProtocol,
      ),
    )
    expect(rejected.state.ownershipState).toBe('OWNER_UNAVAILABLE')
    expect(rejected.state.acceptingActor).toBeNull()

    const accepted = mustOk(
      reduce(
        unavailable,
        envelope('acc-named-from-unavail', { type: 'TransferAccepted', actor: gpClinician }),
        namedProtocol,
      ),
    )
    expect(accepted.ownershipState).toBe('ACCEPTED')
    expect(accepted.currentAccountableOwner).toEqual({ teamId: 'gp', actorId: 'staff-gp-1' })
  })

  it('TransferAccepted under NAMED_ACTOR also requires actor.id === toActorId from the request', () => {
    const requested = mustOk(
      apply([resultAvailable(), transferRequested(NOW, 'staff-gp-1')], namedProtocol),
    )
    const otherGp: StaffIdentity = { ...gpClinician, id: 'staff-gp-other' }
    const rejected = reduce(
      requested,
      envelope('acc-named-bad', { type: 'TransferAccepted', actor: otherGp }),
      namedProtocol,
    )
    expect(rejected.ok).toBe(false)
    expect(rejected.state.ownershipState).toBe('TRANSFER_REQUESTED')

    const accepted = mustOk(
      reduce(
        requested,
        envelope('acc-named-ok', { type: 'TransferAccepted', actor: gpClinician }),
        namedProtocol,
      ),
    )
    expect(accepted.ownershipState).toBe('ACCEPTED')
    expect(accepted.currentAccountableOwner).toEqual({ teamId: 'gp', actorId: 'staff-gp-1' })
  })

  it('TransferAccepted sets ACCEPTED, owner {teamId, actorId}, submissionState ACCEPTED', () => {
    const state = mustOk(
      apply([
        resultAvailable(),
        transferRequested(),
        envelope('acc-ok', { type: 'TransferAccepted', actor: gpClinician }),
      ]),
    )
    expect(state.ownershipState).toBe('ACCEPTED')
    expect(state.currentAccountableOwner).toEqual({ teamId: 'gp', actorId: 'staff-gp-1' })
    expect(state.acceptingActor).toEqual(gpClinician)
    expect(state.submissionState).toBe('ACCEPTED')
  })

  it('TransferDeclined -> DECLINED, owner stays orderer', () => {
    const state = mustOk(
      apply([
        resultAvailable(),
        transferRequested(),
        envelope('dec-1', { type: 'TransferDeclined', actor: gpClinician, reason: 'capacity' }),
      ]),
    )
    expect(state.ownershipState).toBe('DECLINED')
    expect(state.currentAccountableOwner).toEqual({ teamId: 'hospital' })
  })

  it('TransferTimedOut -> OVERDUE, owner stays orderer', () => {
    const state = mustOk(
      apply([
        resultAvailable(),
        transferRequested(),
        envelope('to-1', { type: 'TransferTimedOut' }),
      ]),
    )
    expect(state.ownershipState).toBe('OVERDUE')
    expect(state.currentAccountableOwner).toEqual({ teamId: 'hospital' })
  })

  it('decline/timeout leaves the orderer accountable', () => {
    const declined = mustOk(
      apply([
        resultAvailable(),
        transferRequested(),
        envelope('dec-2', { type: 'TransferDeclined', actor: gpClinician, reason: 'no' }),
      ]),
    )
    const timedOut = mustOk(
      apply([resultAvailable(), transferRequested(), envelope('to-2', { type: 'TransferTimedOut' })]),
    )
    expect(declined.currentAccountableOwner.teamId).toBe('hospital')
    expect(timedOut.currentAccountableOwner.teamId).toBe('hospital')
  })

  it('ClockTick past ackDeadlineAt while a transfer is outstanding auto-emits TransferTimedOut then FallbackNotified once', () => {
    const requested = mustOk(apply([resultAvailable(), transferRequested(NOW)]))
    const tickAt = NOW + protocol.ackDeadlineMinutes * 60_000
    const ticked = mustOk(
      reduce(
        requested,
        envelope('tick-1', { type: 'ClockTick', now: tickAt }, tickAt),
        protocol,
      ),
    )
    const types = ticked.eventLog.map((e) => e.event.type)
    const timeoutAt = types.indexOf('TransferTimedOut')
    const fallbackAt = types.indexOf('FallbackNotified')
    expect(timeoutAt).toBeGreaterThan(-1)
    expect(fallbackAt).toBeGreaterThan(timeoutAt)
    expect(ticked.ownershipState).toBe('OVERDUE')
    expect(ticked.currentAccountableOwner).toEqual({ teamId: 'hospital' })
    expect(ticked.exceptionsEmitted).toHaveLength(1)

    const lateProtocol: ProtocolVersion = { ...protocol, id: 'slow', ackDeadlineMinutes: 120 }
    const stillOpen = mustOk(
      apply([resultAvailable(), transferRequested(NOW), envelope('tick-slow', { type: 'ClockTick', now: tickAt }, tickAt)], lateProtocol),
    )
    expect(stillOpen.ownershipState).toBe('TRANSFER_REQUESTED')
    expect(stillOpen.exceptionsEmitted).toHaveLength(0)
  })

  it('further ClockTicks within dedupeWindowMinutes increment duplicateSuppressed instead of emitting', () => {
    const requested = mustOk(apply([resultAvailable(), transferRequested(NOW)]))
    const firstTickAt = NOW + protocol.ackDeadlineMinutes * 60_000
    const afterFirst = mustOk(
      reduce(
        requested,
        envelope('tick-a', { type: 'ClockTick', now: firstTickAt }, firstTickAt),
        protocol,
      ),
    )
    expect(afterFirst.exceptionsEmitted).toHaveLength(1)

    const secondTickAt = firstTickAt + 10 * 60_000
    const afterSecond = mustOk(
      reduce(
        afterFirst,
        envelope('tick-b', { type: 'ClockTick', now: secondTickAt }, secondTickAt),
        protocol,
      ),
    )
    expect(afterSecond.exceptionsEmitted).toHaveLength(1)
    expect(afterSecond.duplicateSuppressed).toBe(1)
  })

  it('ClockTick past the deadline while OWNER_UNAVAILABLE still times out and keeps a non-empty owner team', () => {
    const unavailable = mustOk(
      apply([
        resultAvailable(),
        transferRequested(NOW),
        envelope('unavail-tick', { type: 'ReceiverUnavailable', actorId: 'staff-gp-1' }),
      ]),
    )
    const tickAt = NOW + protocol.ackDeadlineMinutes * 60_000
    const ticked = mustOk(
      reduce(
        unavailable,
        envelope('tick-unavail', { type: 'ClockTick', now: tickAt }, tickAt),
        protocol,
      ),
    )
    const types = ticked.eventLog.map((e) => e.event.type)
    expect(types.indexOf('TransferTimedOut')).toBeGreaterThan(-1)
    expect(types.indexOf('FallbackNotified')).toBeGreaterThan(types.indexOf('TransferTimedOut'))
    expect(ticked.ownershipState).toBe('OVERDUE')
    expect(ticked.currentAccountableOwner.teamId).toBe('hospital')
    expect(ticked.exceptionsEmitted).toHaveLength(1)
  })

  it('ClockTick deadline logic stops once TransferAccepted occurs', () => {
    const accepted = mustOk(
      apply([
        resultAvailable(),
        transferRequested(NOW),
        envelope('acc-before-tick', { type: 'TransferAccepted', actor: gpClinician }),
      ]),
    )
    const lateTick = NOW + protocol.ackDeadlineMinutes * 60_000 + 60_000
    const ticked = mustOk(
      reduce(
        accepted,
        envelope('tick-after-accept', { type: 'ClockTick', now: lateTick }, lateTick),
        protocol,
      ),
    )
    expect(ticked.ownershipState).toBe('ACCEPTED')
    expect(ticked.eventLog.some((e) => e.event.type === 'TransferTimedOut')).toBe(false)
    expect(ticked.exceptionsEmitted).toHaveLength(0)
  })

  it('dedupeWindowMinutes 0 emits a further FallbackNotified on every later tick past the deadline', () => {
    const zeroDedupe: ProtocolVersion = { ...protocol, id: 'proto-zero-dedupe', dedupeWindowMinutes: 0 }
    const requested = mustOk(apply([resultAvailable(), transferRequested(NOW)], zeroDedupe))
    const firstTickAt = NOW + zeroDedupe.ackDeadlineMinutes * 60_000
    const afterFirst = mustOk(
      reduce(
        requested,
        envelope('tick-zero-a', { type: 'ClockTick', now: firstTickAt }, firstTickAt),
        zeroDedupe,
      ),
    )
    expect(afterFirst.exceptionsEmitted).toHaveLength(1)

    const secondTickAt = firstTickAt + 60_000
    const afterSecond = mustOk(
      reduce(
        afterFirst,
        envelope('tick-zero-b', { type: 'ClockTick', now: secondTickAt }, secondTickAt),
        zeroDedupe,
      ),
    )
    expect(afterSecond.exceptionsEmitted).toHaveLength(2)
    expect(afterSecond.duplicateSuppressed).toBe(0)
    expect(afterSecond.eventLog.filter((e) => e.event.type === 'TransferTimedOut')).toHaveLength(1)
  })

  it('ReceiverUnavailable -> OWNER_UNAVAILABLE, owner team remains and is never blank', () => {
    const state = mustOk(
      apply([
        resultAvailable(),
        envelope('unavail-1', { type: 'ReceiverUnavailable', actorId: 'staff-gp-1' }),
      ]),
    )
    expect(state.ownershipState).toBe('OWNER_UNAVAILABLE')
    expect(state.currentAccountableOwner.teamId).toBe('hospital')
    expect(state.currentAccountableOwner.teamId.length).toBeGreaterThan(0)
  })

  it('ownership never becomes blank, including OWNER_UNAVAILABLE and STALE', () => {
    const unavailable = mustOk(
      apply([
        resultAvailable(),
        envelope('unavail-2', { type: 'ReceiverUnavailable', actorId: 'x' }),
      ]),
    )
    const stale = mustOk(
      apply([
        resultAvailable(),
        envelope('ver-1', { type: 'SourceVersionChanged', newVersion: 2 }),
      ]),
    )
    for (const state of [unavailable, stale]) {
      expect(state.currentAccountableOwner.teamId).toBeTruthy()
      expect(state.currentAccountableOwner.teamId.length).toBeGreaterThan(0)
    }
  })

  it('closure ordering is enforced', () => {
    const available = mustOk(apply([resultAvailable()]))
    const skipped = reduce(
      available,
      envelope('plan-early', {
        type: 'PlanRecorded',
        actor: hospitalClinician,
        planRef: ev('PlanRecorded', 'plan-1'),
      }),
      protocol,
    )
    expect(skipped.ok).toBe(false)
    expect(skipped.state.closureState).toBe('RESULT_AVAILABLE')
  })

  it('CLOSED rejected unless ClinicalReviewRecorded, PlanRecorded, PatientContactEvidenced, ActionVisibleDownstream, OutcomeEvidenced all exist for current sourceResultVersion', () => {
    const missing = mustOk(
      apply([
        resultAvailable(),
        envelope('out-early', { type: 'OutcomeEvidenced', evidence: ev('OutcomeEvidenced', 'out-1') }),
      ]),
    )
    expect(missing.closureState).not.toBe('CLOSED')

    const closed = mustOk(
      apply([
        resultAvailable(),
        envelope('rev-1', { type: 'ClinicalReviewRecorded', actor: hospitalClinician }),
        envelope('plan-1', {
          type: 'PlanRecorded',
          actor: hospitalClinician,
          planRef: ev('PlanRecorded', 'plan-1'),
        }),
        envelope('contact-1', {
          type: 'PatientContactEvidenced',
          evidence: ev('PatientContactEvidenced', 'msg-1'),
        }),
        envelope('vis-close', {
          type: 'ActionVisibleDownstream',
          evidence: ev('ActionVisibleDownstream', 'task-close'),
        }),
        envelope('out-1', { type: 'OutcomeEvidenced', evidence: ev('OutcomeEvidenced', 'out-1') }),
      ]),
    )
    expect(closed.closureState).toBe('CLOSED')
  })

  it('closure rejects missing review, contact, action or outcome evidence', () => {
    const noContact = apply([
      resultAvailable(),
      envelope('rev-2', { type: 'ClinicalReviewRecorded', actor: hospitalClinician }),
      envelope('plan-2', {
        type: 'PlanRecorded',
        actor: hospitalClinician,
        planRef: ev('PlanRecorded', 'plan-2'),
      }),
      envelope('vis-miss', {
        type: 'ActionVisibleDownstream',
        evidence: ev('ActionVisibleDownstream', 'task-miss'),
      }),
      envelope('out-miss', { type: 'OutcomeEvidenced', evidence: ev('OutcomeEvidenced', 'out-miss') }),
    ])
    expect(noContact.ok).toBe(true)
    if (noContact.ok) expect(noContact.state.closureState).not.toBe('CLOSED')
  })

  it('PatientMessageSubmitted does not set PATIENT_INFORMED; only PatientContactEvidenced does', () => {
    const afterPlan = mustOk(
      apply([
        resultAvailable(),
        envelope('rev-3', { type: 'ClinicalReviewRecorded', actor: hospitalClinician }),
        envelope('plan-3', {
          type: 'PlanRecorded',
          actor: hospitalClinician,
          planRef: ev('PlanRecorded', 'plan-3'),
        }),
        envelope('msg-sub', { type: 'PatientMessageSubmitted', messageId: 'm-1' }),
      ]),
    )
    expect(afterPlan.closureState).toBe('PLAN_RECORDED')
    expect(afterPlan.closureState).not.toBe('PATIENT_INFORMED')

    const evidenced = mustOk(
      reduce(
        afterPlan,
        envelope('msg-ev', {
          type: 'PatientContactEvidenced',
          evidence: ev('PatientContactEvidenced', 'm-1'),
        }),
        protocol,
      ),
    )
    expect(evidenced.closureState).toBe('PATIENT_INFORMED')
  })

  it('PatientContactFailed -> PATIENT_UNREACHED', () => {
    const state = mustOk(
      apply([
        resultAvailable(),
        envelope('rev-4', { type: 'ClinicalReviewRecorded', actor: hospitalClinician }),
        envelope('plan-4', {
          type: 'PlanRecorded',
          actor: hospitalClinician,
          planRef: ev('PlanRecorded', 'plan-4'),
        }),
        envelope('fail-1', { type: 'PatientContactFailed', messageId: 'm-2' }),
      ]),
    )
    expect(state.closureState).toBe('PATIENT_UNREACHED')
  })

  it('SourceVersionChanged -> STALE, bumps sourceResultVersion, emits CaseReopened with only review/plan, keeps contact/action', () => {
    const progressed = mustOk(
      apply([
        resultAvailable(),
        envelope('rev-5', { type: 'ClinicalReviewRecorded', actor: hospitalClinician }),
        envelope('plan-5', {
          type: 'PlanRecorded',
          actor: hospitalClinician,
          planRef: ev('PlanRecorded', 'plan-5'),
        }),
        envelope('contact-5', {
          type: 'PatientContactEvidenced',
          evidence: ev('PatientContactEvidenced', 'm-5'),
        }),
        envelope('vis-5', {
          type: 'ActionVisibleDownstream',
          evidence: ev('ActionVisibleDownstream', 'task-5'),
        }),
      ]),
    )
    const stale = mustOk(
      reduce(progressed, envelope('ver-2', { type: 'SourceVersionChanged', newVersion: 2 }), protocol),
    )
    expect(stale.ownershipState).toBe('STALE')
    expect(stale.sourceResultVersion).toBe(2)
    expect(stale.currentAccountableOwner.teamId).toBe('hospital')
    const reopen = stale.eventLog.find((e) => e.event.type === 'CaseReopened')
    expect(reopen?.event).toEqual({
      type: 'CaseReopened',
      affectedSteps: ['CLINICALLY_REVIEWED', 'PLAN_RECORDED'],
    })
    expect(stale.evidenceRefs.some((r) => r.eventType === 'PlanRecorded')).toBe(false)
    expect(stale.evidenceRefs.some((r) => r.eventType === 'PatientContactEvidenced')).toBe(true)
    expect(stale.evidenceRefs.some((r) => r.eventType === 'ActionVisibleDownstream')).toBe(true)
  })

  it('stale versions reject writes and reopen only affected steps', () => {
    const stale = mustOk(
      apply([
        resultAvailable(),
        envelope('rev-6', { type: 'ClinicalReviewRecorded', actor: hospitalClinician }),
        envelope('ver-3', { type: 'SourceVersionChanged', newVersion: 2 }),
      ]),
    )
    const reopen = stale.eventLog.filter((e) => e.event.type === 'CaseReopened')
    expect(reopen).toHaveLength(1)
    if (reopen[0]?.event.type === 'CaseReopened') {
      expect(reopen[0].event.affectedSteps).toEqual(['CLINICALLY_REVIEWED', 'PLAN_RECORDED'])
    }
    const write = reduce(
      stale,
      envelope('stale-write', {
        type: 'ActionSubmitted',
        actionKind: 'create_task',
        idempotencyKey: 'stale-key',
        receipt: ev('ActionSubmitted', 'task-stale'),
      }),
      protocol,
    )
    const rejectedWrite = mustFail(write)
    expect(rejectedWrite.reason).toBe('stale-source')
    expect(rejectedWrite.state.submissionState).not.toBe('SUBMITTED')
  })

  it('duplicate eventId is rejected with reason duplicate-event', () => {
    const first = mustOk(apply([resultAvailable()]))
    const again = reduce(first, resultAvailable(), protocol)
    expect(again).toEqual({ ok: false, state: first, reason: 'duplicate-event' })
  })

  it('duplicate events do not duplicate state or alerts', () => {
    const requested = mustOk(apply([resultAvailable(), transferRequested(NOW)]))
    const tickAt = NOW + protocol.ackDeadlineMinutes * 60_000
    const tick = envelope('tick-dup', { type: 'ClockTick', now: tickAt }, tickAt)
    const once = mustOk(reduce(requested, tick, protocol))
    const twice = reduce(once, tick, protocol)
    const rejectedDup = mustFail(twice)
    expect(rejectedDup.reason).toBe('duplicate-event')
    expect(rejectedDup.state.exceptionsEmitted).toEqual(once.exceptionsEmitted)
    expect(twice.state.duplicateSuppressed).toBe(once.duplicateSuppressed)
  })

  it('backward closure moves rejected with backward-transition', () => {
    const reviewed = mustOk(
      apply([
        resultAvailable(),
        envelope('rev-7', { type: 'ClinicalReviewRecorded', actor: hospitalClinician }),
        envelope('plan-7', {
          type: 'PlanRecorded',
          actor: hospitalClinician,
          planRef: ev('PlanRecorded', 'plan-7'),
        }),
      ]),
    )
    const back = reduce(
      reviewed,
      envelope('rev-back', { type: 'ClinicalReviewRecorded', actor: hospitalClinician }),
      protocol,
    )
    const rejectedBack = mustFail(back)
    expect(rejectedBack.reason).toBe('backward-transition')
    expect(rejectedBack.state.closureState).toBe('PLAN_RECORDED')
  })

  it('replayAll collects rejected envelopes and keeps last good state', () => {
    const start = fresh()
    const log = [resultAvailable(), resultAvailable(), transferRequested()]
    const { state, rejected } = replayAll(start, log, protocol)
    expect(state.ownershipState).toBe('TRANSFER_REQUESTED')
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toBe('duplicate-event')
  })
})
