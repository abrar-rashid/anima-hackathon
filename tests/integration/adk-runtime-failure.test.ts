import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApproveRequest, ApproveResponse, CaseSnapshotResponse } from '@/api/contracts'
import { CaseService } from '@/services/case-service'
import { hashProposal } from '@/services/proposal-hash'
import {
  assertNoClinicalInference,
  assertOwnerPresent,
  createdFakeTasks,
  fakeContainer,
  PATIENT_ID,
  readPort,
  recordHumanClinicalPath,
  staff,
  writePort,
} from './helpers'

vi.mock('@/agents/app', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/agents/app')>()
  return {
    ...actual,
    app: new Proxy(actual.app, {
      get(target, prop, receiver) {
        if (prop === 'run') {
          return async () => {
            throw new Error('adk-runtime-down')
          }
        }
        return Reflect.get(target, prop, receiver)
      },
    }),
  }
})

beforeEach(() => {
  vi.stubEnv('COVENANT_FAKE_PORTS', '1')
  vi.stubEnv('COVENANT_RECORDED_REPLAY', '')
  vi.stubEnv('OPENAI_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('integration (d): ADK runtime failure does not block the manual path', () => {
  it('returns a deterministic snapshot and proposal when app.run throws, and approve still writes', async () => {
    const container = await fakeContainer()
    const cases = new CaseService({
      read: container.read,
      clock: container.clock,
      runtime: container.runtime,
      store: container.store,
      execution: container.execution,
      acceptSupported: container.acceptSupported,
      live: true,
      world: 'team-ea32f6302052',
      replay: null,
    })

    const opened = CaseSnapshotResponse.parse(await cases.open({ patientId: PATIENT_ID }))
    assertOwnerPresent(opened.case)
    assertNoClinicalInference(opened)
    expect(opened.snapshot?.result.id).toBe('blood-v1-SIM-000001-crp-5')
    expect(opened.proposal?.actions.length).toBeGreaterThan(0)
    expect(opened.connection.live).toBe(true)
    expect(opened.proposal?.actions.map((action) => action.kind)).toEqual(['create_task', 'accept'])

    recordHumanClinicalPath(container.store, opened.case.caseId)
    const approved = ApproveResponse.parse(
      await cases.approve(opened.case.caseId, {
        proposalHash: hashProposal(opened.proposal),
        approverId: staff.id,
        staff,
        actionIndexes: [0],
      }),
    )
    assertOwnerPresent(approved.case)
    expect(writePort(container).calls).toHaveLength(1)
    expect(approved.receipts[0]?.status).not.toBe('FAILED')
    expect(createdFakeTasks(readPort(container), PATIENT_ID)).toHaveLength(1)
  })

  it('POST /api/case/open still returns a usable snapshot when the ADK session throws', async () => {
    const { resetContainer } = await import('@/services/container')
    resetContainer()
    const { POST: open } = await import('@/app/api/case/open/route')
    const response = await open(
      new Request('http://localhost/api/case/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patientId: PATIENT_ID }),
      }),
    )
    expect(response.status).toBe(200)
    const body = CaseSnapshotResponse.parse(await response.json())
    assertOwnerPresent(body.case)
    assertNoClinicalInference(body)
    expect(body.snapshot).not.toBeNull()
    expect(body.proposal?.actions.length).toBeGreaterThan(0)
    expect(body.connection.live).toBe(false)

    const { POST: approve } = await import('@/app/api/case/[caseId]/approve/route')
    const { getContainer } = await import('@/services/container')
    recordHumanClinicalPath(getContainer().store, body.case.caseId)
    const approved = await approve(
      new Request(`http://localhost/api/case/${body.case.caseId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          ApproveRequest.parse({
            proposalHash: hashProposal(body.proposal),
            approverId: staff.id,
            staff,
            actionIndexes: [0],
          }),
        ),
      }),
      { params: Promise.resolve({ caseId: body.case.caseId }) },
    )
    expect(approved.status).toBe(200)
    const result = ApproveResponse.parse(await approved.json())
    assertOwnerPresent(result.case)
    expect(writePort(getContainer()).calls.length).toBeGreaterThan(0)
    expect(result.receipts[0]?.status).not.toBe('FAILED')
  })
})
