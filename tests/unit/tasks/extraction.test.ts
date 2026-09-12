import { describe, expect, it } from 'vitest'
import {
  ORDER_WITHOUT_RESULT_RULE_TEXT,
  OVERDUE_WITHOUT_CLOSURE_RULE_TEXT,
  SOURCE_TASK_OBSERVED_RULE_TEXT,
  extractOrdersWithoutResults,
  extractOverdueOpenTasks,
  extractStructuralGaps,
  isValidFreeTextProposal,
  observeSourceTasks,
  toProposedEntry,
  type ExtractionSourceRecord,
  type FreeTextTaskProposal,
} from '@/tasks/extraction'
import { ORDER_WITHOUT_RESULT } from '@/tasks/task-kinds'
import { T0, sourceTaskRecord } from './helpers'

const order: ExtractionSourceRecord = {
  id: 'ord-blood-1',
  kind: 'order',
  version: 1,
  patientId: 'SIM-000001',
  owner: 'diagnostics',
  status: 'open',
  createdAt: T0 - 60_000,
  title: 'CRP panel',
  priority: 'routine',
  dueAt: null,
  sampleId: 'samp-1',
  resultId: null,
  orderId: null,
  encounterId: 'enc-1',
  episodeId: null,
  dataKind: null,
}

const resultForOrder: ExtractionSourceRecord = {
  id: 'res-1',
  kind: 'report',
  version: 1,
  patientId: 'SIM-000001',
  owner: 'diagnostics',
  status: 'available',
  createdAt: T0,
  dataKind: 'blood-result',
  orderId: 'ord-blood-1',
  sampleId: 'samp-1',
  resultId: null,
  dueAt: null,
  title: undefined,
  priority: null,
  encounterId: null,
  episodeId: null,
}

