import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApproveResponse, CaseSnapshotResponse } from '@/api/contracts'
import { idempotencyKey } from '@/domain/idempotency'
import { hashProposal } from '@/services/proposal-hash'
import {
  assertNoClinicalInference,
  assertOwnerPresent,
  attachActivityEvidence,
  createdFakeTasks,
  fakeContainer,
  PATIENT_ID,
  readPort,
  recordHumanClinicalPath,
  RESULT_ID,
  staff,
  writePort,
} from './helpers'

beforeEach(() => {
  vi.stubEnv('COVENANT_FAKE_PORTS', '1')
  vi.stubEnv('COVENANT_RECORDED_REPLAY', '')
  vi.stubEnv('OPENAI_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('integration (a): source read → compile → approve → write → readback → evidenced', () => {
  it('rejects a mismatched proposalHash with no write, then evidences only after readback and Activity', async () => {
    const container = await fakeContainer()
    expect(container.mode).toBe('fake')
    expect(container.live).toBe(false)

    const opened = CaseSnapshotResponse.parse(await container.cases.open({ patientId: PATIENT_ID }))
    assertOwnerPresent(opened.case)
    assertNoClinicalInference(opened)
    expect(opened.case.patientId).toBe(PATIENT_ID)
    expect(opened.case.sourceResultId).toBe(RESULT_ID)
    expect(opened.case.sourceResultVersion).toBe(1)
    expect(opened.case.submissionState).toBe('NOT_SUBMITTED')
    expect(opened.case.currentAccountableOwner.teamId).toBe('hospital')
    expect(opened.replay).toBeNull()

    const compiled = CaseSnapshotResponse.parse(await container.cases.compile(opened.case.caseId))
    assertOwnerPresent(compiled.case)
    assertNoClinicalInference(compiled)
    expect(compiled.proposal).not.toBeNull()
    const proposal = compiled.proposal!
    const shownHash = hashProposal(proposal)

    const write = writePort(container)
    await expect(
      container.cases.approve(compiled.case.caseId, {
        proposalHash: 'p-not-the-hash-shown',
        approverId: staff.id,
        staff,
        actionIndexes: [0],
      }),
    ).rejects.toMatchObject({ code: 'proposal-stale', status: 409 })
    expect(write.calls).toHaveLength(0)
    expect(createdFakeTasks(readPort(container), PATIENT_ID)).toHaveLength(0)

    recordHumanClinicalPath(container.store, compiled.case.caseId)
    const ownerBeforeWrite = container.store.get(compiled.case.caseId)!.case.currentAccountableOwner.teamId

    const submitted = ApproveResponse.parse(
      await container.cases.approve(compiled.case.caseId, {
        proposalHash: shownHash,
        approverId: staff.id,
        staff,
        actionIndexes: [0],
      }),
    )
    assertOwnerPresent(submitted.case)
    expect(write.calls).toHaveLength(1)
    expect(write.calls[0]?.actionName).toBe('create_task')
    expect(write.calls[0]?.staffIdentity).toEqual(staff)
    expect(write.calls[0]?.expectedSourceVersions).toEqual([{ id: RESULT_ID, version: 1 }])
    expect(write.calls[0]?.idempotencyKey).toBe(
      idempotencyKey({
        team: 'team12',
        patientId: PATIENT_ID,
        resultId: RESULT_ID,
        resultVersion: 1,
        protocolVersion: compiled.protocol.id,
        actionKind: 'create_task',
        destination: 'gp',
      }),
    )
    expect(submitted.receipts[0]?.status).toBe('VISIBLE_DOWNSTREAM')
    expect(submitted.case.submissionState).toBe('VISIBLE_DOWNSTREAM')
    expect(submitted.case.eventLog.some((row) => row.event.type === 'ActionSubmitted')).toBe(true)
    expect(submitted.case.eventLog.some((row) => row.event.type === 'ActionVisibleDownstream')).toBe(true)
    expect(submitted.case.eventLog.some((row) => row.event.type === 'ActivityEvidenced')).toBe(false)
    expect(submitted.case.ownershipState).not.toBe('ACCEPTED')
    expect(submitted.case.currentAccountableOwner.teamId).toBe(ownerBeforeWrite)

    const resourceId = submitted.receipts[0]?.resourceId
    expect(resourceId).toBeTruthy()
    attachActivityEvidence(readPort(container), PATIENT_ID, resourceId!)

    const evidenced = await container.cases.refresh(compiled.case.caseId)
    assertOwnerPresent(evidenced.case)
    expect(evidenced.receipts[0]?.status).toBe('EVIDENCED')
    expect(evidenced.case.submissionState).toBe('EVIDENCED')
    expect(evidenced.case.eventLog.some((row) => row.event.type === 'ActivityEvidenced')).toBe(true)
    expect(evidenced.case.ownershipState).not.toBe('ACCEPTED')
    expect(evidenced.case.currentAccountableOwner.teamId).toBe(ownerBeforeWrite)
    expect(createdFakeTasks(readPort(container), PATIENT_ID)).toHaveLength(1)

    const retry = ApproveResponse.parse(
      await container.cases.approve(compiled.case.caseId, {
        proposalHash: shownHash,
        approverId: staff.id,
        staff,
        actionIndexes: [0],
      }),
    )
    assertOwnerPresent(retry.case)
    expect(write.calls).toHaveLength(2)
    expect(write.calls[1]?.idempotencyKey).toBe(write.calls[0]?.idempotencyKey)
    expect(createdFakeTasks(readPort(container), PATIENT_ID)).toHaveLength(1)
    expect(retry.case.submissionState).toBe('EVIDENCED')
  })
})
