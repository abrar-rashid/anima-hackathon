import type { VersionedRecord } from '@/ports/anima-read-port'

export interface VersionCatalog {
  versions: Record<string, number>
}

export interface ResourceChange {
  id: string
  previousVersion: number | null
  version: number
  record: VersionedRecord
}

export interface ChangedRecordSummary {
  id: string
  kind: string
  version: number
  createdAt: number
  owner: string
  status: string
  patientId?: string
}

export function emptyCatalog(): VersionCatalog {
  return { versions: {} }
}

export function catalogFromSeen(seen: Record<string, number>): VersionCatalog {
  return { versions: { ...seen } }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** Prefer the higher of `version` and `provenance.created.version`. */
export function recordVersion(record: VersionedRecord): number {
  const top = Number.isFinite(record.version) && record.version > 0 ? record.version : 0
  const created = asRecord(asRecord(record.provenance).created)
  const fromCreated = typeof created.version === 'number' && created.version > 0 ? created.version : 0
  return Math.max(top, fromCreated) || 1
}

export function detectChanges(
  catalog: VersionCatalog,
  records: VersionedRecord[],
): { changes: ResourceChange[]; catalog: VersionCatalog } {
  const versions = { ...catalog.versions }
  const changes: ResourceChange[] = []
  for (const record of records) {
    const version = recordVersion(record)
    const previous = versions[record.id]
    if (previous === undefined) {
      changes.push({ id: record.id, previousVersion: null, version, record })
      versions[record.id] = version
      continue
    }
    if (version > previous) {
      changes.push({ id: record.id, previousVersion: previous, version, record })
      versions[record.id] = version
    }
  }
  return { changes, catalog: { versions } }
}

/** Identity-only view of a change — no free-text payload. */
export function summarizeChangedRecords(records: VersionedRecord[]): ChangedRecordSummary[] {
  return records.map((record) => ({
    id: record.id,
    kind: record.kind,
    version: recordVersion(record),
    createdAt: record.createdAt,
    owner: record.owner,
    status: record.status,
    ...(record.patientId ? { patientId: record.patientId } : {}),
  }))
}