describe('deterministic extractors', () => {
  it('extractOrdersWithoutResults emits order-without-result with the displayed rule text', () => {
    const found = extractOrdersWithoutResults({
      patientId: 'SIM-000001',
      now: T0,
      records: [order],
    })
    expect(found).toHaveLength(1)
    const row = found[0]
    expect(row?.kindId).toBe(ORDER_WITHOUT_RESULT)
    expect(row?.ruleText).toBe(ORDER_WITHOUT_RESULT_RULE_TEXT)
    expect(row?.citation).toEqual({
      kind: 'structural-gap',
      resourceId: 'ord-blood-1',
      resourceVersion: 1,
      ruleText: ORDER_WITHOUT_RESULT_RULE_TEXT,
    })
    expect(row?.proposedEntry.owner.value.teamId).toBe('diagnostics')
    expect(row?.proposedEntry.clinicalPriority.value).toBeNull()
    expect(row?.proposedEntry.snomedId.value).toBeNull()
    expect(row?.proposedEntry.sampleId.value).toBe('samp-1')
    expect(row?.proposedEntry.episodeId.value).toBe('enc-1')
    expect(row?.proposedEntry.episodeId.provenance.kind).toBe('derived')
    if (row?.proposedEntry.episodeId.provenance.kind !== 'derived') throw new Error('expected derived episode')
    expect(row.proposedEntry.episodeId.provenance.rule).toMatch(/encounterId/)
  })

  it('does not emit when a result cites the order', () => {
    const found = extractOrdersWithoutResults({
      patientId: 'SIM-000001',
      now: T0,
      records: [order, resultForOrder],
    })
    expect(found).toEqual([])
  })

  it('does not emit when the order names a resultId that exists', () => {
    const found = extractOrdersWithoutResults({
      patientId: 'SIM-000001',
      now: T0,
      records: [
        { ...order, resultId: 'res-1' },
        { ...resultForOrder, orderId: null, sampleId: null },
      ],
    })
    expect(found).toEqual([])
  })

  it('does not treat a same-patient result as a match without a source link', () => {
    const found = extractOrdersWithoutResults({
      patientId: 'SIM-000001',
      now: T0,
      records: [
        order,
        { ...resultForOrder, orderId: null, sampleId: null },
      ],
    })
    expect(found).toHaveLength(1)
  })

  it('skips an order or sample with a blank owner', () => {
    const found = extractOrdersWithoutResults({
      patientId: 'SIM-000001',
      now: T0,
      records: [{ ...order, owner: '' }],
    })
    expect(found).toEqual([])
  })

  it('extractOverdueOpenTasks emits overdue for a source task past dueAt with no closing evidence', () => {
    const found = extractOverdueOpenTasks({
      patientId: 'SIM-000001',
      now: T0 + 1,
      records: [sourceTaskRecord()],
    })
    expect(found).toHaveLength(1)
    const row = found[0]
    expect(row?.ruleText).toBe(OVERDUE_WITHOUT_CLOSURE_RULE_TEXT)
    expect(row?.proposedEntry.status.value).toBe('overdue')
    expect(row?.proposedEntry.taskId.value).toBe('r-2')
    expect(row?.proposedEntry.owner.value.teamId).toBe('gp')
    expect(row?.proposedEntry.clinicalPriority.value).toBe('urgent')
  })

  it('does not emit overdue when now is not past dueAt', () => {
    expect(
      extractOverdueOpenTasks({
        patientId: 'SIM-000001',
        now: T0,
        records: [sourceTaskRecord()],
      }),
    ).toEqual([])
  })

  it('does not emit overdue when the source status is already closed', () => {
    expect(
      extractOverdueOpenTasks({
        patientId: 'SIM-000001',
        now: T0 + 1,
        records: [sourceTaskRecord({ status: 'completed' })],
      }),
    ).toEqual([])
  })

  it('does not emit overdue when the ledger already has a closed entry for the task', () => {
    const closed = extractOverdueOpenTasks({
      patientId: 'SIM-000001',
      now: T0 + 1,
      records: [sourceTaskRecord()],
    })[0]
    if (!closed) throw new Error('expected an overdue extraction to mutate')
    const closedEntry = {
      ...closed.proposedEntry,
      status: { ...closed.proposedEntry.status, value: 'closed' as const },
      closureEvidence: [
        {
          kind: 'source-task-completed' as const,
          citation: { resourceId: 'r-2', resourceVersion: 1, fieldPath: 'status' },
        },
      ],
    }
    expect(
      extractOverdueOpenTasks({
        patientId: 'SIM-000001',
        now: T0 + 1,
        records: [sourceTaskRecord()],
        existingEntries: [closedEntry],
      }),
    ).toEqual([])
  })

  it('does not infer urgency from lateness', () => {
    const found = extractOverdueOpenTasks({
      patientId: 'SIM-000001',
      now: T0 + 86_400_000,
      records: [sourceTaskRecord({ priority: null })],
    })
    expect(found[0]?.proposedEntry.clinicalPriority.value).toBeNull()
  })

  it('observeSourceTasks copies the live r-2 shape without inventing codes', () => {
    const found = observeSourceTasks({
      patientId: 'SIM-000001',
      now: T0,
      records: [sourceTaskRecord()],
    })
    expect(found).toHaveLength(1)
    const entry = found[0]?.proposedEntry
    expect(found[0]?.ruleText).toBe(SOURCE_TASK_OBSERVED_RULE_TEXT)
    expect(entry?.taskId.value).toBe('r-2')
    expect(entry?.status.value).toBe('open')
    expect(entry?.owner.value.teamId).toBe('gp')
    expect(entry?.clinicalPriority.value).toBe('urgent')
    expect(entry?.deadline.value).toBe(T0)
    expect(entry?.snomedId.value).toBeNull()
    expect(entry?.sampleId.value).toBeNull()
    expect(entry?.requestedBy.value).toBeNull()
    expect(entry?.performedBy.value).toBeNull()
    expect(entry?.episodeId.value).toBeNull()
    expect(entry?.note.value).toBe('Arrange post-discharge monitoring')
  })

  it('extractStructuralGaps runs only the gap extractors', () => {
    const found = extractStructuralGaps({
      patientId: 'SIM-000001',
      now: T0 + 1,
      records: [sourceTaskRecord(), order],
    })
    expect(found.map((row) => row.kindId).sort()).toEqual(['order-without-result', 'source-recorded'])
    expect(found.every((row) => row.ruleText.length > 0)).toBe(true)
    expect(found.every((row) => row.citation.resourceId.length > 0)).toBe(true)
  })

  it('does not parse free text: extractors ignore a text field if present', () => {
    const sneaky = {
      ...order,
      text: 'Book follow up appointment in 4 weeks and start antibiotics',
    } as ExtractionSourceRecord & { text: string }
    const found = extractStructuralGaps({
      patientId: 'SIM-000001',
      now: T0,
      records: [sneaky],
    })
    expect(found).toHaveLength(1)
    expect(found[0]?.kindId).toBe(ORDER_WITHOUT_RESULT)
    expect(JSON.stringify(found[0]?.proposedEntry.note)).not.toMatch(/antibiotics/i)
    expect(JSON.stringify(found[0]?.proposedEntry.note)).not.toMatch(/follow up/i)
  })

  it('rejects a free-text proposal with no quoted source span', () => {
    const proposal: FreeTextTaskProposal = {
      patientId: 'SIM-000001',
      kindId: 'book-follow-up',
      note: 'Book follow up appointment in 4 weeks',
      ownerTeamId: 'gp',
      deadline: null,
      citation: { resourceId: 'note-1', resourceVersion: 3, quotedSpan: '' },
      label: 'agent-extracted',
      acceptance: 'proposal',
    }
    expect(isValidFreeTextProposal(proposal)).toBe(false)
    const result = toProposedEntry(proposal, { entryId: 'p1', timestamp: T0 })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected rejection')
    expect(result.reason).toBe('missing-quoted-span')
  })

  it('accepts a citation-carrying free-text proposal as a proposed entry', () => {
    const proposal: FreeTextTaskProposal = {
      patientId: 'SIM-000001',
      kindId: 'book-follow-up',
      note: 'Book follow up appointment in 4 weeks',
      ownerTeamId: 'gp',
      deadline: T0 + 2_419_200_000,
      citation: {
        resourceId: 'note-1',
        resourceVersion: 3,
        quotedSpan: 'Book follow up appointment in 4 weeks',
      },
      label: 'agent-extracted',
      acceptance: 'proposal',
    }
    expect(isValidFreeTextProposal(proposal)).toBe(true)
    const result = toProposedEntry(proposal, { entryId: 'p1', timestamp: T0 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected proposal entry')
    expect(result.entry.status.value).toBe('proposed')
    expect(result.entry.extraction).toEqual({
      method: 'free-text',
      label: 'agent-extracted',
      acceptance: 'proposal',
    })
    expect(result.entry.citation).toEqual({
      kind: 'free-text',
      resourceId: 'note-1',
      resourceVersion: 3,
      quotedSpan: 'Book follow up appointment in 4 weeks',
    })
    expect(result.entry.clinicalPriority.value).toBeNull()
    expect(result.entry.snomedId.value).toBeNull()
  })
})
