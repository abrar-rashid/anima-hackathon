import { describe, expect, it } from 'vitest'

import { ACTIVATION_REQUIREMENTS, activationAuditEntry, evaluate } from '@/governance/activation'
import { hashCandidate } from '@/governance/candidate-hash'
import { DISABLED_ACTIVATION_REASON, type GovernanceEvaluationInput } from '@/governance/types'

import { approval, clinicalStaff, NOW, operationalStaff, v4, validPlan } from './helpers'

function permittedInput(): GovernanceEvaluationInput {
  const candidateHash = hashCandidate(v4)
  return {
    candidate: v4,
    candidateHash,
    approvals: [
      approval('clinical-approver', clinicalStaff, candidateHash),
      approval('operational-approver', operationalStaff, candidateHash),
    ],
    plan: validPlan(),
    failingInvariantIds: [],
  }
}

describe('evaluate', () => {
  it('refuses activation when the clinical approver is missing', () => {
    const input = permittedInput()
    input.approvals = input.approvals.filter((row) => row.role !== 'clinical-approver')
    const decision = evaluate(input)
    expect(decision.permitted).toBe(false)
    expect(decision.reasonText).toBe(DISABLED_ACTIVATION_REASON)
    expect(decision.blockers.some((row) => row.code === 'missing-clinical-approver')).toBe(true)
  })

  it('refuses activation when the operational approver is missing', () => {
    const input = permittedInput()
    input.approvals = input.approvals.filter((row) => row.role !== 'operational-approver')
    const decision = evaluate(input)
    expect(decision.permitted).toBe(false)
    expect(decision.reasonText).toBe(DISABLED_ACTIVATION_REASON)
    expect(decision.blockers.some((row) => row.code === 'missing-operational-approver')).toBe(true)
  })

  it('refuses activation when an approver rejected', () => {
    const input = permittedInput()
    input.approvals = [
      input.approvals[0]!,
      approval('operational-approver', operationalStaff, input.candidateHash, 'REJECTED', NOW + 1),
    ]
    const decision = evaluate(input)
    expect(decision.permitted).toBe(false)
    expect(decision.reasonText).toBe(DISABLED_ACTIVATION_REASON)
    expect(decision.blockers.some((row) => row.code === 'rejected-by-approver')).toBe(true)
  })

  it('refuses activation when there is no rollback target', () => {
    const input = permittedInput()
    input.candidate = {
      ...v4,
      approval: { ...v4.approval, rollbackTarget: null },
    }
    input.candidateHash = hashCandidate(input.candidate)
    input.approvals = [
      approval('clinical-approver', clinicalStaff, input.candidateHash),
      approval('operational-approver', operationalStaff, input.candidateHash),
    ]
    input.plan = validPlan({ rollbackTargetId: '' })
    const decision = evaluate(input)
    expect(decision.permitted).toBe(false)
    expect(decision.reasonText).toBe(DISABLED_ACTIVATION_REASON)
    expect(decision.blockers.some((row) => row.code === 'no-rollback-target')).toBe(true)
  })

  it('refuses activation when there is no rollout plan', () => {
    const input = permittedInput()
    input.plan = null
    const decision = evaluate(input)
    expect(decision.permitted).toBe(false)
    expect(decision.reasonText).toBe(DISABLED_ACTIVATION_REASON)
    expect(decision.blockers.some((row) => row.code === 'no-rollout-plan')).toBe(true)
  })

  it('refuses activation when required invariants are failing', () => {
    const input = permittedInput()
    input.failingInvariantIds = [10]
    const decision = evaluate(input)
    expect(decision.permitted).toBe(false)
    expect(decision.reasonText).toBe(DISABLED_ACTIVATION_REASON)
    expect(decision.blockers.some((row) => row.code === 'invariants-failing')).toBe(true)
  })

  it('refuses activation when the candidate changed after approval', () => {
    const input = permittedInput()
    const mutated = { ...v4, ackDeadlineMinutes: 45 }
    input.candidate = mutated
    input.candidateHash = hashCandidate(mutated)
    const decision = evaluate(input)
    expect(decision.permitted).toBe(false)
    expect(decision.reasonText).toBe(DISABLED_ACTIVATION_REASON)
    expect(decision.blockers.some((row) => row.code === 'candidate-changed-since-approval')).toBe(true)
  })

  it('permits activation only when every clause is satisfied', () => {
    const decision = evaluate(permittedInput())
    expect(decision.permitted).toBe(true)
    expect(decision.blockers).toEqual([])
    expect(decision.reasonText).toBe('')
  })

  it('enumerates the complete activation condition set so it cannot quietly shrink', () => {
    expect(ACTIVATION_REQUIREMENTS).toEqual([
      'named-clinical-approver',
      'named-operational-approver',
      'distinct-app-side-approver-identities',
      'no-unsuperseded-rejection',
      'candidate-hash-matches-content',
      'approvals-bound-to-current-candidate-hash',
      'named-rollback-target',
      'valid-controlled-rollout-plan',
      'required-invariants-passing',
    ])
    expect(ACTIVATION_REQUIREMENTS).toHaveLength(9)
    expect(evaluate(permittedInput()).permitted).toBe(true)
  })

  it('refuses when the same staff identity is presented as both approvers', () => {
    const input = permittedInput()
    input.approvals = [
      approval('clinical-approver', clinicalStaff, input.candidateHash),
      approval('operational-approver', clinicalStaff, input.candidateHash),
    ]
    const decision = evaluate(input)
    expect(decision.permitted).toBe(false)
    expect(decision.reasonText).toBe(DISABLED_ACTIVATION_REASON)
    expect(
      decision.blockers.some(
        (row) => row.code === 'missing-clinical-approver' || row.code === 'missing-operational-approver',
      ),
    ).toBe(true)
  })

  it('writes an activation decision as an append-only audit entry with actor, reason and hash', () => {
    const input = permittedInput()
    input.plan = null
    const decision = evaluate(input)
    const entry = activationAuditEntry(decision, {
      entryId: 'audit-activation-1',
      protocolId: v4.id,
      candidateHash: input.candidateHash,
      actor: clinicalStaff,
      recordedAt: NOW,
      simulatorTime: NOW,
    })
    expect(entry.actor).toEqual(clinicalStaff)
    expect(entry.detail).toContain(DISABLED_ACTIVATION_REASON)
    expect(entry.detail).toContain(input.candidateHash)
  })
})
