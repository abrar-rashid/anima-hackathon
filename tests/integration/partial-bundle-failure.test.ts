import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApproveResponse } from '@/api/contracts'
import { hashProposal } from '@/services/proposal-hash'
import {
  assertOwnerPresent,
  createdFakeTasks,
  fakeContainer,
  PATIENT_ID,
  readPort,
  recordHumanClinicalPath,
  scriptProvenanceOnTaskCreate,
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

describe('integration (c): partial bundle failure retries only the failed action', () => {
  it('evidences the first action, reports FAILED on the second, and a retry writes only the second', async () => {
    const container = await fakeContainer()
    const opened = await container.cases.open({ patientId: PATIENT_ID })
    const compiled = await container.cases.compile(opened.case.caseId)
    assertOwnerPresent(compiled.case)
    expect(compiled.proposal?.actions).toHaveLength(2)

    recordHumanClinicalPath(container.store, compiled.case.caseId)
    scriptProvenanceOnTaskCreate(readPort(container))

    const write = writePort(container)
    const execute = write.executeApprovedAction.bind(write)
    write.executeApprovedAction = async (input) => {
      if (input.actionName === 'accept' && write.calls.length === 1) {
        write.failNextWith(500)
      }
      return execute(input)
    }

    const first = ApproveResponse.parse(
      await container.cases.approve(compiled.case.caseId, {
        proposalHash: hashProposal(compiled.proposal),
        approverId: staff.id,
        staff,
        actionIndexes: [0, 1],
      }),
    )
    assertOwnerPresent(first.case)

    const row0 = first.receipts.find((row) => row.actionIndex === 0)
    const row1 = first.receipts.find((row) => row.actionIndex === 1)
    expect(row0?.status).toBe('EVIDENCED')
    expect(row1?.status).toBe('FAILED')
    expect(row1?.error).toMatch(/500/)
    expect(write.calls.map((call) => call.actionName)).toEqual(['create_task', 'accept'])
    expect(createdFakeTasks(readPort(container), PATIENT_ID)).toHaveLength(1)

    const retry = ApproveResponse.parse(
      await container.cases.approve(compiled.case.caseId, {
        proposalHash: hashProposal(compiled.proposal),
        approverId: staff.id,
        staff,
        actionIndexes: [1],
      }),
    )
    assertOwnerPresent(retry.case)
    expect(write.calls.map((call) => call.actionName)).toEqual(['create_task', 'accept', 'accept'])
    expect(write.calls[1]?.idempotencyKey).toBe(write.calls[2]?.idempotencyKey)
    expect(write.calls[0]?.idempotencyKey).not.toBe(write.calls[1]?.idempotencyKey)
    expect(createdFakeTasks(readPort(container), PATIENT_ID)).toHaveLength(1)

    const retried = retry.receipts.find((row) => row.actionIndex === 1)
    expect(retried?.status).not.toBe('FAILED')
    expect(retry.receipts.every((row) => row.actionIndex === 1)).toBe(true)
  })
})
