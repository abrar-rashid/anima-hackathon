import type { CovenantCase, DomainEvent, EventEnvelope, OwnershipState, TeamId } from '@/domain/types'
import type { WorldThread } from '@/world/types'

export const MS_PER_MINUTE = 60_000

const DISTRICT_LABELS: Record<TeamId, string> = {
  hospital: 'Hospital',
  diagnostics: 'Diagnostics',
  gp: 'GP',
  community: 'Community',
  pharmacy: 'Pharmacy',
  referrals: 'Referrals',
  wearables: 'Wearables',
  patient: 'Patient',
  'gp-duty': 'GP duty',
}

const TEAM_IDS = new Set<string>(Object.keys(DISTRICT_LABELS))

export function isTeamId(value: string): value is TeamId {
  return TEAM_IDS.has(value)
}

export function districtLabel(teamId: TeamId): string {
  return DISTRICT_LABELS[teamId]
}

export function minutesBetween(from: number, to: number): number {
  return Math.max(0, (to - from) / MS_PER_MINUTE)
}

/** Ownership states in which a covenant thread is visible. */
export function threadStateFromOwnership(ownership: OwnershipState): WorldThread['state'] | null {
  switch (ownership) {
    case 'TRANSFER_REQUESTED':
      return 'REQUESTED'
    case 'ACCEPTED':
      return 'ACCEPTED'
    case 'DECLINED':
      return 'DECLINED'
    case 'OVERDUE':
      return 'OVERDUE'
    case 'OWNER_UNAVAILABLE':
      return 'RECEIVER_UNAVAILABLE'
    case 'STALE':
      return 'STALE'
    case 'ORDERER_OWNS':
      return null
  }
}

export function resultAvailableAt(eventLog: EventEnvelope[]): number | null {
  for (const envelope of eventLog) {
    if (envelope.event.type === 'ResultAvailable') return envelope.simulatorTime
  }
  return null
}

/**
 * Simulator time of the accountable acceptance, or null if none has occurred.
 * Uses the reduced case (not the first TransferAccepted in a raw trace) so a
 * rejected named-actor accept cannot be treated as ownership.
 */
export function accountableAcceptanceAt(
  covenant: CovenantCase,
  eventLog: EventEnvelope[],
): number | null {
  if (covenant.ownershipState !== 'ACCEPTED') return null
  const logs = [covenant.eventLog, eventLog]
  for (const log of logs) {
    for (const envelope of log) {
      if (envelope.event.type !== 'TransferAccepted') continue
      if (
        covenant.acceptingActor == null ||
        envelope.event.actor.id === covenant.acceptingActor.id
      ) {
        return envelope.simulatorTime
      }
    }
  }
  return null
}

/**
 * Elapsed simulator minutes with no accountable acceptance.
 * Origin is ResultAvailable; the clock is the end until someone accepts, then
 * the value freezes at the acceptance instant. Never estimated or smoothed.
 */
export function neglectMinutes(
  covenant: CovenantCase,
  eventLog: EventEnvelope[],
  now: number,
): number {
  const origin = resultAvailableAt(covenant.eventLog) ?? resultAvailableAt(eventLog)
  if (origin == null) return 0
  const acceptedAt = accountableAcceptanceAt(covenant, eventLog)
  const end = acceptedAt ?? now
  return minutesBetween(origin, end)
}

/**
 * Minutes past the acknowledgement deadline at `now`, else 0.
 * Once the thread is accepted or declined the deadline is no longer outstanding.
 */
export function overdueMinutes(
  ackDeadlineAt: number | null,
  now: number,
  threadState: WorldThread['state'],
): number {
  if (ackDeadlineAt == null) return 0
  if (threadState === 'ACCEPTED' || threadState === 'DECLINED') return 0
  return minutesBetween(ackDeadlineAt, now)
}

export function exceptionCount(covenant: CovenantCase): number {
  return covenant.exceptionsEmitted.length
}

export function duplicateSuppressedCount(covenant: CovenantCase): number {
  return covenant.duplicateSuppressed
}

export function hasTransferRequest(eventLog: EventEnvelope[]): boolean {
  return eventLog.some((envelope) => envelope.event.type === 'TransferRequested')
}

