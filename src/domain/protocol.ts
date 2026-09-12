import { z } from 'zod'
import type { ProtocolVersion } from '@/domain/types'

const teamIdSchema = z.enum([
  'gp',
  'hospital',
  'community',
  'pharmacy',
  'diagnostics',
  'referrals',
  'wearables',
  'patient',
  'gp-duty',
])

export const protocolVersionSchema: z.ZodType<ProtocolVersion> = z.object({
  id: z.string().min(1),
  supersedes: z.string().nullable(),
  receiverMode: z.enum(['NAMED_ACTOR', 'ACCOUNTABLE_TEAM']),
  ackDeadlineMinutes: z.number().int().nonnegative(),
  fallbackTeamId: teamIdSchema,
  exceptionRoute: z.enum(['duty-clinician-task', 'orderer-task']),
  dedupeWindowMinutes: z.number().int().nonnegative(),
  clinicalPolicyRefs: z.array(z.string()),
  approval: z.object({
    status: z.enum(['ACTIVE', 'DRAFT', 'TESTING', 'FAILED_INVARIANTS', 'PASSED', 'PROPOSED']),
    approvers: z.array(z.string()),
    rollbackTarget: z.string().nullable(),
  }),
})

export function parseProtocol(input: unknown): ProtocolVersion {
  return protocolVersionSchema.parse(input)
}

export function deriveAckDeadlineAt(simulatorTime: number, protocol: ProtocolVersion): number {
  return simulatorTime + protocol.ackDeadlineMinutes * 60_000
}
