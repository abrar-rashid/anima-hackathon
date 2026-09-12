import { z } from 'zod'
import { PatchProposalSchema, ProposalSchema, SnapshotSchema, StaffIdentitySchema } from '@/agents/schemas'

export { PatchProposalSchema, ProposalSchema, SnapshotSchema, StaffIdentitySchema }

export const SiteIdSchema = z.enum([
  'gp',
  'hospital',
  'community',
  'pharmacy',
  'diagnostics',
  'referrals',
  'wearables',
  'patient',
])

export const TeamIdSchema = z.union([SiteIdSchema, z.literal('gp-duty')])

export const OwnershipStateSchema = z.enum([
  'ORDERER_OWNS',
  'TRANSFER_REQUESTED',
  'ACCEPTED',
  'DECLINED',
  'OVERDUE',
  'OWNER_UNAVAILABLE',
  'STALE',
])

export const ClosureStateSchema = z.enum([
  'RESULT_AVAILABLE',
  'CLINICALLY_REVIEWED',
  'PLAN_RECORDED',
  'PATIENT_INFORMED',
  'ACTION_STARTED',
  'OUTCOME_EVIDENCED',
  'CLOSED',
  'PATIENT_UNREACHED',
  'ACTION_NOT_BOOKED',
  'ACTION_MISSED',
  'PLAN_CHANGED',
  'EVIDENCE_LATE',
  'REOPENED',
])

export const SubmissionStateSchema = z.enum([
  'NOT_SUBMITTED',
  'SUBMITTED',
  'VISIBLE_DOWNSTREAM',
  'ACCEPTED',
  'EVIDENCED',
])

export const EvidenceRefSchema = z.object({
  site: z.union([SiteIdSchema, z.literal('clock')]),
  resourceId: z.string(),
  resourceVersion: z.number(),
  observedAtSimulatorTime: z.number(),
  activityId: z.string().optional(),
  eventType: z.string(),
})

export const SourceClassificationSchema = z.object({
  rule: z.literal('source-reference-range'),
  ruleText: z.string(),
  analyteId: z.string(),
  analyteName: z.string(),
  value: z.number(),
  unit: z.string(),
  referenceLow: z.number(),
  referenceHigh: z.number(),
  direction: z.enum(['below', 'above']),
})

export const ProtocolVersionSchema = z.object({
  id: z.string(),
  supersedes: z.string().nullable(),
  receiverMode: z.enum(['NAMED_ACTOR', 'ACCOUNTABLE_TEAM']),
  ackDeadlineMinutes: z.number(),
  fallbackTeamId: TeamIdSchema,
  exceptionRoute: z.enum(['duty-clinician-task', 'orderer-task']),
  dedupeWindowMinutes: z.number(),
  clinicalPolicyRefs: z.array(z.string()),
  approval: z.object({
    status: z.enum(['ACTIVE', 'DRAFT', 'TESTING', 'FAILED_INVARIANTS', 'PASSED', 'PROPOSED']),
    approvers: z.array(z.string()),
    rollbackTarget: z.string().nullable(),
  }),
})

export const EventEnvelopeSchema = z.object({
  eventId: z.string(),
  caseId: z.string(),
  simulatorTime: z.number(),
  actor: z.string(),
  sourceVersion: z.number().optional(),
  activityId: z.string().optional(),
  event: z.object({ type: z.string() }).passthrough(),
})

export const CovenantCaseSchema = z.object({
  caseId: z.string(),
  patientId: z.string(),
  sourceResultId: z.string(),
  sourceResultVersion: z.number(),
  sourceClassification: SourceClassificationSchema,
  orderingTeamId: TeamIdSchema,
  currentAccountableOwner: z.object({ teamId: TeamIdSchema, actorId: z.string().optional() }),
  requestedReceiver: TeamIdSchema.nullable(),
  acceptingActor: StaffIdentitySchema.nullable(),
  protocolVersion: z.string(),
  ownershipState: OwnershipStateSchema,
  closureState: ClosureStateSchema,
  submissionState: SubmissionStateSchema,
  deadlines: z.object({ ackDeadlineAt: z.number().nullable() }),
  evidenceRefs: z.array(EvidenceRefSchema),
  exceptionsEmitted: z.array(z.string()),
  duplicateSuppressed: z.number(),
  manualChases: z.number(),
  eventLog: z.array(EventEnvelopeSchema),
})

export const StaffRosterEntrySchema = StaffIdentitySchema

