import { describe, expect, it } from 'vitest'
import { IdempotencyConflict } from '@/adapters/anima/write-adapter'
import { FakeWrite } from '@/adapters/fake/anima-write'
import { idempotencyKey } from '@/domain/idempotency'
import type { AnimaWritePort, ExecuteApprovedActionInput, SubmissionReceipt } from '@/ports/anima-write-port'
import { ExecutionService } from '@/services/execution-service'
import {
  approval,
  CASE_ID,
  heroProposal,
  informedCase,
  openedCase,
  PATIENT_ID,
  persist,
  ports,
  protocol,
  RESULT_ID,
  staff,
} from './helpers'

function service(
  deps: ReturnType<typeof ports>,
  acceptSupported: boolean | null = true,
): ExecutionService {
  return new ExecutionService({
    read: deps.read,
    write: deps.write,
    store: deps.store,
    acceptSupported,
  })
}

describe('ExecutionService.execute', () => {
  it('1. rejects the write when approval is not true or staff identity is missing', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    const exec = service(deps)

    const unapproved = await exec.execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(false),
      actionIndexes: [0],
      staff,
    })
    expect(unapproved.receipts[0]?.status).toBe('FAILED')
    expect(unapproved.receipts[0]?.error).toBe('writes-disabled: staff identity absent')
    expect(deps.write.calls).toHaveLength(0)
    expect(unapproved.case.submissionState).toBe('NOT_SUBMITTED')

    const noStaff = await exec.execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(true),
      actionIndexes: [0],
      staff: null,
    })
    expect(noStaff.receipts[0]?.error).toBe('writes-disabled: staff identity absent')
    expect(deps.write.calls).toHaveLength(0)
  })

  it('2. returns STALE and writes nothing when the current source version no longer matches the proposal', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    deps.read.addRecord(PATIENT_ID, {
      id: RESULT_ID,
      kind: 'report',
      version: 2,
      patientId: PATIENT_ID,
      owner: 'diagnostics',
      visibleTo: ['gp', 'hospital', 'diagnostics'],
      status: 'available',
      createdAt: 1_789_117_200_000,
      data: {
        kind: 'blood-result',
        collectedAt: 1_789_113_600_000,
        analytes: [
          {
            id: 'crp',
            name: 'C-reactive protein',
            unit: 'mg/L',
            value: 5.6,
            referenceLow: 0,
            referenceHigh: 5,
          },
        ],
      },
    })
    const exec = service(deps)

    const result = await exec.execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(true),
      actionIndexes: [0],
      staff,
    })

    expect(result.receipts).toEqual([
      expect.objectContaining({ actionIndex: 0, status: 'STALE', resourceId: null }),
    ])
    expect(deps.write.calls).toHaveLength(0)
    expect(result.case.submissionState).toBe('NOT_SUBMITTED')
    expect(result.case.ownershipState).toBe('STALE')
  })

  it('3a. skips unsupported Protocol preview actions and does not write them', async () => {
    const deps = ports()
    const proposal = heroProposal({
      actions: [
        {
          ...heroProposal().actions[0]!,
          supported: false,
          label: 'Protocol preview',
        },
      ],
    })
    persist(deps.store, openedCase(), proposal)
    const exec = service(deps)

    const result = await exec.execute({
      caseId: CASE_ID,
      proposal,
      approval: approval(true),
      actionIndexes: [0],
      staff,
    })

    expect(deps.write.calls).toHaveLength(0)
    expect(result.case.submissionState).toBe('NOT_SUBMITTED')
    expect(result.receipts).toHaveLength(0)
  })

  it('3b. on HTTP 200 appends ActionSubmitted and sets SUBMITTED only', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    const write = new FakeWrite()
    const exec = new ExecutionService({
      read: deps.read,
      write,
      store: deps.store,
      acceptSupported: false,
    })

    const result = await exec.execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(true),
      actionIndexes: [0],
      staff,
    })

    expect(write.calls).toHaveLength(1)
    expect(write.calls[0]?.staffIdentity).toEqual(staff)
    expect(write.calls[0]?.expectedSourceVersions).toEqual([{ id: RESULT_ID, version: 1 }])
    expect(write.calls[0]?.idempotencyKey).toBe(
      idempotencyKey({
        team: 'team12',
        patientId: PATIENT_ID,
        resultId: RESULT_ID,
        resultVersion: 1,
        protocolVersion: protocol.id,
        actionKind: 'create_task',
        destination: 'gp',
      }),
    )
    expect(result.receipts[0]?.status).toBe('SUBMITTED')
    expect(result.case.submissionState).toBe('SUBMITTED')
    expect(result.case.eventLog.some((row) => row.event.type === 'ActionSubmitted')).toBe(true)
    expect(result.case.eventLog.some((row) => row.event.type === 'ActionVisibleDownstream')).toBe(false)
    expect(result.case.eventLog.some((row) => row.event.type === 'ActivityEvidenced')).toBe(false)
  })

  it('3c. on thrown network error readbacks then retries once with the same idempotency key', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    const inner = new FakeWrite()
    let attempts = 0
    const flaky: AnimaWritePort = {
      async executeApprovedAction(input: ExecuteApprovedActionInput): Promise<SubmissionReceipt> {
        attempts += 1
        if (attempts === 1) {
          inner.calls.push(input)
          throw new Error('network down')
        }
        return inner.executeApprovedAction(input)
      },
    }
    const exec = new ExecutionService({
      read: deps.read,
      write: flaky,
      store: deps.store,
      acceptSupported: false,
    })

    const result = await exec.execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(true),
      actionIndexes: [0],
      staff,
    })

    expect(attempts).toBe(2)
    expect(inner.calls[0]?.idempotencyKey).toBe(inner.calls[1]?.idempotencyKey)
    expect(result.receipts[0]?.status).toBe('SUBMITTED')
    expect(result.case.submissionState).toBe('SUBMITTED')
  })

  it('3d. on IdempotencyConflict links the original as DUPLICATE_LINKED without a new write', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    const conflicting: AnimaWritePort = {
      async executeApprovedAction(input) {
        deps.write.calls.push(input)
        throw new IdempotencyConflict('original-task-9')
      },
    }
    const exec = new ExecutionService({
      read: deps.read,
      write: conflicting,
      store: deps.store,
      acceptSupported: false,
    })

    const result = await exec.execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(true),
      actionIndexes: [0],
      staff,
    })

    expect(deps.write.calls).toHaveLength(1)
    expect(result.receipts[0]).toEqual(
      expect.objectContaining({
        status: 'DUPLICATE_LINKED',
        resourceId: 'original-task-9',
      }),
    )
    expect(result.case.submissionState).toBe('NOT_SUBMITTED')
    expect(result.case.eventLog.some((row) => row.event.type === 'ActionSubmitted')).toBe(false)
  })

  it('3e. continues remaining actions when one action in the bundle fails', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    const inner = new FakeWrite()
    const partial: AnimaWritePort = {
      async executeApprovedAction(input) {
        if (input.actionName === 'accept') {
          inner.calls.push(input)
          throw Object.assign(new Error('fake write failed: 500'), { status: 500 })
        }
        return inner.executeApprovedAction(input)
      },
    }
    const exec = new ExecutionService({
      read: deps.read,
      write: partial,
      store: deps.store,
      acceptSupported: true,
    })

    const result = await exec.execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(true),
      actionIndexes: [0, 1],
      staff,
    })

    expect(inner.calls.some((call) => call.actionName === 'create_task')).toBe(true)
    expect(result.receipts.find((row) => row.actionIndex === 0)?.status).toBe('SUBMITTED')
    expect(result.receipts.find((row) => row.actionIndex === 1)?.status).toBe('FAILED')
    expect(result.case.submissionState).toBe('SUBMITTED')
    expect(result.case.eventLog.filter((row) => row.event.type === 'ActionSubmitted')).toHaveLength(1)
  })

  it('4. appends ActionVisibleDownstream from a matching readback and TransferAccepted only when accept evidence is present', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    const accepting: AnimaWritePort = {
      async executeApprovedAction(input) {
        const receipt = await deps.write.executeApprovedAction(input)
        if (input.actionName === 'create_task') {
          deps.read.addRecord(PATIENT_ID, {
            id: receipt.resourceId,
            kind: 'task',
            version: 2,
            patientId: PATIENT_ID,
            owner: 'gp',
            visibleTo: ['gp'],
            status: 'accepted',
            createdAt: receipt.simulatorTime,
            data: { title: 'Acknowledge abnormal-result handover' },
            provenance: {
              created: {
                actor: { kind: 'team', name: 'team12' },
                time: receipt.simulatorTime,
                version: 2,
                action: 'accept',
              },
              changes: [{ actor: { kind: 'team', name: 'team12' } }],
            },
          })
        }
        return receipt
      },
    }
    const exec = new ExecutionService({
      read: deps.read,
      write: accepting,
      store: deps.store,
      acceptSupported: true,
    })

    const result = await exec.execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(true),
      actionIndexes: [0],
      staff,
    })

    expect(result.receipts[0]?.status).toBe('ACCEPTED')
    expect(result.case.submissionState).toBe('ACCEPTED')
    expect(result.case.ownershipState).toBe('ACCEPTED')
    expect(result.case.currentAccountableOwner).toEqual({ teamId: 'gp', actorId: staff.id })
    expect(result.case.acceptingActor?.attribution).toBe('app-side')
    expect(result.case.eventLog.some((row) => row.event.type === 'ActionVisibleDownstream')).toBe(true)
    expect(result.case.eventLog.some((row) => row.event.type === 'TransferAccepted')).toBe(true)
  })

  it('4b. leaves ownership unchanged when readback is visible but acceptance evidence is missing', async () => {
    const deps = ports()
    persist(deps.store, openedCase(), heroProposal())
    const exec = service(deps, true)

    const result = await exec.execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(true),
      actionIndexes: [0],
      staff,
    })

    expect(result.case.eventLog.some((row) => row.event.type === 'ActionVisibleDownstream')).toBe(true)
    expect(result.case.eventLog.some((row) => row.event.type === 'TransferAccepted')).toBe(false)
    expect(result.case.ownershipState).not.toBe('ACCEPTED')
    expect(result.case.currentAccountableOwner.teamId).toBe('hospital')
    expect(result.receipts[0]?.status).toBe('VISIBLE_DOWNSTREAM')
  })

  it('5. appends ActivityEvidenced when provenance.created matches, otherwise stays VISIBLE_DOWNSTREAM with the hard stop', async () => {
    const deps = ports()
    persist(deps.store, informedCase(), heroProposal())
    const withActivity: AnimaWritePort = {
      async executeApprovedAction(input) {
        const receipt = await deps.write.executeApprovedAction(input)
        deps.read.addRecord(PATIENT_ID, {
          id: receipt.resourceId,
          kind: 'task',
          version: receipt.version,
          patientId: PATIENT_ID,
          owner: 'gp',
          visibleTo: ['gp'],
          status: 'open',
          createdAt: receipt.simulatorTime,
          data: { title: 'Acknowledge abnormal-result handover' },
          provenance: {
            created: {
              actor: { kind: 'team', name: 'team12' },
              time: receipt.simulatorTime,
              version: receipt.version,
              action: 'create_task',
            },
          },
        })
        deps.read.addEvent({
          id: `act-${receipt.resourceId}`,
          time: receipt.simulatorTime,
          type: 'create_task',
          actor: 'team12',
          resourceId: receipt.resourceId,
          patientId: PATIENT_ID,
          detail: 'created',
        })
        return receipt
      },
    }
    const evidenced = await new ExecutionService({
      read: deps.read,
      write: withActivity,
      store: deps.store,
      acceptSupported: false,
    }).execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(true),
      actionIndexes: [0],
      staff,
    })

    expect(evidenced.receipts[0]?.status).toBe('EVIDENCED')
    expect(evidenced.case.submissionState).toBe('EVIDENCED')
    expect(evidenced.case.eventLog.some((row) => row.event.type === 'ActivityEvidenced')).toBe(true)
    expect(evidenced.hardStops).not.toContain('Activity evidence unavailable: closure/audit claim blocked')

    const missing = ports()
    persist(missing.store, openedCase(), heroProposal())
    const blocked = await service(missing, false).execute({
      caseId: CASE_ID,
      proposal: heroProposal(),
      approval: approval(true),
      actionIndexes: [0],
      staff,
    })
    expect(blocked.case.submissionState).toBe('VISIBLE_DOWNSTREAM')
    expect(blocked.receipts[0]?.status).toBe('VISIBLE_DOWNSTREAM')
    expect(blocked.hardStops).toContain('Activity evidence unavailable: closure/audit claim blocked')
    expect(blocked.case.eventLog.some((row) => row.event.type === 'ActivityEvidenced')).toBe(false)
  })
})
