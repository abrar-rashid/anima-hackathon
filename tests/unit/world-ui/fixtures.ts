import type { WorldEntity, WorldSnapshot } from '@/world/types'

export const WORLD_ID = 'team-ea32f6302052'
export const SIMULATOR_NOW = 1_789_286_400_000
export const PATIENT_ID = 'SIM-000001'
export const RESULT_ID = 'blood-v1-SIM-000001-crp-5'
export const ENTITY_ID = 'entity-blood-v1-SIM-000001-crp-5'
export const CASE_ID = 'case-SIM-000001-blood-v1-SIM-000001-crp-5'
export const CAPTURED_AT = '2026-09-12T12:12:40.886Z'

const MINUTE = 60_000

export function entity(overrides: Partial<WorldEntity> = {}): WorldEntity {
  return {
    entityId: ENTITY_ID,
    caseId: CASE_ID,
    patientId: PATIENT_ID,
    resultId: RESULT_ID,
    resultVersion: 1,
    analyteName: 'C-reactive protein',
    direction: 'above',
    ownerTeamId: 'hospital',
    ownershipState: 'OVERDUE',
    closureState: 'RESULT_AVAILABLE',
    neglectMinutes: 240,
    manualChases: 0,
    exceptionCount: 8,
    duplicateSuppressed: 0,
    ...overrides,
  }
}

export function snapshot(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  const result = entity()
  return {
    now: SIMULATOR_NOW + 240 * MINUTE,
    paused: true,
    speed: 60,
    districts: [
      { teamId: 'hospital', label: 'Hospital', ownedEntityIds: [result.entityId], pendingEntityIds: [] },
      { teamId: 'diagnostics', label: 'Diagnostics', ownedEntityIds: [], pendingEntityIds: [] },
      { teamId: 'gp', label: 'GP practice', ownedEntityIds: [], pendingEntityIds: [result.entityId] },
      { teamId: 'community', label: 'Community', ownedEntityIds: [], pendingEntityIds: [] },
      { teamId: 'pharmacy', label: 'Pharmacy', ownedEntityIds: [], pendingEntityIds: [] },
      { teamId: 'referrals', label: 'Referrals', ownedEntityIds: [], pendingEntityIds: [] },
      { teamId: 'wearables', label: 'Wearables', ownedEntityIds: [], pendingEntityIds: [] },
      { teamId: 'patient', label: 'Patient', ownedEntityIds: [], pendingEntityIds: [] },
    ],
    entities: [result],
    threads: [
      {
        threadId: 'thread-hospital-gp',
        entityId: result.entityId,
        fromTeamId: 'hospital',
        toTeamId: 'gp',
        state: 'OVERDUE',
        ackDeadlineAt: SIMULATOR_NOW + 140 * MINUTE,
        overdueMinutes: 100,
      },
    ],
    events: [
      {
        eventId: 'evt-result',
        entityId: result.entityId,
        simulatorTime: SIMULATOR_NOW,
        kind: 'ResultAvailable',
        detail: 'C-reactive protein 5.6 against range 0–5',
        districtId: 'diagnostics',
      },
      {
        eventId: 'evt-timeout',
        entityId: result.entityId,
        simulatorTime: SIMULATOR_NOW + 140 * MINUTE,
        kind: 'TransferTimedOut',
        detail: 'Acknowledgement deadline elapsed',
        districtId: 'hospital',
      },
    ],
    provenance: {
      world: WORLD_ID,
      replay: { label: 'Recorded simulator replay', capturedAt: CAPTURED_AT },
      denominator: { cases: 1, events: 2 },
    },
    ...overrides,
  }
}

export function acceptedSnapshot(): WorldSnapshot {
  const result = entity({
    ownerTeamId: 'gp',
    ownerActorId: 'gp-duty-1',
    ownershipState: 'ACCEPTED',
    neglectMinutes: 25,
    exceptionCount: 0,
  })
  return snapshot({
    now: SIMULATOR_NOW + 25 * MINUTE,
    entities: [result],
    districts: [
      { teamId: 'hospital', label: 'Hospital', ownedEntityIds: [], pendingEntityIds: [] },
      { teamId: 'gp', label: 'GP practice', ownedEntityIds: [result.entityId], pendingEntityIds: [] },
    ],
    threads: [
      {
        threadId: 'thread-hospital-gp',
        entityId: result.entityId,
        fromTeamId: 'hospital',
        toTeamId: 'gp',
        state: 'ACCEPTED',
        ackDeadlineAt: SIMULATOR_NOW + 45 * MINUTE,
        overdueMinutes: 0,
      },
    ],
    events: [
      {
        eventId: 'evt-result',
        entityId: result.entityId,
        simulatorTime: SIMULATOR_NOW,
        kind: 'ResultAvailable',
        detail: 'C-reactive protein 5.6 against range 0–5',
        districtId: 'diagnostics',
      },
      {
        eventId: 'evt-accept',
        entityId: result.entityId,
        simulatorTime: SIMULATOR_NOW + 25 * MINUTE,
        kind: 'TransferAccepted',
        detail: 'Duty clinician accepted',
        districtId: 'gp',
      },
    ],
    provenance: {
      world: WORLD_ID,
      replay: { label: 'Recorded simulator replay', capturedAt: CAPTURED_AT },
      denominator: { cases: 1, events: 2 },
    },
  })
}

/** Unusual values used to prove the renderer does not invent or hard-code the hero trace. */
export function unusualSnapshot(): WorldSnapshot {
  return {
    now: 1_111_111_111_111,
    paused: true,
    speed: 3,
    districts: [
      {
        teamId: 'pharmacy',
        label: 'Night dispensary',
        ownedEntityIds: ['ent-odd'],
        pendingEntityIds: [],
      },
    ],
    entities: [
      entity({
        entityId: 'ent-odd',
        caseId: 'case-odd',
        patientId: 'SIM-000777',
        resultId: 'blood-odd-xyz',
        resultVersion: 9,
        analyteName: 'Odd analyte',
        direction: 'below',
        ownerTeamId: 'pharmacy',
        ownerActorId: 'pharm-9',
        ownershipState: 'STALE',
        closureState: 'REOPENED',
        neglectMinutes: 777,
        manualChases: 4,
        exceptionCount: 11,
        duplicateSuppressed: 2,
      }),
    ],
    threads: [],
    events: [],
    provenance: {
      world: 'team-unusual-fixture-99',
      replay: { label: 'Recorded simulator replay', capturedAt: '1999-12-31T23:59:00.000Z' },
      denominator: { cases: 17, events: 83 },
    },
  }
}

export function barrenSnapshot(): WorldSnapshot {
  return {
    now: 2_000_000_000_000,
    paused: true,
    speed: 1,
    districts: [],
    entities: [],
    threads: [],
    events: [],
    provenance: {
      world: 'team-barren',
      replay: null,
      denominator: { cases: 0, events: 0 },
    },
  }
}
