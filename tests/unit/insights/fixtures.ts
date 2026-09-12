import type { LatencyBucket, Rate, ScanWindow, SiteDescriptor, Sourced } from '@/ctl/contracts'
import type { InsightsPayload } from '@/components/insights/types'

export const NOW = 1789286400000

export const SITES_FIXTURE: SiteDescriptor[] = [
  { id: 'gp', name: 'GP Records', subtitle: 'Riverside Practice · primary care', kind: 'clinical' },
  { id: 'hospital', name: 'Hospital EPR', subtitle: 'Northbank General · secondary care', kind: 'clinical' },
]

export function makeWindow(overrides: Partial<ScanWindow> = {}): ScanWindow {
  return {
    scanned: 512,
    total: 375868,
    sites: ['gp', 'hospital'],
    now: NOW,
    failedSites: [],
    ...overrides,
  }
}

export const STEP_ACCEPT_TO_COMPLETE: LatencyBucket = {
  label: 'gp: accept → complete',
  n: 14,
  medianMs: 2 * 60 * 60 * 1000,
  p90Ms: 5 * 60 * 60 * 1000,
  maxMs: 9 * 60 * 60 * 1000,
}

export const STEP_SENT_TO_REVIEW: LatencyBucket = {
  label: 'hospital: sent → review',
  n: 6,
  medianMs: 30 * 60 * 60 * 1000,
  p90Ms: 48 * 60 * 60 * 1000,
  maxMs: 72 * 60 * 60 * 1000,
}

export const BREAKAGE_HANDOVERS: Rate = {
  label: 'handovers never reviewed',
  numerator: 3,
  denominator: 40,
}

export function makeInsights(overrides: Partial<InsightsPayload> = {}): Sourced<InsightsPayload> {
  return {
    data: {
      report: {
        steps: [STEP_ACCEPT_TO_COMPLETE, STEP_SENT_TO_REVIEW],
        breakage: [BREAKAGE_HANDOVERS],
        window: makeWindow(),
      },
      sites: SITES_FIXTURE,
      ...overrides,
    },
    fetchedAt: NOW,
    stale: false,
  }
}
