export const RULE_TEXT =
  'An analyte value lies outside the reference range supplied by the source laboratory (referenceLow..referenceHigh). No urgency, diagnosis or treatment is inferred.'

export const SIMULATOR_NOW = 1_789_286_400_000
export const WORLD = 'team-ea32f6302052'
export const RESULT_ID = 'blood-v1-SIM-000001-crp-5'
export const PATIENT_ID = 'SIM-000001'
export const PATIENT_NAME = 'Amira Khan'
export const CASE_ID = 'case-SIM-000001-crp-5'
export const CAPTURED_AT = '2026-09-12T12:12:40.886Z'

export const DEFAULT_STAFF = [
  { id: 'gp-duty-1', name: 'Dr Ada Sim', role: 'Duty GP', teamId: 'gp' as const, attribution: 'app-side' as const },
  {
    id: 'hosp-1',
    name: 'Dr Morgan Bell',
    role: 'Hospital clinician',
    teamId: 'hospital' as const,
    attribution: 'app-side' as const,
  },
]

export const liveCreateTask = {
  kind: 'create_task' as const,
  site: 'gp',
  payload: {
    type: 'create_task',
    patientId: PATIENT_ID,
    title: 'Review CRP result SIM-000001',
  },
  expectedReadback: 'GP Connect Task bundle contains the created task id at the current version',
  sourceVersions: [{ id: RESULT_ID, version: 1 }],
  idempotencyKey: `team12|${PATIENT_ID}|${RESULT_ID}|1|v3|create_task|gp`,
  supported: true,
  label: 'live' as const,
}

export const previewAccept = {
  kind: 'accept' as const,
  site: 'gp',
  payload: { type: 'accept', resourceId: 'task-preview-SIM-000001', expectedVersion: 1 },
  expectedReadback: 'Acceptance is not claimed; acceptSupported is unknown',
  sourceVersions: [{ id: RESULT_ID, version: 1 }],
  idempotencyKey: `team12|${PATIENT_ID}|${RESULT_ID}|1|v3|accept|gp`,
  supported: false,
  label: 'Protocol preview' as const,
}

export function heroProposal(overrides: Record<string, unknown> = {}) {
  return {
    transfer: { toTeam: 'gp', mode: 'ACCOUNTABLE_TEAM' },
    deadlines: {
      ackDeadlineAt: SIMULATOR_NOW + 30 * 60 * 1000,
      policySource: 'protocol v3 ackDeadlineMinutes',
    },
    actions: [liveCreateTask, previewAccept],
    prohibited: [
      { field: 'clinicalReview', reason: 'Clinician decision required' },
      { field: 'clinicalPlan', reason: 'Clinician decision required' },
    ],
    hardStops: [] as string[],
    fieldSources: {
      'transfer.toTeam': 'hospital discharge summary + protocol receiverMode',
    },
    ...overrides,
  }
}

export function heroCase(overrides: Record<string, unknown> = {}) {
  return {
    caseId: CASE_ID,
    patientId: PATIENT_ID,
    sourceResultId: RESULT_ID,
    sourceResultVersion: 1,
    sourceClassification: {
      rule: 'source-reference-range' as const,
      ruleText: RULE_TEXT,
      analyteId: 'crp',
      analyteName: 'C-reactive protein',
      value: 5.6,
      unit: 'mg/L',
      referenceLow: 0,
      referenceHigh: 5,
      direction: 'above' as const,
    },
    orderingTeamId: 'hospital' as const,
    currentAccountableOwner: { teamId: 'hospital' as const },
    requestedReceiver: 'gp' as const,
    acceptingActor: null,
    protocolVersion: 'v3',
    ownershipState: 'ORDERER_OWNS' as const,
    closureState: 'RESULT_AVAILABLE' as const,
    submissionState: 'NOT_SUBMITTED' as const,
    deadlines: { ackDeadlineAt: SIMULATOR_NOW + 30 * 60 * 1000 },
    evidenceRefs: [
      {
        site: 'diagnostics' as const,
        resourceId: RESULT_ID,
        resourceVersion: 1,
        observedAtSimulatorTime: 1_789_117_200_000,
        eventType: 'ResultAvailable',
      },
    ],
    exceptionsEmitted: [] as string[],
    duplicateSuppressed: 0,
    manualChases: 0,
    eventLog: [
      {
        eventId: 'evt-result-available',
        caseId: CASE_ID,
        simulatorTime: 1_789_117_200_000,
        actor: 'diagnostics',
        sourceVersion: 1,
        event: { type: 'ResultAvailable' },
      },
    ],
    ...overrides,
  }
}

export function heroProtocol() {
  return {
    id: 'v3',
    supersedes: 'v2',
    receiverMode: 'NAMED_ACTOR' as const,
    ackDeadlineMinutes: 120,
    fallbackTeamId: 'hospital' as const,
    exceptionRoute: 'orderer-task' as const,
    dedupeWindowMinutes: 0,
    clinicalPolicyRefs: ['local-abnormal-result-policy-2026'],
    approval: { status: 'ACTIVE' as const, approvers: ['seed'], rollbackTarget: 'v2' },
  }
}

export function heroSnapshot(overrides: Record<string, unknown> = {}) {
  const { case: caseOverrides, ...rest } = overrides
  const caseRecord = heroCase((caseOverrides as Record<string, unknown> | undefined) ?? {})
  return {
    case: caseRecord,
    protocol: heroProtocol(),
    snapshot: {
      patientId: PATIENT_ID,
      result: {
        id: RESULT_ID,
        version: 1,
        classification: caseRecord.sourceClassification,
      },
      orderingTeamId: 'hospital',
      requestedReceiver: 'gp',
      existingTasks: [] as { id: string; version: number; title: string; status: string }[],
      visibility: ['gp', 'hospital', 'diagnostics'],
      simulatorNow: SIMULATOR_NOW,
      conflicts: [] as string[],
      missingEvidence: ['clinical review', 'clinician-recorded plan', 'patient contact'],
      citations: caseRecord.evidenceRefs,
    },
    proposal: heroProposal(),
    connection: {
      live: true,
      world: WORLD,
      simulatorNow: SIMULATOR_NOW,
      acceptSupported: null as boolean | null,
    },
    eligibility: {
      ruleText: RULE_TEXT,
      ordererRuleText: 'Hospital discharge summary is present on the GP record; ordering team is hospital.',
      selectedResultId: RESULT_ID,
      selectedResultVersion: 1,
    },
    replay: null as null | { label: 'Recorded simulator replay'; world: string; capturedAt: string },
    staffRoster: DEFAULT_STAFF,
    ...rest,
  }
}

export function submittedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    actionIndex: 0,
    status: 'SUBMITTED' as const,
    resourceId: 'task-SIM-000001-crp',
    version: 1,
    activityId: null as string | null,
    error: null as string | null,
    ...overrides,
  }
}
