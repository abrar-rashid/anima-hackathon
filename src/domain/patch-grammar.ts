import type { ProtocolVersion } from '@/domain/types'

export const PATCH_ALLOWED_FIELDS = [
  'receiverMode',
  'ackDeadlineMinutes',
  'fallbackTeamId',
  'exceptionRoute',
  'dedupeWindowMinutes',
] as const

export type PatchAllowedField = (typeof PATCH_ALLOWED_FIELDS)[number]

export type PatchResult =
  | { ok: true; candidate: ProtocolVersion }
  | { ok: false; rejectedFields: string[] }

export function validatePatch(base: ProtocolVersion, diff: Record<string, unknown>): PatchResult {
  const allowed = new Set<string>(PATCH_ALLOWED_FIELDS)
  const rejectedFields = Object.keys(diff).filter((field) => !allowed.has(field))
  if (rejectedFields.length > 0) return { ok: false, rejectedFields }

  const candidate: ProtocolVersion = {
    ...base,
    ...(diff as Partial<Pick<ProtocolVersion, PatchAllowedField>>),
    id: `${base.id}-candidate`,
    supersedes: base.id,
    clinicalPolicyRefs: base.clinicalPolicyRefs,
    approval: {
      status: 'DRAFT',
      approvers: [],
      rollbackTarget: base.id,
    },
  }
  return { ok: true, candidate }
}
