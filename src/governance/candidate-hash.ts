import type { ProtocolVersion } from '@/domain/types'

/**
 * Canonical candidate content. Approval.status and approval.approvers are excluded
 * so recording a decision or advancing DRAFT → PROPOSED cannot void the hash the
 * decision is bound to. Grammar fields, identity and the named rollback target are
 * included: any of those changing produces a different hash.
 */
export function candidateContent(protocol: ProtocolVersion): {
  id: string
  supersedes: string | null
  receiverMode: ProtocolVersion['receiverMode']
  ackDeadlineMinutes: number
  fallbackTeamId: ProtocolVersion['fallbackTeamId']
  exceptionRoute: ProtocolVersion['exceptionRoute']
  dedupeWindowMinutes: number
  clinicalPolicyRefs: readonly string[]
  rollbackTarget: string | null
} {
  return {
    id: protocol.id,
    supersedes: protocol.supersedes,
    receiverMode: protocol.receiverMode,
    ackDeadlineMinutes: protocol.ackDeadlineMinutes,
    fallbackTeamId: protocol.fallbackTeamId,
    exceptionRoute: protocol.exceptionRoute,
    dedupeWindowMinutes: protocol.dedupeWindowMinutes,
    clinicalPolicyRefs: protocol.clinicalPolicyRefs,
    rollbackTarget: protocol.approval.rollbackTarget,
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      const item = record[key]
      if (item !== undefined) next[key] = canonicalize(item)
    }
    return next
  }
  return value
}

function fnv1a(encoded: string): string {
  let hash = 2166136261
  for (let i = 0; i < encoded.length; i += 1) {
    hash ^= encoded.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `c${(hash >>> 0).toString(16)}`
}

export function hashCandidate(protocol: ProtocolVersion): string {
  return fnv1a(JSON.stringify(canonicalize(candidateContent(protocol))))
}
