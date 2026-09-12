import { adk } from '@animahealth/adk'
import { MockAdapter } from '@animahealth/adk/testing'
import { z } from 'zod'

import {
  AnalystInputSchema,
  ApprovalStateSchema,
  AssemblerInputSchema,
  CompilerInputSchema,
  PatchProposalSchema,
  ProposalSchema,
  SnapshotSchema,
} from './schemas'

export const app = adk({
  name: 'care-covenant',
  schema: {
    session: {
      snapshot: SnapshotSchema.nullable().default(null),
      proposal: ProposalSchema.nullable().default(null),
      patch: PatchProposalSchema.nullable().default(null),
      approval: ApprovalStateSchema,
      assemblerInput: AssemblerInputSchema.nullable().default(null),
      compilerInput: CompilerInputSchema.nullable().default(null),
      analystInput: AnalystInputSchema.nullable().default(null),
      deterministicSnapshot: SnapshotSchema.nullable().default(null),
      deterministicProposal: ProposalSchema.nullable().default(null),
      deterministicPatch: PatchProposalSchema.nullable().default(null),
      forceModel: z.boolean().default(false),
    },
  },
  adapters: process.env.OPENAI_API_KEY
    ? undefined
    : { openai: new MockAdapter({ defaultResponse: { text: 'model disabled' } }) },
})
