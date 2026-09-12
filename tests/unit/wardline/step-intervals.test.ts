import { describe, expect, it } from 'vitest'
import type { SimResource } from '@/ctl/contracts'
import {
  buildStepChains,
  formatStepDuration,
  gapWidths,
  longestGap,
} from '@/components/wardline/step-intervals'

function resource(overrides: Partial<SimResource> = {}): SimResource {
  return {
    id: 'doc-1',
    kind: 'discharge-summary',
    title: 'Cardiology handover',
    status: 'open',
    version: 3,
    visibleTo: ['hospital'],
    data: {},
    site: 'hospital',
    patientId: 'SIM-000006',
    provenance: {
      created: {
        time: 1_000,
        action: 'seed_document_sent',
        source: 'hospital',
        version: 1,
        actor: { kind: 'simulation', name: 'Hospital seed' },
      },
      changes: [
        {
          time: 1_000 + 4 * 3_600_000,
          action: 'seed_document_reviewed',
          source: 'gp',
          version: 2,
          actor: { kind: 'team', name: 'duty GP' },
        },
        {
          time: 1_000 + 4 * 3_600_000 + 30 * 60_000,
          action: 'file',
          source: 'gp',
          version: 3,
          actor: { kind: 'team', name: 'duty GP' },
        },
      ],
    },
    ...overrides,
  }
}

describe('buildStepChains', () => {
  it('measures successive provenance gaps and does not invent steps', () => {
    const [chain] = buildStepChains([resource()])
    expect(chain?.gaps).toHaveLength(2)
    expect(chain?.gaps[0]).toMatchObject({
      fromLabel: 'Document sent',
      toLabel: 'Document reviewed',
      elapsedMs: 4 * 3_600_000,
    })
    expect(chain?.gaps[1]?.elapsedMs).toBe(30 * 60_000)
    expect(chain?.totalElapsedMs).toBe(4 * 3_600_000 + 30 * 60_000)
    expect(chain?.patientId).toBe('SIM-000006')
  })

  it('skips records with fewer than two provenance actions', () => {
    expect(
      buildStepChains([
        resource({
          id: 'solo',
          provenance: {
            created: {
              time: 1,
              action: 'create',
              source: 'gp',
              version: 1,
              actor: { kind: 'system', name: 'sim' },
            },
            changes: [],
          },
        }),
      ]),
    ).toEqual([])
  })

  it('sorts the longest total wait first', () => {
    const short = resource({
      id: 'short',
      provenance: {
        changes: [
          {
            time: 0,
            action: 'create',
            source: 'gp',
            version: 1,
            actor: { kind: 'system', name: 'sim' },
          },
          {
            time: 60_000,
            action: 'review',
            source: 'gp',
            version: 2,
            actor: { kind: 'system', name: 'sim' },
          },
        ],
      },
    })
    const ranked = buildStepChains([short, resource()])
    expect(ranked.map((row) => row.resourceId)).toEqual(['doc-1', 'short'])
  })
})

describe('gapWidths', () => {
  it('gives the longer wait a larger but not total share', () => {
    const [short, long] = gapWidths([60_000, 86_400_000])
    expect(long).toBeGreaterThan(short!)
    expect(short).toBeGreaterThan(0.15)
    expect((short ?? 0) + (long ?? 0)).toBeCloseTo(1)
  })
})

describe('formatStepDuration', () => {
  it('uses seconds below a minute and hours above', () => {
    expect(formatStepDuration(1500)).toBe('2s')
    expect(formatStepDuration(4 * 3_600_000)).toBe('4h 0m')
  })
})

describe('longestGap', () => {
  it('returns the single largest observed wait', () => {
    const found = longestGap(buildStepChains([resource()]))
    expect(found?.gap.elapsedMs).toBe(4 * 3_600_000)
    expect(found?.chain.resourceId).toBe('doc-1')
  })
})