export function eventDetail(event: DomainEvent): string {
  switch (event.type) {
    case 'ResultAvailable':
      return `ResultAvailable resultId=${event.resultId} resultVersion=${event.resultVersion} orderingTeamId=${event.orderingTeamId} requestedReceiver=${event.requestedReceiver}`
    case 'ClinicalReviewRecorded':
      return `ClinicalReviewRecorded actor=${event.actor.id} teamId=${event.actor.teamId}`
    case 'PlanRecorded':
      return `PlanRecorded actor=${event.actor.id} teamId=${event.actor.teamId} planRef=${event.planRef.resourceId}`
    case 'TransferRequested':
      return event.toActorId === undefined
        ? `TransferRequested toTeam=${event.toTeam} ackDeadlineAt=${event.ackDeadlineAt}`
        : `TransferRequested toTeam=${event.toTeam} toActorId=${event.toActorId} ackDeadlineAt=${event.ackDeadlineAt}`
    case 'TransferAccepted':
      return `TransferAccepted actor=${event.actor.id} teamId=${event.actor.teamId}`
    case 'TransferDeclined':
      return `TransferDeclined actor=${event.actor.id} teamId=${event.actor.teamId} reason=${event.reason}`
    case 'TransferTimedOut':
      return 'TransferTimedOut'
    case 'ReceiverUnavailable':
      return `ReceiverUnavailable actorId=${event.actorId}`
    case 'FallbackNotified':
      return `FallbackNotified toTeam=${event.toTeam} exceptionId=${event.exceptionId}`
    case 'ManualChase':
      return `ManualChase byTeam=${event.byTeam}`
    case 'PatientMessageSubmitted':
      return `PatientMessageSubmitted messageId=${event.messageId}`
    case 'PatientContactEvidenced':
      return `PatientContactEvidenced resourceId=${event.evidence.resourceId}`
    case 'PatientContactFailed':
      return `PatientContactFailed messageId=${event.messageId}`
    case 'ActionSubmitted':
      return `ActionSubmitted actionKind=${event.actionKind} idempotencyKey=${event.idempotencyKey}`
    case 'ActionVisibleDownstream':
      return `ActionVisibleDownstream resourceId=${event.evidence.resourceId}`
    case 'ActivityEvidenced':
      return `ActivityEvidenced resourceId=${event.evidence.resourceId}`
    case 'OutcomeEvidenced':
      return `OutcomeEvidenced resourceId=${event.evidence.resourceId}`
    case 'SourceVersionChanged':
      return `SourceVersionChanged newVersion=${event.newVersion}`
    case 'CaseReopened':
      return `CaseReopened affectedSteps=${event.affectedSteps.join(',')}`
    case 'ClockTick':
      return `ClockTick now=${event.now}`
  }
}

export function eventDistrict(event: DomainEvent): TeamId | null {
  switch (event.type) {
    case 'ResultAvailable':
      return event.orderingTeamId
    case 'ClinicalReviewRecorded':
    case 'PlanRecorded':
    case 'TransferAccepted':
    case 'TransferDeclined':
      return event.actor.teamId
    case 'TransferRequested':
    case 'FallbackNotified':
      return event.toTeam
    case 'ManualChase':
      return event.byTeam
    case 'PatientContactEvidenced':
    case 'ActionVisibleDownstream':
    case 'ActivityEvidenced':
    case 'OutcomeEvidenced':
      return isTeamId(event.evidence.site) ? event.evidence.site : null
    case 'ActionSubmitted':
      return isTeamId(event.receipt.site) ? event.receipt.site : null
    case 'TransferTimedOut':
    case 'ReceiverUnavailable':
    case 'PatientMessageSubmitted':
    case 'PatientContactFailed':
    case 'SourceVersionChanged':
    case 'CaseReopened':
    case 'ClockTick':
      return null
  }
}

export function compareEnvelopes(a: EventEnvelope, b: EventEnvelope): number {
  if (a.simulatorTime !== b.simulatorTime) return a.simulatorTime - b.simulatorTime
  return a.eventId.localeCompare(b.eventId)
}

export function clockNow(envelope: EventEnvelope): number {
  return envelope.event.type === 'ClockTick' ? envelope.event.now : envelope.simulatorTime
}
