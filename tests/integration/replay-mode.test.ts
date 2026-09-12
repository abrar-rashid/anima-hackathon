import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApproveRequest, CaseSnapshotResponse } from '@/api/contracts'
import { hashProposal } from '@/services/proposal-hash'
import {
  assertOwnerPresent,
  createdFakeTasks,
  PATIENT_ID,
  readPort,
  staff,
  writePort,
} from './helpers'

beforeEach(() => {
  vi.stubEnv('COVENANT_FAKE_PORTS', '')
  vi.stubEnv('COVENANT_RECORDED_REPLAY', '1')
  vi.stubEnv('OPENAI_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('integration (e): replay-mode snapshot cannot produce receipts', () => {
  it('refuses approve with HTTP 409 replay-mode and writes nothing', async () => {
    const { getContainer, resetContainer } = await import('@/services/container')
    resetContainer()
    const container = getContainer()
    expect(container.mode).toBe('replay')
    expect(container.replay).not.toBeNull()
    expect(container.replay?.label).toBe('Recorded simulator replay')

    const opened = CaseSnapshotResponse.parse(await container.cases.open({ patientId: PATIENT_ID }))
    assertOwnerPresent(opened.case)
    expect(opened.replay).not.toBeNull()
    expect(opened.replay?.label).toBe('Recorded simulator replay')
    expect(opened.replay?.world.length).toBeGreaterThan(0)
    expect(opened.replay?.capturedAt.length).toBeGreaterThan(0)

    const writesBefore = writePort(container).calls.length
    const tasksBefore = createdFakeTasks(readPort(container), PATIENT_ID).length

    await expect(
      container.cases.approve(opened.case.caseId, {
        proposalHash: hashProposal(opened.proposal),
        approverId: staff.id,
        staff,
        actionIndexes: [0],
      }),
    ).rejects.toMatchObject({ code: 'replay-mode', status: 409 })

    expect(writePort(container).calls).toHaveLength(writesBefore)
    expect(createdFakeTasks(readPort(container), PATIENT_ID)).toHaveLength(tasksBefore)
    expect(container.store.get(opened.case.caseId)?.receipts ?? []).toHaveLength(0)
  })

  it('POST approve returns 409 replay-mode and no receipts', async () => {
    const { resetContainer, getContainer } = await import('@/services/container')
    resetContainer()
    const { POST: open } = await import('@/app/api/case/open/route')
    const opened = await open(
      new Request('http://localhost/api/case/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patientId: PATIENT_ID }),
      }),
    )
    expect(opened.status).toBe(200)
    const snapshot = CaseSnapshotResponse.parse(await opened.json())
    expect(snapshot.replay).not.toBeNull()

    const { POST: approve } = await import('@/app/api/case/[caseId]/approve/route')
    const response = await approve(
      new Request(`http://localhost/api/case/${snapshot.case.caseId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          ApproveRequest.parse({
            proposalHash: hashProposal(snapshot.proposal),
            approverId: staff.id,
            staff,
            actionIndexes: [0],
          }),
        ),
      }),
      { params: Promise.resolve({ caseId: snapshot.case.caseId }) },
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'replay-mode' })
    expect(writePort(getContainer()).calls).toHaveLength(0)
    expect(getContainer().store.get(snapshot.case.caseId)?.receipts ?? []).toHaveLength(0)
  })
})