export const CaseSnapshotResponse = z.object({
  case: CovenantCaseSchema,
  protocol: ProtocolVersionSchema,
  snapshot: SnapshotSchema.nullable(),
  proposal: ProposalSchema.nullable(),
  connection: z.object({
    live: z.boolean(),
    world: z.string(),
    simulatorNow: z.number(),
    acceptSupported: z.boolean().nullable(),
  }),
  eligibility: z.object({
    ruleText: z.string(),
    ordererRuleText: z.string(),
    selectedResultId: z.string(),
    selectedResultVersion: z.number(),
  }),
  replay: z
    .object({
      label: z.literal('Recorded simulator replay'),
      world: z.string(),
      capturedAt: z.string(),
    })
    .nullable(),
  staffRoster: z.array(StaffRosterEntrySchema),
})

export const OpenCaseRequest = z.object({ patientId: z.string().optional() })

export const ApproveRequest = z.object({
  proposalHash: z.string(),
  approverId: z.string(),
  staff: StaffIdentitySchema,
  actionIndexes: z.array(z.number().int()),
})

export const ReceiptRowSchema = z.object({
  actionIndex: z.number(),
  status: z.enum([
    'SUBMITTED',
    'VISIBLE_DOWNSTREAM',
    'ACCEPTED',
    'EVIDENCED',
    'FAILED',
    'STALE',
    'DUPLICATE_LINKED',
  ]),
  resourceId: z.string().nullable(),
  version: z.number().nullable(),
  activityId: z.string().nullable(),
  error: z.string().nullable(),
})

export const ApproveResponse = z.object({
  receipts: z.array(ReceiptRowSchema),
  case: CovenantCaseSchema,
  hardStops: z.array(z.string()),
})

export const TwinRequest = z.object({
  traceId: z.literal('after-hours-timeout'),
  baseProtocolId: z.string(),
  diff: z.record(z.string(), z.unknown()),
})

export const DISABLED_DEPLOY_REASON =
  'Production activation requires named clinical and operational approvers, controlled rollout and a rollback target.'

export const TwinMetricsSchema = z.object({
  acceptedOwnerLatencyMin: z.number().nullable(),
  ordererUnacceptedMinutes: z.number(),
  timeToClinicalReviewMin: z.number().nullable(),
  timeToPatientContactMin: z.number().nullable(),
  timeToActionEvidenceMin: z.number().nullable(),
  timeToOutcomeEvidenceMin: z.number().nullable(),
  manualChases: z.number(),
  duplicateAlerts: z.number(),
  timeouts: z.number(),
  reopens: z.number(),
})

export const InvariantResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
})

export const TwinRunSchema = z.object({
  protocolId: z.string(),
  metrics: TwinMetricsSchema,
  invariants: z.array(InvariantResultSchema),
  finalState: CovenantCaseSchema,
})

export const TwinResponse = z.object({
  comparison: z.object({
    baseline: TwinRunSchema,
    candidate: TwinRunSchema,
    deltas: z.record(z.string(), z.number().nullable()),
    candidateStatus: z.enum(['PASSED', 'FAILED_INVARIANTS']),
    sameTrace: z.boolean(),
  }),
  patch: PatchProposalSchema,
  baselineProtocol: ProtocolVersionSchema,
  candidateProtocol: ProtocolVersionSchema,
  candidateStatus: z.enum(['DRAFT', 'TESTING', 'FAILED_INVARIANTS', 'PASSED', 'PROPOSED']),
  disabledDeployReason: z.literal(DISABLED_DEPLOY_REASON),
  label: z.literal('simulator regression evidence'),
})

export const ErrorResponse = z.object({ error: z.string(), detail: z.string().optional() })

export type CaseSnapshot = z.infer<typeof CaseSnapshotResponse>
export type ApproveRequestBody = z.infer<typeof ApproveRequest>
export type ApproveResult = z.infer<typeof ApproveResponse>
export type ReceiptRow = z.infer<typeof ReceiptRowSchema>
export type TwinRequestBody = z.infer<typeof TwinRequest>
export type TwinResult = z.infer<typeof TwinResponse>
export type TwinMetricsDto = z.infer<typeof TwinMetricsSchema>
export type InvariantResultDto = z.infer<typeof InvariantResultSchema>
export type CovenantCaseDto = z.infer<typeof CovenantCaseSchema>
export type ProtocolVersionDto = z.infer<typeof ProtocolVersionSchema>
export type StaffIdentityDto = z.infer<typeof StaffIdentitySchema>
