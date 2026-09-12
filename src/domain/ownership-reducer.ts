import { deriveAckDeadlineAt } from '@/domain/protocol'
import type { CovenantCase, EventEnvelope, ProtocolVersion } from '@/domain/types'

export function reduceOwnership(
  state: CovenantCase,
  envelope: EventEnvelope,
  protocol: ProtocolVersion,
): CovenantCase {
  const event = envelope.event
  switch (event.type) {
    case 'ResultAvailable':
      return {
        ...state,
        sourceResultId: event.resultId,
        sourceResultVersion: event.resultVersion,
        sourceClassification: event.classification,
        orderingTeamId: event.orderingTeamId,
        requestedReceiver: event.requestedReceiver,
        currentAccountableOwner: { teamId: event.orderingTeamId },
        acceptingActor: null,
        protocolVersion: protocol.id,
        ownershipState: 'ORDERER_OWNS',
      }
    case 'TransferRequested':
      return {
        ...state,
        ownershipState: 'TRANSFER_REQUESTED',
        requestedReceiver: event.toTeam,
        deadlines: { ackDeadlineAt: deriveAckDeadlineAt(envelope.simulatorTime, protocol) },
      }
    case 'TransferAccepted':
      return {
        ...state,
        ownershipState: 'ACCEPTED',
        currentAccountableOwner: { teamId: event.actor.teamId, actorId: event.actor.id },
        acceptingActor: event.actor,
      }
    case 'TransferDeclined':
      return {
        ...state,
        ownershipState: 'DECLINED',
        currentAccountableOwner: { teamId: state.orderingTeamId },
        acceptingActor: null,
      }
    case 'TransferTimedOut':
      return {
        ...state,
        ownershipState: 'OVERDUE',
        currentAccountableOwner: { teamId: state.orderingTeamId },
        acceptingActor: null,
      }
    case 'ReceiverUnavailable':
      return {
        ...state,
        ownershipState: 'OWNER_UNAVAILABLE',
        currentAccountableOwner: { teamId: state.currentAccountableOwner.teamId },
      }
    case 'SourceVersionChanged':
      return {
        ...state,
        ownershipState: 'STALE',
        sourceResultVersion: event.newVersion,
        currentAccountableOwner: { teamId: state.currentAccountableOwner.teamId },
      }
    default:
      return state
  }
}

export function isOutstandingTransfer(state: CovenantCase): boolean {
  return (
    state.ownershipState === 'TRANSFER_REQUESTED' ||
    state.ownershipState === 'OVERDUE' ||
    state.ownershipState === 'OWNER_UNAVAILABLE'
  )
}

export function lastTransferToActorId(state: CovenantCase): string | undefined {
  for (let i = state.eventLog.length - 1; i >= 0; i -= 1) {
    const event = state.eventLog[i]?.event
    if (event?.type === 'TransferRequested') return event.toActorId
  }
  return undefined
}
