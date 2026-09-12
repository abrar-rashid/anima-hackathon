import { replayTrace } from '@/domain/twin'
import type { EventEnvelope, ProtocolVersion } from '@/domain/types'
import { clockNow } from '@/world/derive'
import { project } from '@/world/projection'
import type { WorldSnapshot } from '@/world/types'

export const RECORDED_REPLAY_LABEL = 'Recorded simulator replay' as const

export interface WorldReplayInput {
  trace: readonly EventEnvelope[]
  protocol: ProtocolVersion
  caseSeed: { caseId: string; patientId: string }
  world: string
  capturedAt: string
  clock?: { paused: boolean; speed: number }
}

/**
 * Replay one immutable trace through the domain twin, projecting a snapshot
 * after each applied event so a renderer can animate real history.
 * Rejected events are omitted: they did not happen.
 */
export function replay(input: WorldReplayInput): WorldSnapshot[] {
  const paused = input.clock?.paused ?? true
  const speed = input.clock?.speed ?? 60
  const replayMeta = { label: RECORDED_REPLAY_LABEL, capturedAt: input.capturedAt }
  const snapshots: WorldSnapshot[] = []

  for (let index = 0; index < input.trace.length; index += 1) {
    const prefix = input.trace.slice(0, index + 1)
    const envelope = prefix[index]
    if (envelope === undefined) continue

    const run = replayTrace(prefix, input.protocol, input.caseSeed)
    const rejectedLast = run.rejected.some((row) => row.envelope.eventId === envelope.eventId)
    if (rejectedLast) continue

    snapshots.push(
      project({
        cases: [{ case: run.finalState, eventLog: run.finalState.eventLog }],
        clock: { now: clockNow(envelope), paused, speed },
        world: input.world,
        replay: replayMeta,
      }),
    )
  }

  return snapshots
}
