import { describe, it, expect } from 'vitest'
import { deriveAckDeadlineAt, parseProtocol, protocolVersionSchema } from '@/domain/protocol'
import type { ProtocolVersion } from '@/domain/types'

const validProtocol: ProtocolVersion = {
  id: 'proto-v1',
  supersedes: null,
  receiverMode: 'NAMED_ACTOR',
  ackDeadlineMinutes: 30,
  fallbackTeamId: 'gp-duty',
  exceptionRoute: 'duty-clinician-task',
  dedupeWindowMinutes: 15,
  clinicalPolicyRefs: ['policy-a'],
  approval: { status: 'DRAFT', approvers: [], rollbackTarget: null },
}

describe('protocol schema and deadlines', () => {
  it('deriveAckDeadlineAt uses only protocol.ackDeadlineMinutes', () => {
    const t = 1_789_286_400_000
    expect(deriveAckDeadlineAt(t, validProtocol)).toBe(t + 30 * 60_000)
    expect(
      deriveAckDeadlineAt(t, { ...validProtocol, ackDeadlineMinutes: 120 }),
    ).toBe(t + 120 * 60_000)
  })

  it('protocolVersionSchema accepts a well-formed ProtocolVersion', () => {
    const parsed = protocolVersionSchema.parse(validProtocol)
    expect(parsed.receiverMode).toBe('NAMED_ACTOR')
    expect(parsed.fallbackTeamId).toBe('gp-duty')
  })

  it('parseProtocol rejects invalid receiverMode enum and non-numeric ackDeadlineMinutes', () => {
    expect(() => parseProtocol({ ...validProtocol, receiverMode: 'EVERYONE' })).toThrow()
    expect(() => parseProtocol({ ...validProtocol, ackDeadlineMinutes: 'soon' })).toThrow()
  })
})
