import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  clinicalPriorityDisplay,
  derived,
  isHonestSourceCode,
  notSupplied,
  populatedFieldsHaveProvenance,
  sourceOnly,
  sourceSupplied,
  type SourceOnlyNullable,
  type TaskLedgerEntry,
} from '@/tasks/types'
import { cite, makeEntry } from './helpers'

const TASKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../src/tasks')

describe('task ledger types', () => {
  it('source-only codes are null unless a source field supplied them', () => {
    const empty = notSupplied()
    expect(empty.value).toBeNull()
    expect(empty.provenance.kind).toBe('not-supplied-by-source')
    expect(isHonestSourceCode(empty)).toBe(true)

    const supplied = sourceOnly('SIM-PROBLEM-2', cite('ehr-1', 'code'))
    expect(supplied.value).toBe('SIM-PROBLEM-2')
    expect(supplied.provenance.kind).toBe('source-supplied')
    expect(supplied.provenance.citation.fieldPath).toBe('code')
    expect(isHonestSourceCode(supplied)).toBe(true)
  })

  it('a populated code without a source field path is dishonest', () => {
    const fabricated = {
      value: '123456789',
      provenance: { kind: 'not-supplied-by-source' as const },
    } as unknown as SourceOnlyNullable<string>
    expect(isHonestSourceCode(fabricated)).toBe(false)
  })

  it('derived values must carry a derivation rule alongside the value', () => {
    const episode = derived(
      'enc-9',
      'Episode id is copied from the source record\'s encounterId (the encounter this record hangs off). No episode boundary is invented.',
      [cite('r-2', 'encounterId')],
    )
    expect(episode.value).toBe('enc-9')
    expect(episode.provenance.kind).toBe('derived')
    expect(episode.provenance.rule.length).toBeGreaterThan(0)
  })

  it('clinicalPriority is null when the source gives none and displays the honest label', () => {
    const none = notSupplied()
    expect(none.value).toBeNull()
    expect(clinicalPriorityDisplay(none)).toBe('no priority supplied by source')
  })

  it('does not map a source routine priority onto standard', () => {
    const entry = makeEntry({ entryId: 'e1', priority: null })
    expect(entry.clinicalPriority.value).toBeNull()
    expect(clinicalPriorityDisplay(entry.clinicalPriority)).not.toBe('standard')
  })

  it('every team-schema field on an entry carries provenance', () => {
    const entry = makeEntry({ entryId: 'e1' })
    expect(populatedFieldsHaveProvenance(entry)).toBe(true)
    const stripped = { ...entry, owner: { value: { teamId: 'gp', actorId: null, actorAttribution: 'source-team' } } }
    expect(populatedFieldsHaveProvenance(stripped as TaskLedgerEntry)).toBe(false)
  })

  it('a non-null value cannot be stored under not-supplied provenance', () => {
    const entry = makeEntry({ entryId: 'e1' })
    const dishonest = {
      ...entry,
      note: { value: 'invented follow-up', provenance: { kind: 'not-supplied-by-source' as const } },
    }
    expect(populatedFieldsHaveProvenance(dishonest as unknown as TaskLedgerEntry)).toBe(false)
  })

  it('nullable honesty fields default to null for the live source task shape', () => {
    const entry = makeEntry({ entryId: 'e1' })
    expect(entry.snomedId.value).toBeNull()
    expect(entry.sampleId.value).toBeNull()
    expect(entry.requestedBy.value).toBeNull()
    expect(entry.performedBy.value).toBeNull()
    expect(entry.episodeId.value).toBeNull()
    expect(entry.owner.value.teamId).toBe('gp')
    expect(entry.owner.value.actorId).toBeNull()
    expect(entry.clinicalPriority.value).toBe('urgent')
  })

  it('sourceSupplied cites resource id, version and field path', () => {
    const field = sourceSupplied('gp', cite('r-2', 'owner', 1))
    expect(field.provenance.kind).toBe('source-supplied')
    expect(field.provenance.citation).toEqual({
      resourceId: 'r-2',
      resourceVersion: 1,
      fieldPath: 'owner',
    })
  })

  it('owned modules stay pure: no adapters, fetch, Date.now, or team key', () => {
    const files = ['types.ts', 'task-kinds.ts', 'ledger.ts', 'extraction.ts', 'invariants.ts']
    for (const file of files) {
      const src = readFileSync(join(TASKS_DIR, file), 'utf8')
      expect(src, file).not.toMatch(/from ['"]@\/adapters/)
      expect(src, file).not.toMatch(/from ['"]@\/ports/)
      expect(src, file).not.toMatch(/Date\.now\s*\(/)
      expect(src, file).not.toMatch(/\bfetch\s*\(/)
      expect(src, file).not.toMatch(/ANIMA_SIM_API_KEY/)
    }
  })
})
