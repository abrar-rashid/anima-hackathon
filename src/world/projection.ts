import type { CovenantCase, EventEnvelope, TeamId } from '@/domain/types'
import {
  compareEnvelopes,
  districtLabel,
  duplicateSuppressedCount,
  eventDetail,
  eventDistrict,
  exceptionCount,
  hasTransferRequest,
  neglectMinutes,
  overdueMinutes,
  threadStateFromOwnership,
} from '@/world/derive'
import type {
  WorldDistrict,
  WorldEntity,
  WorldEvent,
  WorldProjectionInput,
  WorldSnapshot,
  WorldThread,
} from '@/world/types'
import { WORLD_SITES } from '@/world/types'

function ownerTeamId(covenant: CovenantCase): TeamId {
  const current = covenant.currentAccountableOwner.teamId
  if (current.length > 0) return current
  return covenant.orderingTeamId
}

function logOf(entry: WorldProjectionInput['cases'][number]): EventEnvelope[] {
  return entry.eventLog
}

function collectExtraTeamIds(entries: WorldProjectionInput['cases']): TeamId[] {
  const seen = new Set<TeamId>()
  for (const site of WORLD_SITES) seen.add(site)

  const extras: TeamId[] = []
  const consider = (teamId: TeamId | null | undefined) => {
    if (teamId == null || seen.has(teamId)) return
    seen.add(teamId)
    extras.push(teamId)
  }

  for (const entry of entries) {
    const covenant = entry.case
    consider(ownerTeamId(covenant))
    consider(covenant.orderingTeamId)
    consider(covenant.requestedReceiver)
    for (const envelope of logOf(entry)) {
      consider(eventDistrict(envelope.event))
    }
  }

  extras.sort((a, b) => a.localeCompare(b))
  return extras
}

function projectEntity(
  covenant: CovenantCase,
  eventLog: EventEnvelope[],
  now: number,
): WorldEntity | null {
  if (covenant.sourceResultId.length === 0) return null

  const owner = ownerTeamId(covenant)
  const entity: WorldEntity = {
    entityId: covenant.caseId,
    caseId: covenant.caseId,
    patientId: covenant.patientId,
    resultId: covenant.sourceResultId,
    resultVersion: covenant.sourceResultVersion,
    analyteName: covenant.sourceClassification.analyteName,
    direction: covenant.sourceClassification.direction,
    ownerTeamId: owner,
    ownershipState: covenant.ownershipState,
    closureState: covenant.closureState,
    neglectMinutes: neglectMinutes(covenant, eventLog, now),
    manualChases: covenant.manualChases,
    exceptionCount: exceptionCount(covenant),
    duplicateSuppressed: duplicateSuppressedCount(covenant),
  }
  const actorId = covenant.currentAccountableOwner.actorId
  if (actorId !== undefined && actorId.length > 0) {
    entity.ownerActorId = actorId
  }
  return entity
}

function projectThread(covenant: CovenantCase, eventLog: EventEnvelope[], now: number): WorldThread | null {
  const receiver = covenant.requestedReceiver
  if (receiver == null) return null
  const logs = [...covenant.eventLog, ...eventLog]
  if (!hasTransferRequest(logs)) return null

  const state = threadStateFromOwnership(covenant.ownershipState)
  if (state == null) return null

  const entityId = covenant.caseId
  return {
    threadId: `thread:${entityId}`,
    entityId,
    fromTeamId: covenant.orderingTeamId,
    toTeamId: receiver,
    state,
    ackDeadlineAt: covenant.deadlines.ackDeadlineAt,
    overdueMinutes: overdueMinutes(covenant.deadlines.ackDeadlineAt, now, state),
  }
}

function projectEvents(entries: WorldProjectionInput['cases']): WorldEvent[] {
  const envelopes: EventEnvelope[] = []
  for (const entry of entries) {
    envelopes.push(...logOf(entry))
  }
  envelopes.sort(compareEnvelopes)
  return envelopes.map((envelope) => ({
    eventId: envelope.eventId,
    entityId: envelope.caseId,
    simulatorTime: envelope.simulatorTime,
    kind: envelope.event.type,
    detail: eventDetail(envelope.event),
    districtId: eventDistrict(envelope.event),
  }))
}

function projectDistricts(
  entries: Array<{ entity: WorldEntity; covenant: CovenantCase; eventLog: EventEnvelope[] }>,
): WorldDistrict[] {
  const extraTeamIds = collectExtraTeamIds(
    entries.map((row) => ({ case: row.covenant, eventLog: row.eventLog })),
  )
  const teamIds: TeamId[] = [...WORLD_SITES, ...extraTeamIds]

  return teamIds.map((teamId) => {
    const ownedEntityIds: string[] = []
    const pendingEntityIds: string[] = []
    for (const row of entries) {
      if (row.entity.ownerTeamId === teamId) ownedEntityIds.push(row.entity.entityId)
      const asked = row.covenant.requestedReceiver === teamId
      const transferred = hasTransferRequest([...row.covenant.eventLog, ...row.eventLog])
      const accepted = row.covenant.ownershipState === 'ACCEPTED'
      if (asked && transferred && !accepted) pendingEntityIds.push(row.entity.entityId)
    }
    return {
      teamId,
      label: districtLabel(teamId),
      ownedEntityIds,
      pendingEntityIds,
    }
  })
}

/**
 * Pure projection of covenant state into a Pixel Societies world snapshot.
 * Deterministic: identical input yields an identical snapshot. Reads only.
 */
export function project(input: WorldProjectionInput): WorldSnapshot {
  const now = input.clock.now
  const sorted = [...input.cases].sort((a, b) => a.case.caseId.localeCompare(b.case.caseId))

  const projected: Array<{ entity: WorldEntity; covenant: CovenantCase; eventLog: EventEnvelope[] }> =
    []
  for (const entry of sorted) {
    const entity = projectEntity(entry.case, entry.eventLog, now)
    if (entity == null) continue
    projected.push({ entity, covenant: entry.case, eventLog: entry.eventLog })
  }

  const entities = projected.map((row) => row.entity)
  const threads = projected
    .map((row) => projectThread(row.covenant, row.eventLog, now))
    .filter((thread): thread is WorldThread => thread != null)
    .sort((a, b) => a.threadId.localeCompare(b.threadId))

  const eventCount = input.cases.reduce((sum, entry) => sum + entry.eventLog.length, 0)

  return {
    now,
    paused: input.clock.paused,
    speed: input.clock.speed,
    districts: projectDistricts(projected),
    entities,
    threads,
    events: projectEvents(sorted),
    provenance: {
      world: input.world,
      replay: input.replay === undefined ? null : input.replay,
      denominator: { cases: input.cases.length, events: eventCount },
    },
  }
}
