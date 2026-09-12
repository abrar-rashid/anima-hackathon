/**
 * Right-censoring for in-flight work.
 *
 * A task that has not closed yet has no completion latency. It has elapsed
 * time and is still open. Observation time is never used as a stop event.
 * Open work is never dropped from the result — it is reported as open.
 */

export type LatencyObservation =
  | {
      status: 'completed'
      minutes: number
      startedAt: number
      stoppedAt: number
    }
  | {
      status: 'open'
      minutes: null
      elapsedMinutes: number
      startedAt: number
      observedAt: number
    }
  | {
      status: 'missing'
      minutes: null
      reason: 'start-event-absent'
    }

const MS_PER_MIN = 60_000

export function minutesBetween(from: number, to: number): number {
  return (to - from) / MS_PER_MIN
}

export function observeLatency(input: {
  startedAt: number | undefined
  stoppedAt: number | undefined
  observedAt: number
}): LatencyObservation {
  if (input.startedAt === undefined) {
    return { status: 'missing', minutes: null, reason: 'start-event-absent' }
  }

  if (input.stoppedAt === undefined) {
    return {
      status: 'open',
      minutes: null,
      elapsedMinutes: minutesBetween(input.startedAt, input.observedAt),
      startedAt: input.startedAt,
      observedAt: input.observedAt,
    }
  }

  return {
    status: 'completed',
    minutes: minutesBetween(input.startedAt, input.stoppedAt),
    startedAt: input.startedAt,
    stoppedAt: input.stoppedAt,
  }
}

export function completionMinutes(observation: LatencyObservation): number | null {
  return observation.status === 'completed' ? observation.minutes : null
}

export function elapsedMinutesOf(observation: LatencyObservation): number | null {
  if (observation.status === 'completed') return observation.minutes
  if (observation.status === 'open') return observation.elapsedMinutes
  return null
}
