import { FakeClock } from '@/adapters/fake/clock'
import { FakeRead } from '@/adapters/fake/anima-read'
import { FakeWrite } from '@/adapters/fake/anima-write'
import type { Proposal } from '@/agents/schemas'
import { initialCase, reduce } from '@/domain/case-reducer'
import { ELIGIBILITY_RULE_TEXT } from '@/domain/eligibility'
import type { CovenantCase, DomainEvent, EventEnvelope, ProtocolVersion, StaffIdentity } from '@/domain/types'
import type { VersionedRecord } from '@/ports/anima-read-port'
import { CaseStore } from '@/services/case-store'
import type { StoredCase } from '@/services/case-store'

export const NOW = 1_789_286_400_000
export const PATIENT_ID = 'SIM-000001'
export const RESULT_ID = 'blood-v1-SIM-000001-crp-5'
export const CASE_ID = `case-${PATIENT_ID}-${RESULT_ID}`

export const classification = {
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

export const staff: StaffIdentity = {
  id: 'gp-duty-1',
  name: 'Dr Ada Sim',
  role: 'Duty GP',
  teamId: 'gp',
  attribution: 'app-side',
}

export const orderingStaff: StaffIdentity = {
  id: 'hosp-1',
  name: 'Dr Morgan Bell',
  role: 'Hospital clinician',
  teamId: 'hospital',
  attribution: 'app-side',
}

export const protocol: ProtocolVersion = {
  id: 'v-test',
  supersedes: null,
  receiverMode: 'ACCOUNTABLE_TEAM',
  ackDeadlineMinutes: 30,
  fallbackTeamId: 'gp-duty',
  exceptionRoute: 'duty-clinician-task',
  dedupeWindowMinutes: 15,
  clinicalPolicyRefs: ['policy-a'],
  approval: { status: 'ACTIVE', approvers: ['seed'], rollbackTarget: 'v2' },
}

export function bloodRecord(version = 1): VersionedRecord {
  return {
    id: RESULT_ID,
    kind: 'report',
    version,
    patientId: PATIENT_ID,
    owner: 'diagnostics',
    visibleTo: ['gp', 'hospital', 'diagnostics'],
    status: 'available',
    createdAt: 1_789_117_200_000,
    data: {
      kind: 'blood-result',
      collectedAt: 1_789_113_600_000,
      analytes: [
        {
          id: 'crp',
          name: 'C-reactive protein',
          unit: 'mg/L',
          value: 5.6,
          referenceLow: 0,
          referenceHigh: 5,
        },
      ],
    },
  }
}

export function seedHero(read: FakeRead, version = 1): void {
  read.addRecord(PATIENT_ID, bloodRecord(version))
  read.addRecord(PATIENT_ID, {
    id: 'discharge-summary-example',
    kind: 'discharge-summary',
    version: 1,
    patientId: PATIENT_ID,
    owner: 'hospital',
    visibleTo: ['hospital', 'gp'],
    status: 'sent',
    createdAt: NOW,
    data: {},
  })
}

export function apply(
  state: CovenantCase,
  event: DomainEvent,
  proto: ProtocolVersion,
  eventId: string,
  at = NOW,
): CovenantCase {
  const envelope: EventEnvelope = {
    eventId,
    caseId: state.caseId,
    simulatorTime: at,
    actor: 'test',
    sourceVersion: state.sourceResultVersion || 1,
    event,
  }
  const result = reduce(state, envelope, proto)
  return result.state
}

export function openedCase(proto: ProtocolVersion = protocol): CovenantCase {
  let state = initialCase({ caseId: CASE_ID, patientId: PATIENT_ID, protocol: proto })
  state = apply(
    state,
    {
      type: 'ResultAvailable',
      resultId: RESULT_ID,
      resultVersion: 1,
      orderingTeamId: 'hospital',
      requestedReceiver: 'gp',
      classification,
    },
    proto,
    `${CASE_ID}:ResultAvailable`,
  )
  return state
}

export function informedCase(proto: ProtocolVersion = protocol): CovenantCase {
  let state = openedCase(proto)
  state = apply(state, { type: 'ClinicalReviewRecorded', actor: staff }, proto, `${CASE_ID}:review`)
  state = apply(
    state,
    {
      type: 'PlanRecorded',
      actor: staff,
      planRef: {
        site: 'gp',
        resourceId: 'plan-1',
        resourceVersion: 1,
        observedAtSimulatorTime: NOW,
        eventType: 'PlanRecorded',
      },
    },
    proto,
    `${CASE_ID}:plan`,
  )
  state = apply(
    state,
    {
      type: 'PatientContactEvidenced',
      evidence: {
        site: 'gp',
        resourceId: 'msg-1',
        resourceVersion: 1,
        observedAtSimulatorTime: NOW,
        eventType: 'PatientContactEvidenced',
      },
    },
    proto,
    `${CASE_ID}:contact`,
  )
  return state
}

export function heroProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    transfer: { toTeam: 'gp', mode: 'ACCOUNTABLE_TEAM' },
    deadlines: { ackDeadlineAt: NOW + 30 * 60_000, policySource: 'protocol:v-test.ackDeadlineMinutes' },
    actions: [
      {
        kind: 'create_task',
        site: 'gp',
        payload: {
          type: 'create_task',
          title: 'Acknowledge abnormal-result handover',
          owner: 'gp',
          patientId: PATIENT_ID,
        },
        expectedReadback: 'GET /api/sites/gp/view',
        sourceVersions: [{ id: RESULT_ID, version: 1 }],
        idempotencyKey: 'ignored-by-service',
        supported: true,
        label: 'live',
      },
      {
        kind: 'accept',
        site: 'gp',
        payload: { type: 'accept', resourceId: RESULT_ID },
        expectedReadback: 'GET /api/sites/gp/view',
        sourceVersions: [{ id: RESULT_ID, version: 1 }],
        idempotencyKey: 'ignored-accept',
        supported: true,
        label: 'live',
      },
    ],
    prohibited: [
      { field: 'review', reason: 'Clinician decision required' },
      { field: 'plan', reason: 'Clinician decision required' },
      { field: 'urgency', reason: 'Clinician decision required' },
    ],
    hardStops: [],
    fieldSources: { 'transfer.toTeam': 'snapshot.requestedReceiver' },
    ...overrides,
  }
}

export function approval(approved = true) {
  return { approved, approverId: staff.id, at: NOW }
}

export function ports() {
  const clock = new FakeClock()
  const read = new FakeRead({ clock })
  const write = new FakeWrite(read, clock)
  const store = new CaseStore()
  seedHero(read)
  return { clock, read, write, store }
}

export function persist(store: CaseStore, state: CovenantCase, proposal: Proposal, proto: ProtocolVersion = protocol): StoredCase {
  const record: StoredCase = {
    case: state,
    protocol: proto,
    snapshot: null,
    proposal,
    connection: {
      live: false,
      world: 'team-ea32f6302052',
      simulatorNow: NOW,
      acceptSupported: true,
    },
    eligibility: {
      ruleText: ELIGIBILITY_RULE_TEXT,
      ordererRuleText:
        'Hospital orders and GP receives when a hospital discharge summary is present; otherwise GP orders and hospital receives.',
      selectedResultId: RESULT_ID,
      selectedResultVersion: 1,
    },
    replay: null,
    receipts: [],
    hardStops: [],
  }
  store.save(record)
  return record
}
