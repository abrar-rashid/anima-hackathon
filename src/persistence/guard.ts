import type { AuditEntry, StoredCase } from '@/persistence/port'
import type { ProtocolVersion, StaffIdentity } from '@/domain/types'

const FORBIDDEN_KEYS = new Set(['ANIMA_SIM_API_KEY', 'Authorization', 'authorization'])
const SUBJECT_KEYS = new Set(['resourceId', 'resourceVersion', 'activityId'])

export function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

export function assertPersistable(value: unknown): void {
  walk(value)
}

export function assertSyntheticPatient(patientId: string): void {
  if (!/^SIM-/.test(patientId)) {
    throw new Error('persistence stores synthetic SIM-* patients only')
  }
}

export function assertStoredCase(stored: StoredCase): void {
  assertSyntheticPatient(stored.case.patientId)
  assertPersistable(stored)
  if (stored.case.acceptingActor) assertStaffActor(stored.case.acceptingActor)
}

export function assertAuditEntry(entry: AuditEntry): void {
  assertPersistable(entry)
  assertActor(entry.actor)
  assertAuditSubject(entry.subject)
}

export function assertProtocol(protocol: ProtocolVersion): void {
  assertPersistable(protocol)
}

export function actorIdOf(actor: AuditEntry['actor']): string {
  if (isSystemActor(actor)) return actor.name
  return actor.id
}

function isSystemActor(actor: AuditEntry['actor']): actor is { kind: 'system'; name: string } {
  return 'kind' in actor && actor.kind === 'system'
}

function assertStaffActor(actor: StaffIdentity): void {
  if (actor.attribution !== 'app-side') {
    throw new Error('clinician identity is app-side and must be recorded as such')
  }
}

function assertActor(actor: AuditEntry['actor']): void {
  if (isSystemActor(actor)) return
  assertStaffActor(actor)
}

function assertAuditSubject(subject: AuditEntry['subject']): void {
  for (const key of Object.keys(subject)) {
    if (!SUBJECT_KEYS.has(key)) {
      throw new Error('audit subject may carry ids and versions only')
    }
  }
}

function walk(value: unknown): void {
  if (typeof value === 'string') {
    if (/Bearer\s+\S+/i.test(value)) {
      throw new Error('persistence refused a secret-bearing payload')
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error('persistence refused a secret-bearing payload')
      }
      walk(child)
    }
  }
}
