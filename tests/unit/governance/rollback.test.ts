import { describe, expect, it } from 'vitest'

import { evaluate } from '@/governance/activation'
import { hashCandidate } from '@/governance/candidate-hash'
import { transition } from '@/governance/lifecycle'
import { proveRollbackTarget, rollbackToTarget } from '@/governance/rollback'
import { DISABLED_ACTIVATION_REASON } from '@/governance/types'

import {
  approval,
  clinicalStaff,
  MemoryAudit,
  MemoryProtocols,
  NOW,
  operationalStaff,
  v3,
  v4,
  validPlan,
} from './helpers'

describe('rollback', () => {
  it('proves the named target existed and was reachable before activation can be permitted', async () => {
    const empty = new MemoryProtocols()
    const missing = await proveRollbackTarget(empty, 'v3', NOW)
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.reason).toBe('target-unreachable')

    const repo = new MemoryProtocols()
    await repo.put(v3)
    const proof = await proveRollbackTarget(repo, v4.approval.rollbackTarget, NOW)
    expect(proof.ok).toBe(true)
    if (!proof.ok) return
    expect(proof.proof.targetId).toBe('v3')
    expect(proof.proof.reachable).toBe(true)
    expect(proof.proof.protocol.id).toBe('v3')

    const proposed = { ...v4, approval: { ...v4.approval, status: 'PROPOSED' as const } }
    const withoutProof = transition(proposed, 'ACTIVE', {
      decision: evaluate({
        candidate: proposed,
        candidateHash: hashCandidate(proposed),
        approvals: [
          approval('clinical-approver', clinicalStaff, hashCandidate(proposed)),
          approval('operational-approver', operationalStaff, hashCandidate(proposed)),
        ],
        plan: validPlan(),
        failingInvariantIds: [],
      }),
      proof: null,
      now: NOW,
    })
    expect(withoutProof.ok).toBe(false)
    if (withoutProof.ok) return
    expect(withoutProof.reason).toBe('rollback-proof-missing')
  })

  it('restores the named target and records actor, reason and candidate hash', async () => {
    const protocols = new MemoryProtocols()
    const audit = new MemoryAudit()
    await protocols.put(v3)
    await protocols.put(v4)
    const proof = await proveRollbackTarget(protocols, 'v3', NOW)
    expect(proof.ok).toBe(true)
    if (!proof.ok) return

    const candidateHash = hashCandidate(v4)
    const result = await rollbackToTarget(
      { protocols, audit },
      {
        candidate: v4,
        candidateHash,
        proof: proof.proof,
        actor: operationalStaff,
        reason: 'Hold-period invariant failure; restore the named rollback target.',
        recordedAt: NOW,
        simulatorTime: NOW,
        entryId: 'audit-rollback-1',
      },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.restored.id).toBe('v3')
    expect(result.restored.approval.status).toBe('ACTIVE')
    const stored = await protocols.get('v3')
    expect(stored?.id).toBe('v3')
    expect(audit.entries).toHaveLength(1)
    expect(audit.entries[0]?.actor).toEqual(operationalStaff)
    expect(audit.entries[0]?.detail).toContain('Hold-period invariant failure; restore the named rollback target.')
    expect(audit.entries[0]?.detail).toContain(candidateHash)
  })

  it('does not treat a permitted evaluate() as deployability; refusal text stays honest when proof is absent', () => {
    const hash = hashCandidate(v4)
    const decision = evaluate({
      candidate: v4,
      candidateHash: hash,
      approvals: [
        approval('clinical-approver', clinicalStaff, hash),
        approval('operational-approver', operationalStaff, hash),
      ],
      plan: validPlan(),
      failingInvariantIds: [],
    })
    expect(decision.permitted).toBe(true)
    const blocked = transition(
      { ...v4, approval: { ...v4.approval, status: 'PROPOSED' } },
      'ACTIVE',
      { decision, proof: null, now: NOW },
    )
    expect(blocked.ok).toBe(false)
    expect(DISABLED_ACTIVATION_REASON).toContain('rollback target')
  })
})
