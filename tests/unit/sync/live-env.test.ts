import { describe, expect, it } from 'vitest'
import { assertLiveReadOnlyEnv } from '@/sync/live-env'
import { redact } from '@/adapters/anima/redact'
import { summarizeChangedRecords } from '@/sync/diff'
import { record } from './helpers'

describe('live read-only env', () => {
  it('fails loudly when the team key is missing', () => {
    expect(() => assertLiveReadOnlyEnv({ ANIMA_SIM_API_KEY: '' })).toThrow(/ANIMA_SIM_API_KEY is empty/)
  })

  it('refuses silent fake or replay fallbacks', () => {
    const live = { ANIMA_SIM_API_KEY: 'not-a-real-key' }
    expect(() => assertLiveReadOnlyEnv({ ...live, COVENANT_FAKE_PORTS: '1' })).toThrow(
      /COVENANT_FAKE_PORTS/,
    )
    expect(() => assertLiveReadOnlyEnv({ ...live, COVENANT_RECORDED_REPLAY: '1' })).toThrow(
      /COVENANT_RECORDED_REPLAY/,
    )
    expect(() => assertLiveReadOnlyEnv(live)).not.toThrow()
  })

  it('redacts free-text and bearer tokens from printed change summaries', () => {
    const summary = summarizeChangedRecords([
      record({
        id: 'r-note',
        data: {
          text: 'Book follow up appointment in 4 weeks',
          body: 'Chase blood culture results',
          note: 'clinical narrative',
        },
      }),
    ])
    const printed = JSON.stringify(
      redact({
        ...summary[0],
        leak: 'Bearer super-secret-team-key',
      }),
    )
    expect(printed).not.toContain('Book follow up')
    expect(printed).not.toContain('Chase blood')
    expect(printed).not.toContain('super-secret-team-key')
    expect(printed).toContain('[redacted]')
    expect(printed).toContain('r-note')
  })
})
