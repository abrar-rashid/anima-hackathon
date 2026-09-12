import { openai } from '@animahealth/adk'
import { z } from 'zod'

import { app } from './app'
import { StaffIdentitySchema } from './schemas'

export const approveCovenantActions = app.tool({
  name: 'approve_covenant_actions',
  description: 'Pause for a human to approve or reject proposed covenant actions.',
  schema: z.object({ proposalHash: z.string() }),
  yieldSchema: z.object({
    approved: z.boolean(),
    approverId: z.string(),
    staff: StaffIdentitySchema,
  }),
  prepare: (ctx) => {
    ctx.state.approval = null
    return ctx.args
  },
  execute: (ctx) => {
    const approved = ctx.input!.approved
    const approverId = ctx.input!.approverId
    ctx.state.approval = { approved, approverId, at: Date.now() }
    return { approved, approverId }
  },
})

export const approvalAgent = app.agent({
  name: 'approval-gate',
  model: openai('gpt-4o-mini'),
  context: [app.context.history()],
  tools: [approveCovenantActions],
})
