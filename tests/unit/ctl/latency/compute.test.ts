import { describe, expect, it } from 'vitest'
import type { SimResource, StepObservation } from '@/ctl/contracts'
import {
  bucketByTransition,
  computeBreakage,
  computeLatency,
  observeSteps,
} from '@/ctl/latency/compute'
import { allResources, fixtureNow, fixtureScanWindow } from '../fixtures'

describe('latency observations', () => {
  it('observeSteps emits created→first change and consecutive change pairs', () => {
    const resource: SimResource = {
      id: 'step-fixture',
      kind: 'task',
      title: 'Step fixture',
      status: 'open',
      version: 3,
      visibleTo: ['gp'],
      data: {},
      site: 'gp',
      provenance: {
        created: {
          time: 1_000,
          action: 'generate_history',
          source: 'gp',
          version: 1,
          actor: { kind: 'simulation', name: 'Synthetic GP history' },
        },
        changes: [
          {
            time: 4_000,
            action: 'accept',
            source: 'gp',
            version: 2,
            actor: { kind: 'team', name: 'team12' },
          },
          {
            time: 10_000,
            action: 'review',
            source: 'gp',
            version: 3,
            actor: { kind: 'team', name: 'team12' },
          },
        ],
      },
    }

    const steps = observeSteps([resource])
    expect(steps).toEqual([
      {
        fromAction: 'generate_history',
        toAction: 'accept',
        site: 'gp',
        elapsedMs: 3_000,
        resourceId: 'step-fixture',
      },
      {
        fromAction: 'accept',
        toAction: 'review',
        site: 'gp',
        elapsedMs: 6_000,
        resourceId: 'step-fixture',
      },
    ])
  })

  it('bucketByTransition computes median and nearest-rank p90 with n equal to observation count', () => {
    const observations: StepObservation[] = [
      { fromAction: 'a', toAction: 'b', site: 'gp', elapsedMs: 100, resourceId: 'r1' },
      { fromAction: 'a', toAction: 'b', site: 'gp', elapsedMs: 200, resourceId: 'r2' },
      { fromAction: 'a', toAction: 'b', site: 'gp', elapsedMs: 300, resourceId: 'r3' },
      { fromAction: 'a', toAction: 'b', site: 'gp', elapsedMs: 400, resourceId: 'r4' },
      { fromAction: 'a', toAction: 'b', site: 'gp', elapsedMs: 500, resourceId: 'r5' },
      { fromAction: 'a', toAction: 'b', site: 'gp', elapsedMs: 600, resourceId: 'r6' },
      { fromAction: 'a', toAction: 'b', site: 'gp', elapsedMs: 700, resourceId: 'r7' },
      { fromAction: 'a', toAction: 'b', site: 'gp', elapsedMs: 800, resourceId: 'r8' },
      { fromAction: 'a', toAction: 'b', site: 'gp', elapsedMs: 900, resourceId: 'r9' },
      { fromAction: 'a', toAction: 'b', site: 'gp', elapsedMs: 1_000, resourceId: 'r10' },
    ]

    const buckets = bucketByTransition(observations)
    expect(buckets).toHaveLength(1)
    expect(buckets[0]).toMatchObject({
      // Action names are humanised for the screen, so the bucket label is too.
      label: 'A → B',
      n: 10,
      medianMs: 550,
      p90Ms: 900,
      maxMs: 1_000,
    })
    expect(buckets.every((bucket) => bucket.n > 0)).toBe(true)
  })

  it('never emits zero-n buckets', () => {
    const buckets = bucketByTransition([])
    expect(buckets).toHaveLength(0)
  })
})

describe('computeBreakage on live fixtures', () => {
  const now = fixtureNow()
  const resources = allResources()

  it('emits only rates with denominators greater than zero', () => {
    const rates = computeBreakage(resources, now)
    expect(rates.length).toBeGreaterThan(0)
    for (const rate of rates) {
      expect(rate.denominator).toBeGreaterThan(0)
      expect(rate.numerator).toBeLessThanOrEqual(rate.denominator)
    }
  })

  it('computeLatency attaches the scan window and non-empty step buckets when changes exist', () => {
    const window = fixtureScanWindow()
    const report = computeLatency(resources, now, window)
    expect(report.window).toBe(window)
    expect(report.steps.every((bucket) => bucket.n > 0)).toBe(true)
    expect(report.breakage.every((rate) => rate.denominator > 0)).toBe(true)
  })
})
