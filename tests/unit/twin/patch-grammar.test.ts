import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { PATCH_ALLOWED_FIELDS, validatePatch } from '@/domain/patch-grammar'
import type { ProtocolVersion } from '@/domain/types'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/protocols')

function loadProtocol(name: string): ProtocolVersion {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as ProtocolVersion
}

describe('validatePatch', () => {
  const base = loadProtocol('v3.json')

  it('rejects { urgency: \'urgent\' } with rejectedFields', () => {
    const result = validatePatch(base, { urgency: 'urgent' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rejectedFields).toEqual(['urgency'])
  })

  it('rejects { ackDeadlineMinutes: 30, abnormalityThreshold: 1 } with rejectedFields', () => {
    const result = validatePatch(base, { ackDeadlineMinutes: 30, abnormalityThreshold: 1 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.rejectedFields).toEqual(['abnormalityThreshold'])
  })

  it('accepts only PATCH_ALLOWED_FIELDS and stamps candidate identity', () => {
    const diff = {
      receiverMode: 'ACCOUNTABLE_TEAM',
      ackDeadlineMinutes: 30,
      fallbackTeamId: 'gp-duty',
      exceptionRoute: 'duty-clinician-task',
      dedupeWindowMinutes: 60,
    }
    const result = validatePatch(base, diff)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidate.id).toBe(`${base.id}-candidate`)
    expect(result.candidate.supersedes).toBe(base.id)
    expect(result.candidate.approval.status).toBe('DRAFT')
    expect(result.candidate.approval.approvers).toEqual([])
    expect(result.candidate.approval.rollbackTarget).toBe(base.id)
    expect(result.candidate.receiverMode).toBe('ACCOUNTABLE_TEAM')
    expect(result.candidate.ackDeadlineMinutes).toBe(30)
    expect(result.candidate.fallbackTeamId).toBe('gp-duty')
    expect(result.candidate.exceptionRoute).toBe('duty-clinician-task')
    expect(result.candidate.dedupeWindowMinutes).toBe(60)
    expect(PATCH_ALLOWED_FIELDS).toEqual([
      'receiverMode',
      'ackDeadlineMinutes',
      'fallbackTeamId',
      'exceptionRoute',
      'dedupeWindowMinutes',
    ])
  })

  it('copies clinicalPolicyRefs unchanged onto the candidate', () => {
    const result = validatePatch(base, { ackDeadlineMinutes: 30 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidate.clinicalPolicyRefs).toEqual(base.clinicalPolicyRefs)
    expect(result.candidate.clinicalPolicyRefs).toBe(base.clinicalPolicyRefs)
  })
})
