import { describe, expect, it } from 'vitest'

import { hashCandidate } from '@/governance/candidate-hash'

import { approval, clinicalStaff, operationalStaff, v4 } from './helpers'

describe('hashCandidate', () => {
  it('returns a stable canonical hash prefixed with c', () => {
    const hash = hashCandidate(v4)
    expect(hash).toMatch(/^c[0-9a-f]+$/)
    expect(hashCandidate(v4)).toBe(hash)
  })

  it('canonicalises key order so two serialisations of the same candidate agree', () => {
    const shuffled = {
      approval: { rollbackTarget: 'v3', approvers: [], status: 'DRAFT' as const },
      clinicalPolicyRefs: ['local-abnormal-result-policy-2026'],
      dedupeWindowMinutes: 60,
      exceptionRoute: 'duty-clinician-task' as const,
      fallbackTeamId: 'gp-duty' as const,
      ackDeadlineMinutes: 30,
      receiverMode: 'ACCOUNTABLE_TEAM' as const,
      supersedes: 'v3',
      id: 'v4',
    }
    expect(hashCandidate(shuffled)).toBe(hashCandidate(v4))
  })

  it('is stable across approval.status and approvers so recording a decision does not void itself', () => {
    const proposed = {
      ...v4,
      approval: { status: 'PROPOSED' as const, approvers: ['staff-clinical-1'], rollbackTarget: 'v3' },
    }
    expect(hashCandidate(proposed)).toBe(hashCandidate(v4))
  })

  it('changes when a single grammar field changes', () => {
    const changed = { ...v4, ackDeadlineMinutes: 31 }
    expect(hashCandidate(changed)).not.toBe(hashCandidate(v4))
  })

  it('voids existing approvals when a single grammar field changes after they were recorded', () => {
    const original = hashCandidate(v4)
    const recorded = [
      approval('clinical-approver', clinicalStaff, original),
      approval('operational-approver', operationalStaff, original),
    ]
    const mutated = { ...v4, receiverMode: 'NAMED_ACTOR' as const }
    const next = hashCandidate(mutated)
    expect(next).not.toBe(original)
    expect(recorded.every((row) => row.candidateHash !== next)).toBe(true)
  })
})
