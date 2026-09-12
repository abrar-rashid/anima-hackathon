import { describe, expect, it } from 'vitest'

import { observeLatency } from '@/metrics/censoring'

const STARTED = 1_789_286_400_000
const STOPPED = STARTED + 25 * 60_000
const OBSERVED = STARTED + 300 * 60_000

describe('censoring of in-flight work', () => {
  it('open work has elapsed time and no completion latency', () => {
    const observed = observeLatency({
      startedAt: STARTED,
      stoppedAt: undefined,
      observedAt: OBSERVED,
    })

    expect(observed.status).toBe('open')
    if (observed.status !== 'open') return
    expect(observed.minutes).toBeNull()
    expect(observed.elapsedMinutes).toBe(300)
    expect(observed.startedAt).toBe(STARTED)
    expect(observed.observedAt).toBe(OBSERVED)
  })

  it('never treats observation time as a completion stop', () => {
    const observed = observeLatency({
      startedAt: STARTED,
      stoppedAt: undefined,
      observedAt: OBSERVED,
    })

    expect(observed.status).not.toBe('completed')
    expect(observed.minutes).toBeNull()
  })

  it('missing start is reported missing, not zero', () => {
    const observed = observeLatency({
      startedAt: undefined,
      stoppedAt: STOPPED,
      observedAt: OBSERVED,
    })

    expect(observed).toEqual({
      status: 'missing',
      minutes: null,
      reason: 'start-event-absent',
    })
  })

  it('completed latency uses only start and stop events', () => {
    const observed = observeLatency({
      startedAt: STARTED,
      stoppedAt: STOPPED,
      observedAt: OBSERVED,
    })

    expect(observed).toEqual({
      status: 'completed',
      minutes: 25,
      startedAt: STARTED,
      stoppedAt: STOPPED,
    })
  })
})
