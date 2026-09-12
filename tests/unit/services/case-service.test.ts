import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdkRuntimePort } from '@/ports/adk-runtime-port'
import { AdkRuntime } from '@/agents/runtime'
import { CaseSnapshotResponse, DISABLED_DEPLOY_REASON, TwinRequest, TwinResponse } from '@/api/contracts'
import { ELIGIBILITY_RULE_TEXT } from '@/domain/eligibility'
import { CaseService } from '@/services/case-service'
import { ExecutionService } from '@/services/execution-service'
import { hashProposal } from '@/services/proposal-hash'
import { CASE_ID, heroProposal, openedCase, persist, ports, staff } from './helpers'

const v3 = JSON.parse(readFileSync(join(process.cwd(), 'fixtures/protocols/v3.json'), 'utf8')) as {
  id: string
}

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', '')
})

function service(deps: ReturnType<typeof ports>) {
  const execution = new ExecutionService({
    read: deps.read,
    write: deps.write,
    store: deps.store,
    acceptSupported: true,
  })
  return new CaseService({
    read: deps.read,
    clock: deps.clock,
    runtime: new AdkRuntime(),
    store: deps.store,
    execution,
    acceptSupported: true,
    live: false,
    world: 'team-ea32f6302052',
    replay: null,
  })
}

