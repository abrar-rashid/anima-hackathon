import { describe, expect, it } from 'vitest'

import { assembleSnapshot } from '@/agents/context-assembler'
import { AdkRuntime } from '@/agents/runtime'
import type { PatchProposal, Proposal, Snapshot } from '@/agents/schemas'
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

describe('AdkRuntime', () => {
  it("run('context-assembler' | 'covenant-compiler' | 'reliability-analyst') returns AgentRunResult", async () => {
    const runtime = new AdkRuntime()
    const assembled = await runtime.run<typeof SIM_ASSEMBLER_INPUT, Snapshot>(
      'context-assembler',
      SIM_ASSEMBLER_INPUT,
    )
    expect(assembled.ok).toBe(true)
    if (!assembled.ok) throw new Error(assembled.error)
    expect(assembled.value.orderingTeamId).toBe('hospital')
    expect(assembled.value.citations.length).toBeGreaterThan(0)

    const compiled = await runtime.run<
      { snapshot: Snapshot; protocol: ProtocolVersion; binding: { acceptSupported: null; team: string } },
      Proposal
    >('covenant-compiler', {
      snapshot: assembleSnapshot(SIM_ASSEMBLER_INPUT),
      protocol: V3,
      binding: { acceptSupported: null, team: 'team12' },
    })
    expect(compiled.ok).toBe(true)
    if (!compiled.ok) throw new Error(compiled.error)
    expect(compiled.value.actions.some((action) => action.label === 'Protocol preview')).toBe(true)

    const analysed = await runtime.run<
      {
        baseProtocol: ProtocolVersion
        proposedDiff: Record<string, unknown>
        traceRef: string
        denominator: { traces: number; events: number }
      },
      PatchProposal
    >('reliability-analyst', {
      baseProtocol: V3,
      proposedDiff: { ackDeadlineMinutes: 30, abnormalityThreshold: 1 },
      traceRef: 'after-hours-timeout',
      denominator: { traces: 1, events: 12 },
    })
    expect(analysed.ok).toBe(true)
    if (!analysed.ok) throw new Error(analysed.error)
    expect(analysed.value.diff).not.toHaveProperty('abnormalityThreshold')
  })
})
