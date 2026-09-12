import type { ClosureEvidenceKind } from '@/tasks/types'

export const ACCOUNTABILITY_HANDOVER = 'accountability-handover'
export const CHASE_OUTSTANDING_RESULT = 'chase-outstanding-result'
export const BOOK_FOLLOW_UP = 'book-follow-up'
export const ORDER_WITHOUT_RESULT = 'order-without-result'
export const SOURCE_RECORDED = 'source-recorded'

export type BuiltInTaskKindId =
  | typeof ACCOUNTABILITY_HANDOVER
  | typeof CHASE_OUTSTANDING_RESULT
  | typeof BOOK_FOLLOW_UP
  | typeof ORDER_WITHOUT_RESULT
  | typeof SOURCE_RECORDED

export type TaskKindDefinition = {
  id: string
  title: string
  closesWhen: string
  requiredEvidence: readonly ClosureEvidenceKind[]
}

export const TASK_KINDS: readonly TaskKindDefinition[] = [
  {
    id: ACCOUNTABILITY_HANDOVER,
    title: 'Transfer accountability for an abnormal result',
    closesWhen:
      'Accountability has been accepted by the receiving team and the Care Covenant closure evidence is present: clinical review, plan, patient contact, downstream-visible action, and outcome — each cited. HTTP 200 is not proof.',
    requiredEvidence: [
      'transfer-accepted',
      'clinical-review-recorded',
      'plan-recorded',
      'patient-contact-evidenced',
      'readback-visible',
      'outcome-evidenced',
    ],
  },
  {
    id: CHASE_OUTSTANDING_RESULT,
    title: 'Chase an outstanding result',
    closesWhen:
      'A source result is visible that cites the outstanding order or sample, or the source task is completed with that result as evidence.',
    requiredEvidence: ['matching-result-visible'],
  },
  {
    id: BOOK_FOLLOW_UP,
    title: 'Book a follow-up',
    closesWhen:
      'A source appointment record is visible that cites this task, or the source task status is completed or closed with that appointment as evidence.',
    requiredEvidence: ['appointment-visible'],
  },
  {
    id: ORDER_WITHOUT_RESULT,
    title: 'Order placed with no result',
    closesWhen:
      'A result is later visible for the same order or sample identity cited at extraction. Patient-only coincidence is not a match.',
    requiredEvidence: ['matching-result-visible'],
  },
  {
    id: SOURCE_RECORDED,
    title: 'Source-recorded task',
    closesWhen:
      'The source task is completed, closed or cancelled and that source status is cited. No clinical meaning is added.',
    requiredEvidence: ['source-task-completed'],
  },
]

const FALLBACK_KIND: Omit<TaskKindDefinition, 'id'> = {
  title: 'Unregistered task kind',
  closesWhen: 'The source task is completed and that completion is cited.',
  requiredEvidence: ['source-task-completed'],
}

export function getTaskKind(id: string): TaskKindDefinition {
  return TASK_KINDS.find((kind) => kind.id === id) ?? { id, ...FALLBACK_KIND }
}