describe('CaseService', () => {
  it('opens the preflight patient with the source-classified CRP result and a compiled proposal', async () => {
    const deps = ports()
    const snapshot = await service(deps).open({})
    const parsed = CaseSnapshotResponse.parse(snapshot)

    expect(parsed.case.patientId).toBe('SIM-000001')
    expect(parsed.case.sourceResultId).toBe('blood-v1-SIM-000001-crp-5')
    expect(parsed.case.sourceResultVersion).toBe(1)
    expect(parsed.case.currentAccountableOwner.teamId.length).toBeGreaterThan(0)
    expect(parsed.case.ownershipState).toBe('ORDERER_OWNS')
    expect(parsed.case.closureState).toBe('RESULT_AVAILABLE')
    expect(parsed.case.submissionState).toBe('NOT_SUBMITTED')
    expect(parsed.proposal?.actions.map((action) => action.kind)).toEqual(['create_task', 'accept'])
    expect(parsed.eligibility.ruleText).toBe(ELIGIBILITY_RULE_TEXT)
    expect(parsed.eligibility.selectedResultId).toBe('blood-v1-SIM-000001-crp-5')
    expect(parsed.connection.acceptSupported).toBe(true)
    expect(parsed.connection.world).toBe('team-ea32f6302052')
    expect(parsed.staffRoster[0]?.attribution).toBe('app-side')
    expect(parsed.replay).toBeNull()
  })

  it('uses a failed compiler fallback so a broken agent still leaves a usable proposal', async () => {
    const deps = ports()
    const runtime = {
      async run(name: 'context-assembler' | 'covenant-compiler' | 'reliability-analyst', input: unknown) {
        if (name === 'covenant-compiler') {
          const { compileProposal } = await import('@/agents/covenant-compiler')
          return {
            ok: false as const,
            error: 'model-unavailable',
            fallback: compileProposal(input),
            notes: ['fallback'],
          }
        }
        const { assembleSnapshot } = await import('@/agents/context-assembler')
        return { ok: true as const, value: assembleSnapshot(input), notes: [] }
      },
    } as AdkRuntimePort
    const execution = new ExecutionService({
      read: deps.read,
      write: deps.write,
      store: deps.store,
      acceptSupported: true,
    })
    const cases = new CaseService({
      read: deps.read,
      clock: deps.clock,
      runtime,
      store: deps.store,
      execution,
      acceptSupported: true,
      live: false,
      world: 'team-ea32f6302052',
      replay: null,
    })

    const snapshot = await cases.open({ patientId: 'SIM-000001' })
    expect(snapshot.proposal?.actions.length).toBeGreaterThan(0)
    expect(snapshot.snapshot?.result.id).toBe('blood-v1-SIM-000001-crp-5')
  })

  it('refuses approve in recorded replay mode and never calls the write port', async () => {
    const deps = ports()
    const proposal = heroProposal()
    persist(deps.store, openedCase(), proposal)
    const replay = {
      label: 'Recorded simulator replay' as const,
      world: 'team-ea32f6302052',
      capturedAt: '2026-09-12T12:21:05.075Z',
    }
    const stored = deps.store.get(CASE_ID)
    if (!stored) throw new Error('expected stored case')
    deps.store.save({ ...stored, replay })
    const cases = new CaseService({
      read: deps.read,
      clock: deps.clock,
      runtime: new AdkRuntime(),
      store: deps.store,
      execution: new ExecutionService({
        read: deps.read,
        write: deps.write,
        store: deps.store,
        acceptSupported: true,
      }),
      acceptSupported: true,
      live: false,
      world: 'team-ea32f6302052',
      replay,
    })

    await expect(
      cases.approve(CASE_ID, {
        proposalHash: hashProposal(proposal),
        approverId: staff.id,
        staff,
        actionIndexes: [0],
      }),
    ).rejects.toMatchObject({ code: 'replay-mode', status: 409 })
    expect(deps.write.calls).toHaveLength(0)
    expect(deps.store.get(CASE_ID)?.receipts ?? []).toHaveLength(0)
  })

  it('rejects a stale proposal hash without calling the write port', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    const cases = service(deps)

    await expect(
      cases.approve(CASE_ID, {
        proposalHash: 'p-not-the-hash',
        approverId: staff.id,
        staff,
        actionIndexes: [0],
      }),
    ).rejects.toMatchObject({ code: 'proposal-stale', status: 409 })
    expect(deps.write.calls).toHaveLength(0)
  })

  it('approves when the hash matches the proposal the server issued', async () => {
    const deps = ports()
    const proposal = heroProposal()
    persist(deps.store, openedCase(), proposal)
    const cases = service(deps)

    const result = await cases.approve(CASE_ID, {
      proposalHash: hashProposal(proposal),
      approverId: staff.id,
      staff,
      actionIndexes: [0],
    })
    expect(deps.write.calls).toHaveLength(1)
    expect(result.receipts[0]?.status).toBe('VISIBLE_DOWNSTREAM')
    expect(result.case.submissionState).toBe('VISIBLE_DOWNSTREAM')
  })

  it('uses the server roster when COVENANT_STAFF_ROSTER is unset and parses it when set', async () => {
    const unset = ports()
    const defaultSnapshot = await service(unset).open({ patientId: 'SIM-000001' })
    expect(defaultSnapshot.staffRoster).toEqual([
      { id: 'gp-duty-1', name: 'Dr Ada Sim', role: 'Duty GP', teamId: 'gp', attribution: 'app-side' },
      { id: 'hosp-1', name: 'Dr Morgan Bell', role: 'Hospital clinician', teamId: 'hospital', attribution: 'app-side' },
    ])

    vi.stubEnv(
      'COVENANT_STAFF_ROSTER',
      JSON.stringify([
        { id: 'comm-1', name: 'Community Nurse', role: 'Nurse', teamId: 'community' },
      ]),
    )
    const custom = ports()
    const customSnapshot = await service(custom).open({ patientId: 'SIM-000001' })
    expect(customSnapshot.staffRoster).toEqual([
      { id: 'comm-1', name: 'Community Nurse', role: 'Nurse', teamId: 'community', attribution: 'app-side' },
    ])
    vi.stubEnv('COVENANT_STAFF_ROSTER', '')
  })

  it('recompiles accept against the created task receipt, never the blood report', async () => {
    const deps = ports()
    const opened = await service(deps).open({ patientId: 'SIM-000001' })
    const first = opened.proposal
    if (!first) throw new Error('expected proposal')
    const acceptBefore = first.actions.find((action) => action.kind === 'accept')
    expect((acceptBefore?.payload as { resourceId?: string } | undefined)?.resourceId).toBeUndefined()

    const approved = await service(deps).approve(opened.case.caseId, {
      proposalHash: hashProposal(first),
      approverId: staff.id,
      staff,
      actionIndexes: [0],
    })
    expect(deps.write.calls).toHaveLength(1)
    expect(deps.write.calls[0]?.actionName).toBe('create_task')

    const compiled = await service(deps).compile(opened.case.caseId)
    const accept = compiled.proposal?.actions.find((action) => action.kind === 'accept')
    const createdId = approved.receipts[0]?.resourceId
    expect(createdId).toBeTruthy()
    expect((accept?.payload as { resourceId?: string }).resourceId).toBe(createdId)
    expect((accept?.payload as { resourceId?: string }).resourceId).not.toBe(
      'blood-v1-SIM-000001-crp-5',
    )
    expect(accept?.label).toBe('live')
    expect(accept?.requiresSeparateApproval).toBe(true)
  })

  it('replays the after-hours-timeout twin to PROPOSED when invariants pass', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    const body = TwinRequest.parse({
      traceId: 'after-hours-timeout',
      baseProtocolId: v3.id,
      diff: {
        receiverMode: 'ACCOUNTABLE_TEAM',
        ackDeadlineMinutes: 30,
        fallbackTeamId: 'gp-duty',
        exceptionRoute: 'duty-clinician-task',
        dedupeWindowMinutes: 60,
      },
    })
    const result = TwinResponse.parse(await service(deps).twin(CASE_ID, body))
    expect(result.candidateStatus).toBe('PROPOSED')
    expect(result.label).toBe('simulator regression evidence')
    expect(result.disabledDeployReason).toBe(DISABLED_DEPLOY_REASON)
    expect(result.comparison.sameTrace).toBe(true)
    expect(result.patch.requestedTwinRun).toBe(true)
  })

  it('returns FAILED_INVARIANTS for a candidate that worsens the baseline', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    const result = await service(deps).twin(CASE_ID, {
      traceId: 'after-hours-timeout',
      baseProtocolId: 'v4',
      diff: { dedupeWindowMinutes: 0, ackDeadlineMinutes: 1 },
    })
    expect(result.candidateStatus).toBe('FAILED_INVARIANTS')
    expect(result.comparison.candidateStatus).toBe('FAILED_INVARIANTS')
  })
})
