import { describe, it, expect } from 'vitest'
import { clientRequestIdFrom, idempotencyKey } from '@/domain/idempotency'

const input = {
  team: 'gp',
  patientId: 'SIM-000001',
  resultId: 'blood-v1-SIM-000001-crp-5',
  resultVersion: 1,
  protocolVersion: 'proto-v1',
  actionKind: 'create_task',
  destination: 'hospital',
}

describe('idempotency', () => {
  it('identical idempotency input produces an identical key', () => {
    const a = idempotencyKey(input)
    const b = idempotencyKey({ ...input })
    expect(a).toBe(b)
    expect(a).toBe(
      'gp|SIM-000001|blood-v1-SIM-000001-crp-5|1|proto-v1|create_task|hospital',
    )
  })

  it('clientRequestIdFrom is a deterministic UUID v8 with version nibble 8 and variant nibble 8', () => {
    const key = idempotencyKey(input)
    const id = clientRequestIdFrom(key)
    const again = clientRequestIdFrom(key)
    expect(id).toBe(again)
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(clientRequestIdFrom(key + '|other')).not.toBe(id)
  })

  it('clientRequestIdFrom matches the Action.clientRequestId OpenAPI uuid pattern', () => {
    const pattern =
      /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/
    expect(clientRequestIdFrom(idempotencyKey(input))).toMatch(pattern)
  })
})
