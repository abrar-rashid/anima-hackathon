import type { StaffIdentity } from '@/domain/types'
import type { RolloutPlan } from '@/governance/types'
import type { AuditEntry } from '@/persistence/port'

const MS_PER_MIN = 60_000

export type PlanValidationFailure =
  | 'no-stages'
  | 'stage-missing-invariants'
  | 'stage-missing-teams'
  | 'missing-rollback-target'
  | 'missing-protocol'
  | 'invalid-hold'
  | 'duplicate-stage-id'

export type PlanValidationResult = { ok: true } | { ok: false; reason: PlanValidationFailure }

export type StartRolloutResult =
  | { ok: true; plan: RolloutPlan }
  | { ok: false; reason: PlanValidationFailure | 'plan-not-ready' }

export type AdvanceRefusal =
  | PlanValidationFailure
  | 'hold-period-active'
  | 'required-invariant-failing'
  | 'plan-not-in-progress'
  | 'already-complete'
  | 'unknown-current-stage'

export type AdvanceRolloutResult = { ok: true; plan: RolloutPlan } | { ok: false; reason: AdvanceRefusal }

export function validatePlan(plan: RolloutPlan): PlanValidationResult {
  if (typeof plan.rollbackTargetId !== 'string' || plan.rollbackTargetId.length === 0) {
    return { ok: false, reason: 'missing-rollback-target' }
  }
  if (typeof plan.protocolId !== 'string' || plan.protocolId.length === 0) {
    return { ok: false, reason: 'missing-protocol' }
  }
  if (!Array.isArray(plan.stages) || plan.stages.length === 0) {
    return { ok: false, reason: 'no-stages' }
  }
  const seen = new Set<string>()
  for (const stage of plan.stages) {
    if (typeof stage.stageId !== 'string' || stage.stageId.length === 0 || seen.has(stage.stageId)) {
      return { ok: false, reason: 'duplicate-stage-id' }
    }
    seen.add(stage.stageId)
    if (!Array.isArray(stage.teamIds) || stage.teamIds.length === 0) {
      return { ok: false, reason: 'stage-missing-teams' }
    }
    if (!Array.isArray(stage.requiredInvariantIds) || stage.requiredInvariantIds.length === 0) {
      return { ok: false, reason: 'stage-missing-invariants' }
    }
    if (typeof stage.holdMinutes !== 'number' || !Number.isFinite(stage.holdMinutes) || stage.holdMinutes < 0) {
      return { ok: false, reason: 'invalid-hold' }
    }
  }
  return { ok: true }
}

export function startRollout(plan: RolloutPlan): StartRolloutResult {
  const valid = validatePlan(plan)
  if (!valid.ok) return valid
  if (plan.status !== 'READY') return { ok: false, reason: 'plan-not-ready' }
  const first = plan.stages[0]
  if (!first) return { ok: false, reason: 'no-stages' }
  return {
    ok: true,
    plan: { ...plan, currentStageId: first.stageId, status: 'IN_PROGRESS' },
  }
}

export function advanceRollout(
  plan: RolloutPlan,
  input: { now: number; stageStartedAt: number; failingInvariantIds: readonly number[] },
): AdvanceRolloutResult {
  const valid = validatePlan(plan)
  if (!valid.ok) return valid
  if (plan.status === 'COMPLETE') return { ok: false, reason: 'already-complete' }
  if (plan.status !== 'IN_PROGRESS') return { ok: false, reason: 'plan-not-in-progress' }
  const index = plan.stages.findIndex((stage) => stage.stageId === plan.currentStageId)
  if (index < 0) return { ok: false, reason: 'unknown-current-stage' }
  const current = plan.stages[index]
  if (!current) return { ok: false, reason: 'unknown-current-stage' }
  if (input.now < input.stageStartedAt + current.holdMinutes * MS_PER_MIN) {
    return { ok: false, reason: 'hold-period-active' }
  }
  const failing = new Set(input.failingInvariantIds)
  if (current.requiredInvariantIds.some((id) => failing.has(id))) {
    return { ok: false, reason: 'required-invariant-failing' }
  }
  const next = plan.stages[index + 1]
  if (!next) {
    return { ok: true, plan: { ...plan, status: 'COMPLETE' } }
  }
  return { ok: true, plan: { ...plan, currentStageId: next.stageId, status: 'IN_PROGRESS' } }
}

export function rolloutAuditEntry(input: {
  entryId: string
  plan: RolloutPlan
  candidateHash: string
  actor: StaffIdentity | { kind: 'system'; name: string }
  reason: string
  recordedAt: number
  simulatorTime: number
  action: string
}): AuditEntry {
  return {
    entryId: input.entryId,
    caseId: `protocol:${input.plan.protocolId}`,
    recordedAt: input.recordedAt,
    simulatorTime: input.simulatorTime,
    actor: input.actor,
    action: input.action,
    subject: { resourceId: input.plan.protocolId },
    detail: `${input.reason} candidateHash=${input.candidateHash} plan=${input.plan.planId} stage=${input.plan.currentStageId ?? 'none'}`,
  }
}
