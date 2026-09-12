import { describe, expect, it } from 'vitest'
import type { Runnable } from '@animahealth/adk'
import { runTest, user } from '@animahealth/adk/testing'

import { app } from '@/agents/app'
import { reliabilityAnalyst } from '@/agents/reliability-analyst'
import type { PatchProposal } from '@/agents/schemas'
import { validatePatch } from '@/domain/patch-grammar'
import type { ProtocolVersion } from '@/domain/types'

const V3: ProtocolVersion = {
  id: 'v3',
  supersedes: 'v2',
  receiverMode: 'NAMED_ACTOR',
  ackDeadlineMinutes: 120,
  fallbackTeamId: 'hospital',
  exceptionRoute: 'orderer-task',
  dedupeWindowMinutes: 0,
  clinicalPolicyRefs: ['local-abnormal-result-policy-2026'],
  approval: { status: 'ACTIVE', approvers: ['seed'], rollbackTarget: 'v2' },
}

describe('reliability-analyst', () => {
  it('analyst rejects diff containing abnormalityThreshold (via validatePatch)', async () => {
    const proposedDiff = { ackDeadlineMinutes: 30, abnormalityThreshold: 1 }
    expect(validatePatch(V3, proposedDiff).ok).toBe(false)

    const result = await runTest(reliabilityAnalyst as Runnable, [user('analyse')], {
      schema: app.schema,
      initialState: {
        session: {
          analystInput: {
            baseProtocol: V3,
            proposedDiff,
            traceRef: 'after-hours-timeout',
            denominator: { traces: 1, events: 12 },
          },
        },
      },
    })

    const patch = result.result.state.patch as PatchProposal | null
    expect(patch).toBeTruthy()
    if (!patch) throw new Error('expected patch')

    expect(patch.diff).not.toHaveProperty('abnormalityThreshold')
    expect(patch.diff.ackDeadlineMinutes).toBe(30)
    expect(validatePatch(V3, patch.diff as Record<string, unknown>).ok).toBe(true)
    expect(patch.requestedTwinRun).toBe(true)
    expect(patch.baseProtocolId).toBe('v3')
  })
})
