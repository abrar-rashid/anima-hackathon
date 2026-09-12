import { describe, it, expect } from 'vitest'
import { initialCase, reduce } from '@/domain/case-reducer'
import { evaluateInvariants } from '@/domain/invariants'
import { ELIGIBILITY_RULE_TEXT } from '@/domain/eligibility'
import type {
  CovenantCase,
  DomainEvent,
  EventEnvelope,
  EvidenceRef,
  ProtocolVersion,
  StaffIdentity,
  TeamId,
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

const clinician: StaffIdentity = {
  id: 'staff-hosp-1',
  name: 'Dr Hospital',
  role: 'consultant',
  teamId: 'hospital',
  attribution: 'app-side',
}

function ev(eventType: string, resourceId: string): EvidenceRef {
  return {
    site: 'gp',
    resourceId,
    resourceVersion: 1,
    observedAtSimulatorTime: NOW,
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

function available(): CovenantCase {
  const start = initialCase({ caseId: 'case-1', patientId: 'SIM-000001', protocol })
  const result = reduce(
    start,
    envelope('result-1', {
      type: 'ResultAvailable',
      resultId: 'blood-v1-SIM-000001-crp-5',
      resultVersion: 1,
      orderingTeamId: 'hospital',
      requestedReceiver: 'gp',
      classification: {
        rule: 'source-reference-range',
        ruleText: ELIGIBILITY_RULE_TEXT,
        analyteId: 'crp',
        analyteName: 'C-reactive protein',
        value: 5.6,
        unit: 'mg/L',
        referenceLow: 0,
        referenceHigh: 5,
        direction: 'above',
      },
    }),
    protocol,
  )
  if (!result.ok) throw new Error('fixture ResultAvailable failed')
  return result.state
}

function apply(state: CovenantCase, eventId: string, event: DomainEvent): CovenantCase {
  const result = reduce(state, envelope(eventId, event), protocol)
  if (!result.ok) throw new Error(`fixture ${event.type} failed: ${result.reason}`)
  return result.state
}

function byId(state: CovenantCase, id: number) {
  const row = evaluateInvariants(state, undefined, protocol).find((r) => r.id === id)
  if (!row) throw new Error(`missing invariant ${id}`)
  return row
}

describe('evaluateInvariants', () => {
  it('returns exactly 12 entries with ids 1..12 in order', () => {
    const results = evaluateInvariants(available(), undefined, protocol)
    expect(results).toHaveLength(12)
    expect(results.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(results.every((r) => r.name.length > 0 && r.detail.length > 0)).toBe(true)
  })

  it('1 source classification present', () => {
    expect(byId(available(), 1).passed).toBe(true)
    const empty: CovenantCase = {
      ...available(),
      sourceClassification: {
        ...available().sourceClassification,
        analyteId: '',
        analyteName: '',
      },
    }
    expect(evaluateInvariants(empty)[0]?.passed).toBe(false)
  })

  it('2 owner team non-empty at every log point', () => {
    const state = apply(
      available(),
      'unavail',
      { type: 'ReceiverUnavailable', actorId: 'staff-gp-1' },
    )
    expect(byId(state, 2).passed).toBe(true)
    const blanked: CovenantCase = {
      ...state,
      currentAccountableOwner: { teamId: '' as TeamId },
    }
    expect(evaluateInvariants(blanked, undefined, protocol)[1]?.passed).toBe(false)
  })

  it('3 accepted owner has actorId and teamId==requestedReceiver', () => {
    const accepted = apply(
      apply(available(), 'req', {
        type: 'TransferRequested',
        toTeam: 'gp',
        ackDeadlineAt: 1,
      }),
      'acc',
      { type: 'TransferAccepted', actor: { ...clinician, teamId: 'gp', id: 'staff-gp-1' } },
    )
    expect(byId(accepted, 3).passed).toBe(true)
    const bad: CovenantCase = {
      ...accepted,
      currentAccountableOwner: { teamId: 'hospital' },
    }
    expect(evaluateInvariants(bad)[2]?.passed).toBe(false)
  })

  it('4 CLINICALLY_REVIEWED only after ClinicalReviewRecorded with human actor', () => {
    const reviewed = apply(available(), 'rev', {
      type: 'ClinicalReviewRecorded',
      actor: clinician,
    })
    expect(byId(reviewed, 4).passed).toBe(true)
    const claimed: CovenantCase = { ...available(), closureState: 'CLINICALLY_REVIEWED' }
    expect(evaluateInvariants(claimed)[3]?.passed).toBe(false)
  })

  it('5 classification unchanged across log', () => {
    const state = available()
    expect(byId(state, 5).passed).toBe(true)
    const mutated: CovenantCase = {
      ...state,
      eventLog: [
        ...state.eventLog,
        envelope('result-2', {
          type: 'ResultAvailable',
          resultId: 'blood-v1-SIM-000001-crp-5',
          resultVersion: 1,
          orderingTeamId: 'hospital',
          requestedReceiver: 'gp',
          classification: { ...state.sourceClassification, value: 99 },
        }),
      ],
    }
    expect(evaluateInvariants(mutated)[4]?.passed).toBe(false)
  })

  it('6 PATIENT_INFORMED only with PatientContactEvidenced', () => {
    const informed = apply(
      apply(
        apply(available(), 'rev-i', { type: 'ClinicalReviewRecorded', actor: clinician }),
        'plan-i',
        { type: 'PlanRecorded', actor: clinician, planRef: ev('PlanRecorded', 'p') },
      ),
      'contact-i',
      { type: 'PatientContactEvidenced', evidence: ev('PatientContactEvidenced', 'm') },
    )
    expect(byId(informed, 6).passed).toBe(true)
    const claimed: CovenantCase = { ...available(), closureState: 'PATIENT_INFORMED' }
    expect(evaluateInvariants(claimed)[5]?.passed).toBe(false)
  })

  it('7 CLOSED only with full evidence', () => {
    const closed = apply(
      apply(
        apply(
          apply(
            apply(
              apply(available(), 'rev-c', { type: 'ClinicalReviewRecorded', actor: clinician }),
              'plan-c',
              { type: 'PlanRecorded', actor: clinician, planRef: ev('PlanRecorded', 'p') },
            ),
            'contact-c',
            { type: 'PatientContactEvidenced', evidence: ev('PatientContactEvidenced', 'm') },
          ),
          'vis-c',
          { type: 'ActionVisibleDownstream', evidence: ev('ActionVisibleDownstream', 't') },
        ),
        'out-c',
        { type: 'OutcomeEvidenced', evidence: ev('OutcomeEvidenced', 'o') },
      ),
      // no-op extra to keep apply() chain typed; closure already CLOSED
      'chase-c',
      { type: 'ManualChase', byTeam: 'hospital' },
    )
    expect(closed.closureState).toBe('CLOSED')
    expect(byId(closed, 7).passed).toBe(true)
    const claimed: CovenantCase = { ...available(), closureState: 'CLOSED' }
    expect(evaluateInvariants(claimed)[6]?.passed).toBe(false)
  })

  it('8 no two ActionSubmitted with same idempotencyKey', () => {
    const once = apply(available(), 'sub-1', {
      type: 'ActionSubmitted',
      actionKind: 'create_task',
      idempotencyKey: 'same-key',
      receipt: ev('ActionSubmitted', 't1'),
    })
    expect(byId(once, 8).passed).toBe(true)
    const dup: CovenantCase = {
      ...once,
      eventLog: [
        ...once.eventLog,
        envelope('sub-2', {
          type: 'ActionSubmitted',
          actionKind: 'create_task',
          idempotencyKey: 'same-key',
          receipt: ev('ActionSubmitted', 't2'),
        }),
      ],
    }
    expect(evaluateInvariants(dup)[7]?.passed).toBe(false)
  })

  it('9 OWNER_UNAVAILABLE never blanked owner', () => {
    const unavailable = apply(available(), 'ua', {
      type: 'ReceiverUnavailable',
      actorId: 'staff-gp-1',
    })
    expect(byId(unavailable, 9).passed).toBe(true)
    const blanked: CovenantCase = {
      ...unavailable,
      currentAccountableOwner: { teamId: '' as TeamId },
    }
    expect(evaluateInvariants(blanked)[8]?.passed).toBe(false)
  })

  it('10 (needs baseline) manualChases, exceptionsEmitted.length, duplicateSuppressed not worse than baseline', () => {
    const baseline = {
      ...available(),
      manualChases: 1,
      exceptionsEmitted: ['ex-1'],
      duplicateSuppressed: 2,
    }
    const better: CovenantCase = {
      ...baseline,
      caseId: 'cand',
      manualChases: 1,
      exceptionsEmitted: ['ex-1'],
      duplicateSuppressed: 1,
    }
    expect(evaluateInvariants(better, baseline)[9]?.passed).toBe(true)
    const worse: CovenantCase = { ...better, manualChases: 4 }
    expect(evaluateInvariants(worse, baseline)[9]?.passed).toBe(false)
    expect(evaluateInvariants(better)[9]?.passed).toBe(true)
  })

  it('11 reopen affected only review/plan', () => {
    const progressed = apply(
      apply(
        apply(
          apply(available(), 'rev-r', { type: 'ClinicalReviewRecorded', actor: clinician }),
          'plan-r',
          { type: 'PlanRecorded', actor: clinician, planRef: ev('PlanRecorded', 'p') },
        ),
        'contact-r',
        { type: 'PatientContactEvidenced', evidence: ev('PatientContactEvidenced', 'm') },
      ),
      'vis-r',
      { type: 'ActionVisibleDownstream', evidence: ev('ActionVisibleDownstream', 't') },
    )
    const reopened = apply(progressed, 'ver-r', { type: 'SourceVersionChanged', newVersion: 2 })
    expect(byId(reopened, 11).passed).toBe(true)
    const bad: CovenantCase = {
      ...reopened,
      eventLog: reopened.eventLog.map((e) =>
        e.event.type === 'CaseReopened'
          ? {
              ...e,
              event: {
                type: 'CaseReopened' as const,
                affectedSteps: ['CLINICALLY_REVIEWED', 'PLAN_RECORDED', 'PATIENT_INFORMED'],
              },
            }
          : e,
      ),
    }
    expect(evaluateInvariants(bad)[10]?.passed).toBe(false)
  })

  it('12 protocol approval status !== ACTIVE unless approvers.length>0 && rollbackTarget', () => {
    const state = available()
    expect(byId(state, 12).passed).toBe(true)
    const activeBad: ProtocolVersion = {
      ...protocol,
      approval: { status: 'ACTIVE', approvers: [], rollbackTarget: null },
    }
    expect(evaluateInvariants(state, undefined, activeBad)[11]?.passed).toBe(false)
    const activeGood: ProtocolVersion = {
      ...protocol,
      approval: { status: 'ACTIVE', approvers: ['clinician-a'], rollbackTarget: 'proto-v0' },
    }
    expect(evaluateInvariants(state, undefined, activeGood)[11]?.passed).toBe(true)

    const remembered: ProtocolVersion = {
      ...protocol,
      id: 'proto-active-bad',
      approval: { status: 'ACTIVE', approvers: [], rollbackTarget: null },
    }
    const start = initialCase({ caseId: 'case-12', patientId: 'SIM-000001', protocol: remembered })
    expect(evaluateInvariants(start)[11]?.passed).toBe(false)
  })
})
