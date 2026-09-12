import { z } from 'zod'

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

export const StaffIdentitySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  teamId: TeamIdSchema,
  attribution: z.literal('app-side'),
})

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

export const SnapshotSchema = z.object({
  patientId: z.string(),
  result: z.object({
    id: z.string(),
    version: z.number(),
    classification: SourceClassificationSchema,
  }),
  orderingTeamId: TeamIdSchema,
  requestedReceiver: TeamIdSchema,
  existingTasks: z.array(
    z.object({
      id: z.string(),
      version: z.number(),
      title: z.string(),
      status: z.string(),
    }),
  ),
  visibility: z.array(z.string()),
  simulatorNow: z.number(),
  conflicts: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  citations: z.array(EvidenceRefSchema),
})

export const ProposalSchema = z.object({
  transfer: z.object({
    toTeam: TeamIdSchema,
    mode: z.enum(['NAMED_ACTOR', 'ACCOUNTABLE_TEAM']),
    toActorId: z.string().optional(),
  }),
  deadlines: z.object({
    ackDeadlineAt: z.number(),
    policySource: z.string(),
  }),
  actions: z.array(
    z.object({
      kind: z.enum(['create_task', 'accept', 'messaging_action']),
      site: SiteIdSchema,
      payload: z.unknown(),
      expectedReadback: z.string(),
      sourceVersions: z.array(z.object({ id: z.string(), version: z.number() })),
      idempotencyKey: z.string(),
      supported: z.boolean(),
      label: z.enum(['live', 'Protocol preview']),
      requiresSeparateApproval: z.boolean().optional(),
      blockedReason: z.string().optional(),
    }),
  ),
  prohibited: z.array(
    z.object({
      field: z.string(),
      reason: z.literal('Clinician decision required'),
    }),
  ),
  hardStops: z.array(z.string()),
  fieldSources: z.record(z.string()),
})

export const PatchProposalSchema = z.object({
  baseProtocolId: z.string(),
  diff: z.object({
    receiverMode: z.enum(['NAMED_ACTOR', 'ACCOUNTABLE_TEAM']).optional(),
    ackDeadlineMinutes: z.number().optional(),
    fallbackTeamId: TeamIdSchema.optional(),
    exceptionRoute: z.enum(['duty-clinician-task', 'orderer-task']).optional(),
    dedupeWindowMinutes: z.number().optional(),
  }),
  traceRef: z.string(),
  denominator: z.object({
    traces: z.number(),
    events: z.number(),
  }),
  failureHypothesis: z.string(),
  requestedTwinRun: z.literal(true),
})

export const AssemblerRecordSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    version: z.number(),
    title: z.string().optional(),
    status: z.string(),
    owner: z.string(),
    visibleTo: z.array(z.string()),
    site: z.string().optional(),
  })
  .passthrough()

export const AssemblerInputSchema = z
  .object({
    patientId: z.string(),
    result: z.object({
      id: z.string(),
      version: z.number(),
      classification: SourceClassificationSchema,
      visibleTo: z.array(z.string()),
      owner: z.string(),
    }),
    records: z.array(AssemblerRecordSchema).default([]),
    activity: z
      .array(
        z.object({
          id: z.string(),
          time: z.number(),
          type: z.string(),
          actor: z.string(),
          resourceId: z.string().optional(),
        }),
      )
      .default([]),
    simulatorNow: z.number(),
    orderingTeamId: TeamIdSchema.optional(),
    requestedReceiver: TeamIdSchema.optional(),
  })
  .passthrough()

export const CompilerBindingSchema = z.object({
  acceptSupported: z.boolean().nullable(),
  team: z.string().optional(),
  world: z.string().optional(),
})

export const CompilerInputSchema = z.object({
  snapshot: SnapshotSchema,
  protocol: ProtocolVersionSchema,
  binding: CompilerBindingSchema,
  toActorId: z.string().optional(),
  createdTaskId: z.string().optional(),
})

export const AnalystInputSchema = z.object({
  baseProtocol: ProtocolVersionSchema,
  proposedDiff: z.record(z.unknown()).optional(),
  traceRef: z.string(),
  denominator: z.object({
    traces: z.number(),
    events: z.number(),
  }),
  failureHypothesis: z.string().optional(),
})

export const ApprovalStateSchema = z
  .object({
    approved: z.boolean(),
    approverId: z.string(),
    at: z.number(),
  })
  .nullable()
  .default(null)

export type Snapshot = z.infer<typeof SnapshotSchema>
export type Proposal = z.infer<typeof ProposalSchema>
export type PatchProposal = z.infer<typeof PatchProposalSchema>
export type StaffIdentityParsed = z.infer<typeof StaffIdentitySchema>
export type AssemblerInput = z.input<typeof AssemblerInputSchema>
export type CompilerInput = z.input<typeof CompilerInputSchema>
export type AnalystInput = z.input<typeof AnalystInputSchema>
