import { describe, expect, it } from 'vitest'
import type { Runnable } from '@animahealth/adk'
import { runTest, user } from '@animahealth/adk/testing'

import { app } from '@/agents/app'
import { assembleSnapshot } from '@/agents/context-assembler'
import { covenantCompiler } from '@/agents/covenant-compiler'
import type { Proposal } from '@/agents/schemas'
import type { ProtocolVersion } from '@/domain/types'

import { SIM_ASSEMBLER_INPUT } from './sim-case'

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

describe('covenant-compiler', () => {
  it('compiler never populates clinical plan fields (proposal has prohibited rows for review/plan/urgency)', async () => {
    const snapshot = assembleSnapshot(SIM_ASSEMBLER_INPUT)
    const result = await runTest(covenantCompiler as Runnable, [user('compile')], {
      schema: app.schema,
      initialState: {
        session: {
          compilerInput: {
            snapshot,
            protocol: V3,
            binding: { acceptSupported: null, team: 'team12' },
          },
        },
      },
    })

    const proposal = result.result.state.proposal as Proposal | null
    expect(proposal).toBeTruthy()
    if (!proposal) throw new Error('expected proposal')

    expect(proposal).not.toHaveProperty('review')
    expect(proposal).not.toHaveProperty('plan')
    expect(proposal).not.toHaveProperty('urgency')
    expect(proposal).not.toHaveProperty('clinicalPlan')
    expect(proposal).not.toHaveProperty('diagnosis')

    const prohibitedFields = proposal.prohibited.map((row) => row.field)
    expect(prohibitedFields).toEqual(expect.arrayContaining(['review', 'plan', 'urgency']))
    expect(proposal.prohibited.every((row) => row.reason === 'Clinician decision required')).toBe(
      true,
    )
  })

  it("compiler marks accept action label: 'Protocol preview' when binding.acceptSupported !== true", async () => {
    const snapshot = assembleSnapshot(SIM_ASSEMBLER_INPUT)
    const result = await runTest(covenantCompiler as Runnable, [user('compile')], {
      schema: app.schema,
      initialState: {
        session: {
          compilerInput: {
            snapshot,
            protocol: V3,
            binding: { acceptSupported: null, team: 'team12' },
          },
        },
      },
    })

    const proposal = result.result.state.proposal as Proposal | null
    expect(proposal).toBeTruthy()
    if (!proposal) throw new Error('expected proposal')

    const accept = proposal.actions.find((action) => action.kind === 'accept')
    expect(accept).toBeTruthy()
    expect(accept?.label).toBe('Protocol preview')
    expect(accept?.supported).toBe(false)
  })
})
