import type {
  Provenance,
  ProvenanceEntry,
  Site,
  SimEvent,
  SimPatient,
  SimResource,
} from '@/ctl/contracts'

/**
 * Turn raw API payloads into our shapes.
 *
 * The only job here is guaranteeing structure. Nothing is defaulted into
 * existence: an absent `priority` stays absent so the UI can say "not supplied
 * by source" instead of showing a plausible-looking guess. A payload we cannot
 * recognise returns null and is dropped rather than half-built.
 *
 * Pure: no I/O, no clock, no randomness.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function normaliseProvenanceEntry(value: unknown): ProvenanceEntry | null {
  if (!isRecord(value)) return null
  const time = num(value.time)
  const version = num(value.version)
  const action = str(value.action)
  const source = str(value.source)
  if (time === undefined || action === undefined) return null
  const rawActor = isRecord(value.actor) ? value.actor : undefined
  return {
    time,
    action,
    source: source ?? 'unknown',
    version: version ?? 0,
    actor: {
      kind: str(rawActor?.kind) ?? 'unknown',
      name: str(rawActor?.name) ?? 'unknown',
    },
  }
}

function normaliseProvenance(value: unknown): Provenance {
  if (!isRecord(value)) return { changes: [] }
  const created = normaliseProvenanceEntry(value.created)
  const changes = Array.isArray(value.changes)
    ? value.changes
        .map(normaliseProvenanceEntry)
        .filter((e): e is ProvenanceEntry => e !== null)
        // Provenance arrives newest-first in some payloads; sort so that
        // "latest change" and step-latency deltas are unambiguous.
        .sort((a, b) => a.time - b.time)
    : []
  return {
    ...(created ? { created } : {}),
    changes,
    ...(isRecord(value.recovery) ? { recovery: value.recovery } : {}),
  }
}

/**
 * A site-view resource. `site` is ours, recorded so a finding can cite which
 * view produced it.
 */
export function normaliseResource(value: unknown, site: Site): SimResource | null {
  if (!isRecord(value)) return null
  const id = str(value.id)
  const kind = str(value.kind)
  const status = str(value.status)
  if (!id || !kind || !status) return null

  return {
    id,
    kind,
    status,
    site,
    title: str(value.title) ?? '',
    version: num(value.version) ?? 1,
    visibleTo: strArray(value.visibleTo),
    data: isRecord(value.data) ? value.data : {},
    provenance: normaliseProvenance(value.provenance),
    ...(str(value.priority) ? { priority: str(value.priority)! } : {}),
    ...(str(value.owner) ? { owner: str(value.owner)! } : {}),
    ...(str(value.patientId) ? { patientId: str(value.patientId)! } : {}),
    ...(num(value.createdAt) !== undefined ? { createdAt: num(value.createdAt)! } : {}),
    ...(num(value.dueAt) !== undefined ? { dueAt: num(value.dueAt)! } : {}),
  }
}

export function normalisePatient(value: unknown): SimPatient | null {
  if (!isRecord(value)) return null
  const id = str(value.id)
  const name = str(value.name)
  if (!id || !name) return null

  const localIds: Record<string, string> = {}
  if (isRecord(value.localIds)) {
    for (const [key, raw] of Object.entries(value.localIds)) {
      const v = str(raw)
      if (v) localIds[key] = v
    }
  }

  return {
    id,
    name,
    conditions: strArray(value.conditions),
    goals: strArray(value.goals),
    needs: strArray(value.needs),
    localIds,
    ...(str(value.birthDate) ? { birthDate: str(value.birthDate)! } : {}),
    ...(typeof value.synthetic === 'boolean' ? { synthetic: value.synthetic } : {}),
  }
}

export function normaliseEvent(value: unknown): SimEvent | null {
  if (!isRecord(value)) return null
  const id = str(value.id)
  const type = str(value.type)
  const time = num(value.time)
  if (!id || !type || time === undefined) return null

  return {
    id,
    type,
    time,
    visibleTo: strArray(value.visibleTo),
    ...(str(value.actor) ? { actor: str(value.actor)! } : {}),
    ...(str(value.detail) ? { detail: str(value.detail)! } : {}),
    ...(str(value.patientId) ? { patientId: str(value.patientId)! } : {}),
    ...(str(value.resourceId) ? { resourceId: str(value.resourceId)! } : {}),
  }
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** Age from an ISO birth date, evaluated against a supplied instant. Pure. */
export function ageFrom(birthDate: string | undefined, nowMs: number): number | undefined {
  if (!birthDate) return undefined
  const born = Date.parse(birthDate)
  if (Number.isNaN(born)) return undefined
  const bd = new Date(born)
  const now = new Date(nowMs)
  let age = now.getUTCFullYear() - bd.getUTCFullYear()
  const beforeBirthday =
    now.getUTCMonth() < bd.getUTCMonth() ||
    (now.getUTCMonth() === bd.getUTCMonth() && now.getUTCDate() < bd.getUTCDate())
  if (beforeBirthday) age -= 1
  return age >= 0 ? age : undefined
}

/** The most recent provenance entry, or the creation entry. */
export function latestChange(resource: SimResource): ProvenanceEntry | undefined {
  const { changes, created } = resource.provenance
  return changes.length > 0 ? changes[changes.length - 1] : created
}

/** True when a resource's status means no further work is expected. */
const TERMINAL_STATUSES = new Set(['completed', 'filed', 'rejected', 'collected', 'cancelled'])

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toLowerCase())
}

/**
 * Strip the simulator's generator prefixes from an audit action.
 *
 * Seeded history records the document workflow as `seed_document_reviewed`
 * rather than `review`. Matching on the raw string made every seeded review
 * invisible, which reported 62 of 62 discharge letters as never reviewed. The
 * transition is real; only the name is generated.
 */
export function bareAction(action: string): string {
  return action.toLowerCase().replace(/^(seed|generate)_/, '')
}

/**
 * True when any audit entry records one of these verbs.
 *
 * Matches on substring of the de-prefixed action so `seed_document_reviewed`
 * satisfies `review` and `document_filed` satisfies `file`.
 */
export function hasAction(resource: SimResource, verbs: string[]): boolean {
  const entries = resource.provenance.created
    ? [resource.provenance.created, ...resource.provenance.changes]
    : resource.provenance.changes
  return entries.some((entry) => {
    const action = bareAction(entry.action)
    return verbs.some((verb) => action.includes(verb.toLowerCase()))
  })
}
