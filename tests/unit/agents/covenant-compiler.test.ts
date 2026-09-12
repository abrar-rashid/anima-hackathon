import { describe, expect, it } from 'vitest'
import type { Runnable } from '@animahealth/adk'
import { runTest, user } from '@animahealth/adk/testing'

import { app } from '@/agents/app'
import { assembleSnapshot } from '@/agents/context-assembler'
import { compileProposal, covenantCompiler } from '@/agents/covenant-compiler'
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

  it('proposes a live accept as a separate approval and never targets the blood report', () => {
    const snapshot = assembleSnapshot(SIM_ASSEMBLER_INPUT)
    const proposal = compileProposal({
      snapshot,
      protocol: V3,
      binding: { acceptSupported: true, team: 'team12' },
    })

    const accept = proposal.actions.find((action) => action.kind === 'accept')
    const create = proposal.actions.find((action) => action.kind === 'create_task')
    expect(create?.supported).toBe(true)
    expect(accept?.supported).toBe(true)
    expect(accept?.label).toBe('live')
    expect(accept?.requiresSeparateApproval).toBe(true)
    expect(accept?.blockedReason).toMatch(/task id is not yet known/i)
    expect(accept?.payload).toEqual({ type: 'accept' })
    expect(JSON.stringify(accept?.payload)).not.toContain(snapshot.result.id)
    expect(create?.expectedReadback).toBe('GET /api/nhs/gp-connect?patient=SIM-000001')
    expect(accept?.expectedReadback).toBe('GET /api/nhs/gp-connect?patient=SIM-000001')
  })

  it('binds accept.resourceId to the created task id when compile is given that id', () => {
    const snapshot = assembleSnapshot(SIM_ASSEMBLER_INPUT)
    const proposal = compileProposal({
      snapshot,
      protocol: V3,
      binding: { acceptSupported: true, team: 'team12' },
      createdTaskId: 'fake-task-handover-1',
    })

    const accept = proposal.actions.find((action) => action.kind === 'accept')
    expect(accept?.payload).toEqual({ type: 'accept', resourceId: 'fake-task-handover-1' })
    expect(accept?.blockedReason).toBeUndefined()
    expect(accept?.requiresSeparateApproval).toBe(true)
    expect(accept?.label).toBe('live')
    expect(JSON.stringify(accept?.payload)).not.toContain(snapshot.result.id)
  })
})
