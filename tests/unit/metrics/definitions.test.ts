import { describe, expect, it } from 'vitest'

import {
  COUNT_METRIC_DEFINITIONS,
  LATENCY_METRIC_DEFINITIONS,
  METRIC_DEFINITIONS,
  SMALL_N_THRESHOLD,
  TIME_IN_STATE_DEFINITION,
} from '@/metrics/definitions'

const CLINICAL_INFERENCE = /\b(risk|acuity|harm|diagnos|urgent|safety verdict)\b/i

describe('metric definitions', () => {
  it('every latency metric names its start and stop events, unit, and display sentence', () => {
    expect(LATENCY_METRIC_DEFINITIONS.length).toBeGreaterThan(0)
    for (const definition of LATENCY_METRIC_DEFINITIONS) {
      expect(definition.kind).toBe('latency')
      expect(definition.name.length).toBeGreaterThan(0)
      expect(definition.startEvents.length).toBeGreaterThan(0)
      expect(definition.stopEvents.length).toBeGreaterThan(0)
      expect(definition.unit).toBe('minutes')
      expect(definition.censoring).toBe('right-censor-open')
      expect(definition.displaySentence.length).toBeGreaterThan(20)
    }
  })

  it('every count metric names the events it counts, its unit, and display sentence', () => {
    expect(COUNT_METRIC_DEFINITIONS.length).toBeGreaterThan(0)
    for (const definition of COUNT_METRIC_DEFINITIONS) {
      expect(definition.kind).toBe('count')
      expect(definition.name.length).toBeGreaterThan(0)
      expect(definition.countedEvents.length).toBeGreaterThan(0)
      expect(definition.unit).toBe('count')
      expect(definition.displaySentence.length).toBeGreaterThan(20)
    }
  })

  it('display sentences describe elapsed time and state transitions, not clinical risk', () => {
    for (const definition of METRIC_DEFINITIONS) {
      expect(definition.displaySentence).not.toMatch(CLINICAL_INFERENCE)
    }
    expect(TIME_IN_STATE_DEFINITION.displaySentence).not.toMatch(CLINICAL_INFERENCE)
  })

  it('exports a small-n threshold the UI can read instead of inventing confidence', () => {
    expect(SMALL_N_THRESHOLD).toBeGreaterThan(0)
    expect(Number.isInteger(SMALL_N_THRESHOLD)).toBe(true)
  })

  it('accepted-owner latency starts at TransferRequested and stops at TransferAccepted', () => {
    const definition = LATENCY_METRIC_DEFINITIONS.find((row) => row.name === 'accepted_owner_latency')
    expect(definition?.startEvents).toContain('TransferRequested')
    expect(definition?.stopEvents).toContain('TransferAccepted')
  })
})
