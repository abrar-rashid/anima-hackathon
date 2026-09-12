import { describe, expect, it } from 'vitest'

import { approvalAuditEntry, recordDecision } from '@/governance/approvals'
import { hashCandidate } from '@/governance/candidate-hash'

import { approval, clinicalStaff, NOW, operationalStaff, v4 } from './helpers'

describe('recordDecision', () => {
  it('appends a named clinical or operational decision bound to the candidate hash', () => {
    const hash = hashCandidate(v4)
    const result = recordDecision([], approval('clinical-approver', clinicalStaff, hash))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record.role).toBe('clinical-approver')
    expect(result.record.candidateHash).toBe(hash)
    expect(result.record.approver.attribution).toBe('app-side')
    expect(result.record.decision).toBe('APPROVED')
  })

  it('refuses the same staff identity filling both clinical and operational roles', () => {
    const hash = hashCandidate(v4)
    const first = recordDecision([], approval('clinical-approver', clinicalStaff, hash))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = recordDecision(
      [first.record],
      approval('operational-approver', clinicalStaff, hash),
    )
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.reason).toBe('same-staff-both-roles')
  })

  it('keeps a rejection sticky until an explicit later superseding decision', () => {
    const hash = hashCandidate(v4)
    const rejected = recordDecision(
      [],
      approval('clinical-approver', clinicalStaff, hash, 'REJECTED', NOW),
    )
    expect(rejected.ok).toBe(true)
    if (!rejected.ok) return
    const silently = recordDecision(
      [rejected.record],
      { ...approval('clinical-approver', clinicalStaff, hash, 'APPROVED', NOW), approvalId: rejected.record.approvalId },
    )
    expect(silently.ok).toBe(false)
    if (silently.ok) return
    expect(silently.reason).toBe('duplicate-approval-id')

    const superseded = recordDecision(
      [rejected.record],
      approval('clinical-approver', clinicalStaff, hash, 'APPROVED', NOW + 1),
    )
    expect(superseded.ok).toBe(true)
    if (!superseded.ok) return
    expect(superseded.record.decision).toBe('APPROVED')
    expect(superseded.record.approvalId).not.toBe(rejected.record.approvalId)
  })

  it('represents every decision as an append-only audit entry with actor, reason and candidate hash', () => {
    const hash = hashCandidate(v4)
    const result = recordDecision([], approval('operational-approver', operationalStaff, hash, 'REJECTED'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const entry = approvalAuditEntry(result.record, NOW)
    expect(entry.actor).toEqual(operationalStaff)
    expect(entry.detail).toContain(result.record.reason)
    expect(entry.detail).toContain(hash)
    expect(entry.action).toContain('REJECTED')
  })
})
