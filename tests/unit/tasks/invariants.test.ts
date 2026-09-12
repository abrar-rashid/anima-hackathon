import { describe, expect, it } from 'vitest'
import { evaluateLedgerInvariants } from '@/tasks/invariants'
import { ACCOUNTABILITY_HANDOVER } from '@/tasks/task-kinds'
import { notSupplied, sourceOnly, type TaskLedgerEntry } from '@/tasks/types'
import { cite, makeEntry, T0 } from './helpers'

function byId(entries: readonly TaskLedgerEntry[], id: number, previous?: readonly TaskLedgerEntry[]) {
  const row = evaluateLedgerInvariants(entries, previous ? { previousEntries: previous } : undefined).find(
    (item) => item.id === id,
  )
  if (!row) throw new Error(`missing invariant ${id}`)
  return row
}

function validPair(): TaskLedgerEntry[] {
  return [
    makeEntry({ entryId: 'e1', timestamp: T0, status: 'open' }),
    makeEntry({ entryId: 'e2', timestamp: T0 + 1, status: 'accepted' }),
  ]
}

describe('evaluateLedgerInvariants', () => {
  it('returns exactly 6 entries with ids 1..6 in order', () => {
    const results = evaluateLedgerInvariants(validPair())
    expect(results).toHaveLength(6)
    expect(results.map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6])
    expect(results.every((row) => row.name.length > 0 && row.detail.length > 0)).toBe(true)
  })

  it('1 owner is non-empty at every history point', () => {
    expect(byId(validPair(), 1).passed).toBe(true)
    const blanked: TaskLedgerEntry[] = validPair().map((entry, index) =>
      index === 0
        ? {
            ...entry,
            owner: {
              ...entry.owner,
              value: { teamId: '', actorId: null, actorAttribution: 'source-team' },
            },
          }
        : entry,
    )
    expect(blanked[1]?.owner.value.teamId).toBe('gp')
    expect(byId(blanked, 1).passed).toBe(false)
  })

  it('2 no task is closed without the evidence its kind requires', () => {
    const evidenced = [
      makeEntry({
        entryId: 'e1',
        kindId: ACCOUNTABILITY_HANDOVER,
        status: 'closed',
        closureEvidence: [
          { kind: 'transfer-accepted', citation: { resourceId: 'r-2', resourceVersion: 2, fieldPath: 'status' } },
          { kind: 'clinical-review-recorded', citation: { resourceId: 'rev-1', resourceVersion: 1, fieldPath: 'id' } },
          { kind: 'plan-recorded', citation: { resourceId: 'plan-1', resourceVersion: 1, fieldPath: 'id' } },
          { kind: 'patient-contact-evidenced', citation: { resourceId: 'msg-1', resourceVersion: 1, fieldPath: 'id' } },
          { kind: 'readback-visible', citation: { resourceId: 'r-2', resourceVersion: 2, fieldPath: 'id' } },
          { kind: 'outcome-evidenced', citation: { resourceId: 'out-1', resourceVersion: 1, fieldPath: 'id' } },
        ],
      }),
    ]
    expect(byId(evidenced, 2).passed).toBe(true)
    const claimed: TaskLedgerEntry[] = [
      {
        ...evidenced[0]!,
        closureEvidence: [],
      },
    ]
    expect(claimed[0]?.status.value).toBe('closed')
    expect(byId(claimed, 2).passed).toBe(false)
  })

  it('3 a source-supplied priority is never altered', () => {
    expect(byId(validPair(), 3).passed).toBe(true)
    const altered = validPair()
    altered[1] = {
      ...altered[1]!,
      clinicalPriority: sourceOnly('standard', cite('r-2', 'priority')),
    }
    expect(altered[0]?.clinicalPriority.value).toBe('urgent')
    expect(altered[1]?.clinicalPriority.value).toBe('standard')
    expect(byId(altered, 3).passed).toBe(false)
  })

  it('4 snomedId is null unless a source field supplied it', () => {
    expect(byId(validPair(), 4).passed).toBe(true)
    const fabricated: TaskLedgerEntry[] = [
      {
        ...validPair()[0]!,
        snomedId: {
          value: '123456789',
          provenance: { kind: 'not-supplied-by-source' },
        } as unknown as TaskLedgerEntry['snomedId'],
      },
    ]
    expect(fabricated[0]?.snomedId.value).toBe('123456789')
    expect(byId(fabricated, 4).passed).toBe(false)
  })

  it('5 every extracted task carries a citation', () => {
    const extracted = [
      makeEntry({
        entryId: 'gap-1',
        taskId: 'gap:order-without-result:ord-1',
        kindId: 'order-without-result',
        resourceId: 'ord-1',
        extraction: {
          method: 'structural-gap',
          extractorId: 'order-without-result',
          ruleText: 'An order or sample record has no matching result.',
        },
        citation: {
          kind: 'structural-gap',
          resourceId: 'ord-1',
          resourceVersion: 1,
          ruleText: 'An order or sample record has no matching result.',
        },
      }),
    ]
    expect(byId(extracted, 5).passed).toBe(true)
    const stripped: TaskLedgerEntry[] = [
      {
        ...extracted[0]!,
        citation: { kind: 'structural-gap', resourceId: '', resourceVersion: 1, ruleText: '' },
      },
    ]
    expect(stripped[0]?.extraction?.method).toBe('structural-gap')
    expect(byId(stripped, 5).passed).toBe(false)
  })

  it('6 append-only is respected against a baseline', () => {
    const previous = validPair()
    expect(byId([...previous, makeEntry({ entryId: 'e3', timestamp: T0 + 2, status: 'overdue' })], 6, previous).passed).toBe(
      true,
    )
    const edited = validPair()
    edited[0] = { ...edited[0]!, note: notSupplied() }
    expect(edited[0]?.entryId).toBe(previous[0]?.entryId)
    expect(byId(edited, 6, previous).passed).toBe(false)

    const deleted = [previous[1]!]
    expect(byId(deleted, 6, previous).passed).toBe(false)
  })
})
