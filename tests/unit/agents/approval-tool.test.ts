import { describe, expect, it } from 'vitest'
import type { Runnable } from '@animahealth/adk'
import { input, model, runTest, user } from '@animahealth/adk/testing'

import { approvalAgent } from '@/agents/approval-tool'
import type { StaffIdentity } from '@/domain/types'

const staff: StaffIdentity = {
  id: 'u1',
  name: 'Dr Synthetic',
  role: 'GP',
  teamId: 'gp',
  attribution: 'app-side',
}

describe('approval-tool', () => {
  it("approval tool yields (status === 'yielded_tool') and resumes with input({ approve_covenant_actions: { approved: true, approverId: 'u1', staff } })", async () => {
    const yielded = await runTest(approvalAgent as unknown as Runnable, [
      user('approve the covenant'),
      model({
        toolCalls: [{ name: 'approve_covenant_actions', args: { proposalHash: 'hash-1' } }],
      }),
    ])

    expect(yielded.status).toBe('yielded_tool')
    expect(yielded.result.state.approval).toBeNull()

    const resumed = await runTest(approvalAgent as unknown as Runnable, [
      user('approve the covenant'),
      model({
        toolCalls: [{ name: 'approve_covenant_actions', args: { proposalHash: 'hash-1' } }],
      }),
      input({
        approve_covenant_actions: { approved: true, approverId: 'u1', staff },
      }),
      model('Recorded'),
    ])

    expect(resumed.status).toBe('completed')
    expect(resumed.result.state.approval).toMatchObject({
      approved: true,
      approverId: 'u1',
    })
  })
})
