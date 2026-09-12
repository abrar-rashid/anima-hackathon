/**
 * Pixel Societies: the view model for the world view.
 *
 * Every field here must be derivable from real covenant state, its event log, or the
 * simulator clock. Nothing in this model may be invented to make the world look busy:
 * if the data does not say it happened, it has no representation.
 */
import type {
  ClosureState,
  CovenantCase,
  EventEnvelope,
  OwnershipState,
  SiteId,
  TeamId,
} from '@/domain/types'

/** A site of the simulator world, rendered as a place. */
export interface WorldDistrict {
  teamId: TeamId
  /** Human label shown in the accessible representation as well as the canvas. */
  label: string
  /** Results whose accountable owner is currently this district. */
  ownedEntityIds: string[]
  /** Results this district has been asked to accept but has not accepted. */
  pendingEntityIds: string[]
}

/**
 * A result travelling through the world. One entity per covenant case.
 * `neglectMinutes` is elapsed simulator time without an accountable acceptance —
 * it is computed, never decorative.
 */
export interface WorldEntity {
  entityId: string
  caseId: string
  patientId: string
  resultId: string
  resultVersion: number
  analyteName: string
  /** 'above' | 'below' the source-supplied reference range. Never a severity. */
  direction: 'below' | 'above'
  ownerTeamId: TeamId
  ownerActorId?: string
  ownershipState: OwnershipState
  closureState: ClosureState
  neglectMinutes: number
  manualChases: number
  exceptionCount: number
  duplicateSuppressed: number
}

/** A covenant in flight: a visible obligation between two districts. */
export interface WorldThread {
  threadId: string
  entityId: string
  fromTeamId: TeamId
  toTeamId: TeamId
  /** Derived from ownership state, never from an HTTP status. */
  state: 'REQUESTED' | 'ACCEPTED' | 'DECLINED' | 'OVERDUE' | 'RECEIVER_UNAVAILABLE' | 'STALE'
  ackDeadlineAt: number | null
  /** Minutes past the acknowledgement deadline at the current world time, else 0. */
  overdueMinutes: number
}

/** Something that actually happened, taken from the event log. */
export interface WorldEvent {
  eventId: string
  entityId: string
  simulatorTime: number
  kind: EventEnvelope['event']['type']
  /** Plain description built from the event's own fields. No interpretation. */
  detail: string
  districtId: TeamId | null
}

export interface WorldProvenance {
  /** Simulator world id, e.g. team-ea32f6302052. Always shown to the viewer. */
  world: string
  /** Present only for captured replays; forces the verbatim replay label. */
  replay: { label: 'Recorded simulator replay'; capturedAt: string } | null
  /** How many cases and events this world was built from. Honest denominator. */
  denominator: { cases: number; events: number }
}

export interface WorldSnapshot {
  /** Simulator time this snapshot represents. */
  now: number
  paused: boolean
  speed: number
  districts: WorldDistrict[]
  entities: WorldEntity[]
  threads: WorldThread[]
  /** Chronological, most recent last. */
  events: WorldEvent[]
  provenance: WorldProvenance
}

export interface WorldProjectionInput {
  cases: { case: CovenantCase; eventLog: EventEnvelope[] }[]
  clock: { now: number; paused: boolean; speed: number }
  world: string
  replay?: { label: 'Recorded simulator replay'; capturedAt: string } | null
}

/** The sites that exist in the captured simulator world, in display order. */
export const WORLD_SITES: readonly SiteId[] = [
  'hospital',
  'diagnostics',
  'gp',
  'community',
  'pharmacy',
  'referrals',
  'wearables',
  'patient',
] as const
