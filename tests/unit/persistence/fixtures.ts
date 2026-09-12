import { ELIGIBILITY_RULE_TEXT } from '@/domain/eligibility'
import type {
  CovenantCase,
  EventEnvelope,
  ProtocolVersion,
  SourceClassification,
  StaffIdentity,
} from '@/domain/types'
import type { AuditEntry, StoredCase } from '@/persistence/port'

export const T0 = 1_789_286_400_000
export const PATIENT_A = 'SIM-000001'
export const PATIENT_B = 'SIM-000002'
export const RESULT_ID = 'blood-v1-SIM-000001-crp-5'

export const staff: StaffIdentity = {
  id: 'gp-duty-1',
  name: 'Dr Ada Sim',
  role: 'Duty GP',
  teamId: 'gp',
  attribution: 'app-side',
}

export const classification: SourceClassification = {
  rule: 'source-reference-range',
  ruleText: ELIGIBILITY_RULE_TEXT,
  analyteId: 'crp',
  analyteName: 'C-reactive protein',
  value: 5.6,
  unit: 'mg/L',
  referenceLow: 0,
  referenceHigh: 5,
  direction: 'above',
}

export const protocol: ProtocolVersion = {
  id: 'proto-v1',
  supersedes: null,
  receiverMode: 'ACCOUNTABLE_TEAM',
  ackDeadlineMinutes: 30,
  fallbackTeamId: 'gp-duty',
  exceptionRoute: 'duty-clinician-task',
  dedupeWindowMinutes: 15,
  clinicalPolicyRefs: ['policy-a'],
  approval: { status: 'ACTIVE', approvers: ['seed'], rollbackTarget: 'v2' },
}

export function envelope(
  caseId: string,
  eventId: string,
  event: EventEnvelope['event'],
  at = T0,
): EventEnvelope {
  return {
    eventId,
    caseId,
    simulatorTime: at,
    actor: 'test',
    sourceVersion: 1,
    event,
  }
}

export function makeCase(overrides: Partial<CovenantCase> = {}): CovenantCase {
  const caseId = overrides.caseId ?? `case-${PATIENT_A}-crp`
  const eventLog = overrides.eventLog ?? [
    envelope(caseId, `${caseId}:z-first`, {
      type: 'ResultAvailable',
      resultId: RESULT_ID,
      resultVersion: 1,
      orderingTeamId: 'hospital',
      requestedReceiver: 'gp',
      classification,
    }),
    envelope(
      caseId,
      `${caseId}:a-second`,
      { type: 'TransferRequested', toTeam: 'gp', ackDeadlineAt: T0 + 30 * 60_000 },
      T0 + 1,
    ),
    envelope(caseId, `${caseId}:m-third`, { type: 'ClockTick', now: T0 + 2 }, T0 + 2),
  ]
  return {
    caseId,
    patientId: PATIENT_A,
    sourceResultId: RESULT_ID,
    sourceResultVersion: 1,
    sourceClassification: classification,
    orderingTeamId: 'hospital',
    currentAccountableOwner: { teamId: 'hospital' },
    requestedReceiver: 'gp',
    acceptingActor: null,
    protocolVersion: protocol.id,
    ownershipState: 'TRANSFER_REQUESTED',
    closureState: 'RESULT_AVAILABLE',
    submissionState: 'NOT_SUBMITTED',
    deadlines: { ackDeadlineAt: T0 + 30 * 60_000 },
    evidenceRefs: [],
    exceptionsEmitted: [],
    duplicateSuppressed: 0,
    manualChases: 0,
    eventLog,
    ...overrides,
  }
}

export function storedCase(overrides: Partial<CovenantCase> = {}, updatedAt = T0): StoredCase {
  const covenant = makeCase(overrides)
  return { case: covenant, eventLog: covenant.eventLog, updatedAt }
}

export function auditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    entryId: 'aud-1',
    caseId: `case-${PATIENT_A}-crp`,
    recordedAt: 1_726_147_200_000,
    simulatorTime: T0,
    actor: staff,
    action: 'transfer-requested',
    subject: { resourceId: RESULT_ID, resourceVersion: 1 },
    detail: 'handover-proposed',
    ...overrides,
  }
}
