import { describe, expect, it } from 'vitest'
import {
  BOOK_FOLLOW_UP,
  ACCOUNTABILITY_HANDOVER,
  CHASE_OUTSTANDING_RESULT,
  ORDER_WITHOUT_RESULT,
  TASK_KINDS,
  getTaskKind,
} from '@/tasks/task-kinds'

describe('task vocabulary', () => {
  it('includes the accountability handover and the three required extensions', () => {
    const ids = TASK_KINDS.map((kind) => kind.id)
    expect(ids).toEqual(expect.arrayContaining([
      ACCOUNTABILITY_HANDOVER,
      CHASE_OUTSTANDING_RESULT,
      BOOK_FOLLOW_UP,
      ORDER_WITHOUT_RESULT,
    ]))
  })

  it('each built-in kind declares what closes it and the evidence that proves closure', () => {
    for (const kind of TASK_KINDS) {
      expect(kind.closesWhen.length).toBeGreaterThan(0)
      expect(kind.requiredEvidence.length).toBeGreaterThan(0)
    }
  })

  it('accountability-handover keeps the covenant evidence bar', () => {
    const kind = getTaskKind(ACCOUNTABILITY_HANDOVER)
    expect(kind.requiredEvidence).toEqual(expect.arrayContaining([
      'transfer-accepted',
      'clinical-review-recorded',
      'plan-recorded',
      'patient-contact-evidenced',
      'readback-visible',
      'outcome-evidenced',
    ]))
    expect(kind.closesWhen.toLowerCase()).toMatch(/http 200 is not proof/)
  })

  it('chase-outstanding-result closes when a matching result is visible', () => {
    const kind = getTaskKind(CHASE_OUTSTANDING_RESULT)
    expect(kind.requiredEvidence).toContain('matching-result-visible')
  })

  it('book-follow-up closes when a source appointment is visible', () => {
    const kind = getTaskKind(BOOK_FOLLOW_UP)
    expect(kind.requiredEvidence).toContain('appointment-visible')
  })

  it('order-without-result closes when a matching result is visible', () => {
    const kind = getTaskKind(ORDER_WITHOUT_RESULT)
    expect(kind.requiredEvidence).toContain('matching-result-visible')
  })

  it('is open for extension: unknown kinds receive a conservative closure rule', () => {
    const custom = getTaskKind('community-visit-unclosed')
    expect(custom.id).toBe('community-visit-unclosed')
    expect(custom.requiredEvidence).toEqual(['source-task-completed'])
    expect(custom.closesWhen.length).toBeGreaterThan(0)
  })
})
