import { describe, expect, it } from 'vitest'

import { evaluate } from '@/governance/activation'
import { hashCandidate } from '@/governance/candidate-hash'
import { draftFromPatch, lifecycleAuditEntry, transition } from '@/governance/lifecycle'
import { proveRollbackTarget } from '@/governance/rollback'

import {
  approval,
  clinicalStaff,
  MemoryProtocols,
  NOW,
  operationalStaff,
  v3,
  v4,
  validPlan,
} from './helpers'

describe('draftFromPatch', () => {
  it('rejects a patch outside the five grammar fields before governance is considered', () => {
    const result = draftFromPatch(v3, { urgency: 'urgent', ackDeadlineMinutes: 30 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('clinical-meaning-not-patchable')
    expect(result.rejectedFields).toEqual(['urgency'])
  })

  it('rejects a clinical-meaning field so it never reaches an approval queue', () => {
    const diagnosis = draftFromPatch(v3, { diagnosis: 'infection' })
    expect(diagnosis.ok).toBe(false)
    const threshold = draftFromPatch(v3, { abnormalityThreshold: 1 })
    expect(threshold.ok).toBe(false)
    const refs = draftFromPatch(v3, { clinicalPolicyRefs: [] })
    expect(refs.ok).toBe(false)
  })

  it('accepts a grammar-only patch as DRAFT with rollback onto the base', () => {
    const result = draftFromPatch(v3, {
      receiverMode: 'ACCOUNTABLE_TEAM',
      ackDeadlineMinutes: 30,
      fallbackTeamId: 'gp-duty',
      exceptionRoute: 'duty-clinician-task',
      dedupeWindowMinutes: 60,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidate.approval.status).toBe('DRAFT')
    expect(result.candidate.approval.rollbackTarget).toBe('v3')
    expect(result.candidate.clinicalPolicyRefs).toEqual(v3.clinicalPolicyRefs)
  })
})

describe('transition', () => {
  it('allows DRAFT → TESTING → PASSED → PROPOSED and TESTING → FAILED_INVARIANTS', () => {
    const draft = { ...v4, approval: { ...v4.approval, status: 'DRAFT' as const } }
    const testing = transition(draft, 'TESTING')
    expect(testing.ok).toBe(true)
    if (!testing.ok) return
    expect(testing.candidate.approval.status).toBe('TESTING')

    const failed = transition(testing.candidate, 'FAILED_INVARIANTS')
    expect(failed.ok).toBe(true)
    if (!failed.ok) return
    expect(failed.candidate.approval.status).toBe('FAILED_INVARIANTS')

    const passed = transition(testing.candidate, 'PASSED')
    expect(passed.ok).toBe(true)
    if (!passed.ok) return
    const proposed = transition(passed.candidate, 'PROPOSED')
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return
    expect(proposed.candidate.approval.status).toBe('PROPOSED')
  })

  it('rejects illegal transitions with a named reason', () => {
    const draft = { ...v4, approval: { ...v4.approval, status: 'DRAFT' as const } }
    const skip = transition(draft, 'PROPOSED')
    expect(skip.ok).toBe(false)
    if (skip.ok) return
    expect(skip.reason).toBe('illegal-transition')

    const toActive = transition(draft, 'ACTIVE')
    expect(toActive.ok).toBe(false)
    if (toActive.ok) return
    expect(toActive.reason).toBe('illegal-transition')
  })

  it('unlocks PROPOSED → ACTIVE only after evaluate permits and rollback proof exists', async () => {
    const proposed = { ...v4, approval: { ...v4.approval, status: 'PROPOSED' as const } }
    const hash = hashCandidate(proposed)
    const approvals = [
      approval('clinical-approver', clinicalStaff, hash),
      approval('operational-approver', operationalStaff, hash),
    ]
    const decision = evaluate({
      candidate: proposed,
      candidateHash: hash,
      approvals,
      plan: validPlan(),
      failingInvariantIds: [],
    })
    expect(decision.permitted).toBe(true)

    const refused = transition(proposed, 'ACTIVE', { decision, proof: null, now: NOW, approvals })
    expect(refused.ok).toBe(false)

    const repo = new MemoryProtocols()
    await repo.put(v3)
    const proof = await proveRollbackTarget(repo, 'v3', NOW)
    expect(proof.ok).toBe(true)
    if (!proof.ok) return

    const activated = transition(proposed, 'ACTIVE', { decision, proof: proof.proof, now: NOW, approvals })
    expect(activated.ok).toBe(true)
    if (!activated.ok) return
    expect(activated.candidate.approval.status).toBe('ACTIVE')
    expect(activated.candidate.approval.rollbackTarget).toBe('v3')
    expect(activated.candidate.approval.approvers).toEqual([clinicalStaff.id, operationalStaff.id])
  })

  it('records a lifecycle decision as an append-only audit entry', () => {
    const draft = { ...v4, approval: { ...v4.approval, status: 'DRAFT' as const } }
    const testing = transition(draft, 'TESTING')
    expect(testing.ok).toBe(true)
    if (!testing.ok) return
    const entry = lifecycleAuditEntry({
      candidate: testing.candidate,
      candidateHash: hashCandidate(testing.candidate),
      from: 'DRAFT',
      to: 'TESTING',
      actor: clinicalStaff,
      reason: 'Start simulator regression replay.',
      recordedAt: NOW,
      simulatorTime: NOW,
      entryId: 'audit-lifecycle-1',
    })
    expect(entry.actor).toEqual(clinicalStaff)
    expect(entry.detail).toContain('Start simulator regression replay.')
    expect(entry.detail).toContain(hashCandidate(testing.candidate))
  })
})
