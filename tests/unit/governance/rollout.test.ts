import { describe, expect, it } from 'vitest'

import { advanceRollout, startRollout, validatePlan } from '@/governance/rollout'

import { NOW, validPlan } from './helpers'

describe('validatePlan', () => {
  it('accepts an ordered plan with teams, a hold and required invariants on every stage', () => {
    expect(validatePlan(validPlan())).toEqual({ ok: true })
  })

  it('rejects a plan with no stages', () => {
    const result = validatePlan(validPlan({ stages: [] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('no-stages')
  })

  it('rejects a stage with no required invariants', () => {
    const plan = validPlan()
    const result = validatePlan({
      ...plan,
      stages: [{ ...plan.stages[0]!, requiredInvariantIds: [] }],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('stage-missing-invariants')
  })
})

describe('advanceRollout', () => {
  it('refuses to advance during the hold period', () => {
    const started = startRollout(validPlan())
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const result = advanceRollout(started.plan, {
      now: NOW + 59 * 60_000,
      stageStartedAt: NOW,
      failingInvariantIds: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('hold-period-active')
  })

  it('refuses to advance when a required invariant is failing', () => {
    const started = startRollout(validPlan())
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const result = advanceRollout(started.plan, {
      now: NOW + 60 * 60_000,
      stageStartedAt: NOW,
      failingInvariantIds: [10],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('required-invariant-failing')
  })

  it('advances after the hold when required invariants pass', () => {
    const started = startRollout(validPlan())
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const result = advanceRollout(started.plan, {
      now: NOW + 60 * 60_000,
      stageStartedAt: NOW,
      failingInvariantIds: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.currentStageId).toBe('stage-all')
    expect(result.plan.status).toBe('IN_PROGRESS')
  })
})
