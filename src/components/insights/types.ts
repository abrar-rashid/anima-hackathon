import type { LatencyReport, SiteDescriptor, Sourced } from '@/ctl/contracts'

export interface InsightsPayload {
  report: LatencyReport
  sites: SiteDescriptor[]
}

export type InsightsSourced = Sourced<InsightsPayload>
