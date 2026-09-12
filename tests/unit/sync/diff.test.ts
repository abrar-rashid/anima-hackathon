import { describe, expect, it } from 'vitest'
import { catalogFromSeen, detectChanges, emptyCatalog, recordVersion } from '@/sync/diff'
import { record } from './helpers'

describe('change detection', () => {
  it('a same-version re-read is not a change and a version bump is', () => {
    const first = record({
      id: 'r-2',
      version: 1,
      provenance: { created: { version: 1, time: 1_789_200_000_000 } },
    })
    const reread = record({
      id: 'r-2',
      version: 1,
      provenance: { created: { version: 1, time: 1_789_200_000_000 } },
    })
    const bumped = record({
      id: 'r-2',
      version: 2,
      provenance: { created: { version: 2, time: 1_789_200_000_000 } },
    })

    const initial = detectChanges(emptyCatalog(), [first])
    expect(initial.changes).toHaveLength(1)
    expect(initial.changes[0]).toMatchObject({ id: 'r-2', previousVersion: null, version: 1 })

    const same = detectChanges(initial.catalog, [reread])
    expect(same.changes).toEqual([])
    expect(same.catalog.versions['r-2']).toBe(1)

    const next = detectChanges(same.catalog, [bumped])
    expect(next.changes).toHaveLength(1)
    expect(next.changes[0]).toMatchObject({ id: 'r-2', previousVersion: 1, version: 2 })
  })

  it('treats a new resource id as a change and ignores a lower version', () => {
    const catalog = catalogFromSeen({ 'r-2': 2 })
    const fresh = record({ id: 'r-9', version: 1 })
    const older = record({ id: 'r-2', version: 1 })
    const result = detectChanges(catalog, [fresh, older])
    expect(result.changes.map((change) => change.id)).toEqual(['r-9'])
    expect(result.catalog.versions).toEqual({ 'r-2': 2, 'r-9': 1 })
  })

  it('reads version from provenance.created.version when the top-level version is absent', () => {
    const fromProvenance = record({
      id: 'r-prov',
      version: 0,
      provenance: { created: { version: 4 } },
    })
    expect(recordVersion(fromProvenance)).toBe(4)
    const both = record({
      id: 'r-both',
      version: 3,
      provenance: { created: { version: 5 } },
    })
    expect(recordVersion(both)).toBe(5)
  })
})
