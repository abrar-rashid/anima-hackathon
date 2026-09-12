declare module '@/ctl/detect' {
  import type { Finding, Rate, ScanWindow, SimResource } from '@/ctl/contracts'
  export function runDetectors(resources: SimResource[], now: number): Finding[]
  export function summariseFindings(findings: Finding[], window: ScanWindow): Rate[]
}

declare module '@/ctl/latency' {
  import type { LatencyReport, ScanWindow, SimResource } from '@/ctl/contracts'
  export function computeLatency(
    resources: SimResource[],
    now: number,
    window: ScanWindow,
  ): LatencyReport
}
