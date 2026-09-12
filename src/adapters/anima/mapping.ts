import type { EvidenceRef, SiteId } from '@/domain/types'
import type { VersionedRecord } from '@/ports/anima-read-port'

export interface BloodAnalyte {
  id: string
  name: string
  unit: string
  value: number
  referenceLow: number
  referenceHigh: number
}

export interface BloodReportRecord {
  id: string
  version: number
  patientId: string
  collectedAt: number
  visibleTo: string[]
  owner: string
  status: string
  analytes: BloodAnalyte[]
}

export interface TaskReadback {
  id: string
  status: string
  version: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function toVersionedRecord(resource: unknown): VersionedRecord {
  const record = asRecord(resource)
  return {
    id: asString(record.id),
    kind: asString(record.kind),
    version: asNumber(record.version, 1),
    patientId: typeof record.patientId === 'string' ? record.patientId : undefined,
    owner: asString(record.owner),
    visibleTo: asStringArray(record.visibleTo),
    status: asString(record.status),
    createdAt: asNumber(record.createdAt),
    data: record.data,
    provenance: record.provenance,
  }
}

export function toEvidenceRef(resource: unknown, site: SiteId | 'clock', observedAt: number): EvidenceRef {
  const record = asRecord(resource)
  const provenance = asRecord(record.provenance)
  const created = asRecord(provenance.created)
  const version = asNumber(created.version, asNumber(record.version, 1))
  const action = asString(created.action, asString(record.kind, 'unknown'))
  return {
    site,
    resourceId: asString(record.id),
    resourceVersion: asNumber(record.version, version),
    observedAtSimulatorTime: observedAt,
    activityId: asString(created.action) ? `${created.action}@${version}` : `${action}@${version}`,
    eventType: action,
  }
}

export function bloodReportFrom(resource: unknown): BloodReportRecord | null {
  const record = asRecord(resource)
  const data = asRecord(record.data)
  if (asString(record.kind) !== 'report' || asString(data.kind) !== 'blood-result') return null
  if (!Array.isArray(data.analytes)) return null
  const analytes: BloodAnalyte[] = []
  for (const raw of data.analytes) {
    const analyte = asRecord(raw)
    if (typeof analyte.value !== 'number') continue
    analytes.push({
      id: asString(analyte.id),
      name: asString(analyte.name),
      unit: asString(analyte.unit),
      value: analyte.value,
      referenceLow: asNumber(analyte.referenceLow),
      referenceHigh: asNumber(analyte.referenceHigh),
    })
  }
  return {
    id: asString(record.id),
    version: asNumber(record.version, 1),
    patientId: asString(record.patientId),
    collectedAt: asNumber(data.collectedAt, asNumber(record.createdAt)),
    visibleTo: asStringArray(record.visibleTo),
    owner: asString(record.owner),
    status: asString(record.status),
    analytes,
  }
}

export function taskReadbackFrom(bundle: unknown, resourceId: string): TaskReadback | null {
  const root = asRecord(bundle)
  const entries = Array.isArray(root.entry) ? root.entry : []
  for (const entry of entries) {
    const resource = asRecord(asRecord(entry).resource)
    if (asString(resource.id) !== resourceId) continue
    const meta = asRecord(resource.meta)
    const versionRaw = meta.versionId
    const version = typeof versionRaw === 'number' ? versionRaw : Number.parseInt(asString(versionRaw, '1'), 10)
    return {
      id: resourceId,
      status: asString(resource.status),
      version: Number.isFinite(version) ? version : 1,
    }
  }
  return null
}
