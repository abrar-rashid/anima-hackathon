import { clientRequestIdFrom } from '@/domain/idempotency'
import type { AnimaClient } from '@/adapters/anima/client'
import type { AnimaWritePort, ExecuteApprovedActionInput, SubmissionReceipt } from '@/ports/anima-write-port'

export class StaleVersionError extends Error {
  constructor(
    public readonly resourceId?: string,
    public readonly version?: number,
  ) {
    super('StaleVersionError')
    this.name = 'StaleVersionError'
  }
}

export class IdempotencyConflict extends Error {
  constructor(public readonly originalResourceId?: string) {
    super('IdempotencyConflict')
    this.name = 'IdempotencyConflict'
  }
}

export { clientRequestIdFrom }

interface ActionResource {
  id?: string
  version?: number
  createdAt?: number
  error?: string
  message?: string
  resourceId?: string
  originalResourceId?: string
  provenance?: {
    created?: {
      time?: number
      actor?: { kind?: string; name?: string }
      action?: string
    } | null
  }
}

export class AnimaWriteAdapter implements AnimaWritePort {
  constructor(private readonly client: AnimaClient) {}

  async executeApprovedAction(input: ExecuteApprovedActionInput): Promise<SubmissionReceipt> {
    const payload = input.payload && typeof input.payload === 'object' ? { ...(input.payload as Record<string, unknown>) } : {}
    const body = {
      ...payload,
      type: input.actionName,
      clientRequestId: clientRequestIdFrom(input.idempotencyKey),
    }
    const { status, body: response } = await this.client.request<ActionResource>(`/api/sites/${input.site}/actions`, {
      method: 'POST',
      headers: { 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify(body),
    })

    if (status === 409) {
      const text = `${response?.error ?? ''} ${response?.message ?? ''}`
      const originalId = response?.id ?? response?.resourceId ?? response?.originalResourceId
      if (/idempotenc|duplicate/i.test(text)) {
        throw new IdempotencyConflict(originalId)
      }
      throw new StaleVersionError(originalId, response?.version)
    }

    if (status !== 200) {
      throw Object.assign(new Error(`Anima write failed: ${status}`), { status })
    }

    const created = response?.provenance?.created
    return {
      resourceId: response?.id ?? '',
      version: response?.version ?? 1,
      simulatorTime: created?.time ?? response?.createdAt ?? 0,
      activity: created
        ? {
            actorKind: created.actor?.kind ?? 'team',
            actorName: created.actor?.name ?? '',
            action: created.action ?? input.actionName,
          }
        : null,
      httpStatus: status,
    }
  }
}
