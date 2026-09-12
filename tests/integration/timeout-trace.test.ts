import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TwinRequest, TwinResponse } from '@/api/contracts'
import {
  assertOwnerPresent,
  fakeContainer,
  PATIENT_ID,
} from './helpers'

beforeEach(() => {
  vi.stubEnv('COVENANT_FAKE_PORTS', '1')
  vi.stubEnv('COVENANT_RECORDED_REPLAY', '')
  vi.stubEnv('OPENAI_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

function ofType<T extends { event: { type: string } }>(log: T[], type: string): T[] {
  return log.filter((row) => row.event.type === type)
}

describe('integration (b): timeout trace retains the orderer and emits one FallbackNotified', () => {
  it('replays after-hours-timeout: orderer stays accountable at timeout and FallbackNotified fires once', async () => {
    const container = await fakeContainer()
    const opened = await container.cases.open({ patientId: PATIENT_ID })
    assertOwnerPresent(opened.case)

    const body = TwinRequest.parse({
      traceId: 'after-hours-timeout',
      baseProtocolId: 'v3',
      diff: { dedupeWindowMinutes: 10_000 },
    })
    const twin = TwinResponse.parse(await container.cases.twin(opened.case.caseId, body))

    const baseline = twin.comparison.baseline.finalState
    const candidate = twin.comparison.candidate.finalState
    assertOwnerPresent(baseline)
    assertOwnerPresent(candidate)

    expect(ofType(baseline.eventLog, 'FallbackNotified').length).toBeGreaterThan(1)

    const fallbacks = ofType(candidate.eventLog, 'FallbackNotified')
    expect(fallbacks).toHaveLength(1)
    expect(ofType(candidate.eventLog, 'TransferTimedOut')).toHaveLength(1)
    expect(candidate.exceptionsEmitted).toHaveLength(1)
    expect(fallbacks[0]?.event).toMatchObject({
      type: 'FallbackNotified',
      toTeam: twin.candidateProtocol.fallbackTeamId,
    })

    expect(candidate.orderingTeamId).toBe('hospital')
    expect(candidate.currentAccountableOwner.teamId.length).toBeGreaterThan(0)

    const firstTimeoutAt = candidate.eventLog.find((row) => row.event.type === 'TransferTimedOut')
      ?.simulatorTime
    const namedAcceptAt = candidate.eventLog.find((row) => {
      if (row.event.type !== 'TransferAccepted') return false
      const actor = (row.event as { actor?: { id?: string } }).actor
      return actor?.id === 'gp-dr-named'
    })?.simulatorTime
    expect(firstTimeoutAt).toBeDefined()
    expect(namedAcceptAt).toBeDefined()
    expect(firstTimeoutAt!).toBeLessThan(namedAcceptAt!)

    const fallbackAt = fallbacks[0]?.simulatorTime
    expect(fallbackAt).toBe(firstTimeoutAt)
    expect(candidate.orderingTeamId).not.toBe('')
    expect(twin.comparison.sameTrace).toBe(true)
  })
})
