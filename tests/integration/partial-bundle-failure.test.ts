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

describe('integration (c): receiving-team accept is a second approval and retries only that write', () => {
  it('evidences create_task first, then a failed accept retries only accept', async () => {
    const container = await fakeContainer()
    const opened = await container.cases.open({ patientId: PATIENT_ID })
    const compiled = await container.cases.compile(opened.case.caseId)
    assertOwnerPresent(compiled.case)
    expect(compiled.proposal?.actions).toHaveLength(2)

    recordHumanClinicalPath(container.store, compiled.case.caseId)
    scriptProvenanceOnTaskCreate(readPort(container))

    const write = writePort(container)
    const first = ApproveResponse.parse(
      await container.cases.approve(compiled.case.caseId, {
        proposalHash: hashProposal(compiled.proposal),
        approverId: staff.id,
        staff,
        actionIndexes: [0],
      }),
    )
    assertOwnerPresent(first.case)
    expect(first.receipts.find((row) => row.actionIndex === 0)?.status).toBe('EVIDENCED')
    expect(write.calls.map((call) => call.actionName)).toEqual(['create_task'])
    expect(createdFakeTasks(readPort(container), PATIENT_ID)).toHaveLength(1)

    const rebound = await container.cases.compile(compiled.case.caseId)
    const accept = rebound.proposal?.actions.find((action) => action.kind === 'accept')
    expect((accept?.payload as { resourceId?: string }).resourceId).toBe(first.receipts[0]?.resourceId)
    expect((accept?.payload as { resourceId?: string }).resourceId).not.toBe(
      'blood-v1-SIM-000001-crp-5',
    )

    const execute = write.executeApprovedAction.bind(write)
    write.executeApprovedAction = async (input) => {
      if (input.actionName === 'accept' && write.calls.filter((call) => call.actionName === 'accept').length === 0) {
        write.calls.push(input)
        throw Object.assign(new Error('fake write failed: 500'), { status: 500 })
      }
      if (input.actionName === 'accept') {
        write.calls.push(input)
        const resourceId =
          input.payload && typeof input.payload === 'object'
            ? String((input.payload as { resourceId?: string }).resourceId ?? '')
            : ''
        const existing = (readPort(container).records.get(PATIENT_ID) ?? []).find((item) => item.id === resourceId)
        if (existing) {
          readPort(container).addRecord(PATIENT_ID, {
            ...existing,
            status: 'accepted',
            version: existing.version + 1,
            provenance: {
              changes: [{ actor: { kind: 'team', name: 'team12' } }],
            },
          })
        }
        return {
          resourceId,
          version: (existing?.version ?? 1) + 1,
          simulatorTime: existing?.createdAt ?? 1_789_286_400_000,
          activity: { actorKind: 'team', actorName: 'gp', action: 'accept' },
          httpStatus: 200,
        }
      }
      return execute(input)
    }

    const failed = ApproveResponse.parse(
      await container.cases.approve(rebound.case.caseId, {
        proposalHash: hashProposal(rebound.proposal),
        approverId: staff.id,
        staff,
        actionIndexes: [1],
      }),
    )
    assertOwnerPresent(failed.case)
    expect(failed.receipts.find((row) => row.actionIndex === 1)?.status).toBe('FAILED')
    expect(failed.receipts.find((row) => row.actionIndex === 1)?.error).toMatch(/500/)
    expect(write.calls.map((call) => call.actionName)).toEqual(['create_task', 'accept'])
    expect(createdFakeTasks(readPort(container), PATIENT_ID)).toHaveLength(1)

    const retry = ApproveResponse.parse(
      await container.cases.approve(rebound.case.caseId, {
        proposalHash: hashProposal(rebound.proposal),
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
    expect(retry.receipts.every((row) => row.actionIndex === 1)).toBe(true)
    expect(retry.receipts.find((row) => row.actionIndex === 1)?.status).not.toBe('FAILED')
  })
})
