import { StaleVersionError } from '@/adapters/anima/write-adapter'
import type { FakeClock } from '@/adapters/fake/clock'
import type { FakeRead } from '@/adapters/fake/anima-read'
import type { VersionedRecord } from '@/ports/anima-read-port'
import type { AnimaWritePort, ExecuteApprovedActionInput, SubmissionReceipt } from '@/ports/anima-write-port'

const DEFAULT_NOW = 1789286400000

export class FakeWrite implements AnimaWritePort {
  readonly calls: ExecuteApprovedActionInput[] = []
  private nextFailures: number[] = []
  private nextTask = 1
  private readonly receipts = new Map<string, SubmissionReceipt>()

  constructor(
    private readonly read?: FakeRead,
    private readonly clock?: FakeClock,
  ) {}

  failNextWith(status: number): void {
    this.nextFailures.push(status)
  }

  async executeApprovedAction(input: ExecuteApprovedActionInput): Promise<SubmissionReceipt> {
    this.calls.push(input)
    const failure = this.nextFailures.shift()
    if (failure !== undefined) {
      if (failure === 409) throw new StaleVersionError()
      throw Object.assign(new Error(`fake write failed: ${failure}`), { status: failure })
    }

    const existing = this.receipts.get(input.idempotencyKey)
    if (existing) return existing

    const payload = input.payload && typeof input.payload === 'object' ? (input.payload as Record<string, unknown>) : {}
    const now = this.clock ? (await this.clock.read()).now : DEFAULT_NOW
    const resourceId = `fake-task-${this.nextTask}`
    this.nextTask += 1
    const version = 1
    const patientId = typeof payload.patientId === 'string' ? payload.patientId : undefined
    const title = typeof payload.title === 'string' ? payload.title : input.actionName

    if (this.read && (input.actionName === 'create_task' || payload.type === 'create_task') && patientId) {
      const record: VersionedRecord = {
        id: resourceId,
        kind: 'task',
        version,
        patientId,
        owner: input.site,
        visibleTo: [input.site],
        status: 'open',
        createdAt: now,
        data: { title },
      }
      this.read.addRecord(patientId, record)
    }

    const receipt: SubmissionReceipt = {
      resourceId,
      version,
      simulatorTime: now,
      activity: {
        actorKind: 'team',
        actorName: input.staffIdentity.teamId,
        action: input.actionName,
      },
      httpStatus: 200,
    }
    this.receipts.set(input.idempotencyKey, receipt)
    return receipt
  }
}
