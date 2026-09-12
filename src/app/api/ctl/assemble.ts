import 'server-only'

import { findPatient, readCatalogue, readClock, scanSitesForWork, type SiteViewSlice } from '@/anima/readers'
import {
  SITES,
  type Finding,
  type LatencyReport,
  type Rate,
  type ScanWindow,
  type SimPatient,
  type SimResource,
  type Site,
  type SiteDescriptor,
  type Sourced,
} from '@/ctl/contracts'
import type { InsightsPayload } from '@/components/insights/types'
import type { WorklistPayload } from '@/components/worklist/types'

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function emptyWindow(now: number, failedSites: readonly Site[] = SITES): ScanWindow {
  return {
    scanned: 0,
    total: 0,
    sites: [],
    now,
    failedSites: [...failedSites],
  }
}

function uniqueSites(slices: SiteViewSlice[]): Site[] {
  return [...new Set(slices.map((slice) => slice.site))]
}

function flattenResources(slices: SiteViewSlice[]): SimResource[] {
  const seen = new Set<string>()
  const out: SimResource[] = []
  for (const slice of slices) {
    for (const resource of slice.resources) {
      const key = `${resource.site}:${resource.id}:${resource.version}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(resource)
    }
  }
  return out
}

async function resolvePatients(ids: Array<string | undefined>): Promise<Record<string, SimPatient>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const out: Record<string, SimPatient> = {}
  const results = await Promise.allSettled(unique.map((id) => findPatient(id)))
  results.forEach((result, index) => {
    const id = unique[index]
    if (!id) return
    if (result.status === 'fulfilled' && result.value) out[id] = result.value
  })
  return out
}

async function readSites(now: number): Promise<{ sites: SiteDescriptor[]; stale: boolean; error?: string }> {
  try {
    const sourced = await readCatalogue(now)
    return { sites: sourced.data, stale: sourced.stale, error: sourced.error }
  } catch (error) {
    return { sites: [], stale: false, error: messageFrom(error) }
  }
}

let lastWorklist: Sourced<WorklistPayload> | null = null
let lastInsights: Sourced<InsightsPayload> | null = null

function staleFallback<T>(
  previous: Sourced<T> | null,
  error: string,
  empty: T,
): Sourced<T> {
  if (previous) {
    return { data: previous.data, fetchedAt: previous.fetchedAt, stale: true, error }
  }
  return { data: empty, fetchedAt: Date.now(), stale: false, error }
}

function rememberWorklist(sourced: Sourced<WorklistPayload>): Sourced<WorklistPayload> {
  if (sourced.data.window.scanned > 0 || sourced.data.findings.length > 0) {
    lastWorklist = { data: sourced.data, fetchedAt: sourced.fetchedAt, stale: false }
  }
  return sourced
}

function rememberInsights(sourced: Sourced<InsightsPayload>): Sourced<InsightsPayload> {
  if (sourced.data.report.window.scanned > 0 || sourced.data.report.steps.length > 0) {
    lastInsights = { data: sourced.data, fetchedAt: sourced.fetchedAt, stale: false }
  }
  return sourced
}

async function scanOrThrow(now: number): Promise<{
  resources: SimResource[]
  window: ScanWindow
}> {
  const scan = await scanSitesForWork()
  const sites = uniqueSites(scan.slices)
  return {
    resources: flattenResources(scan.slices),
    window: {
      scanned: scan.scanned,
      total: scan.total,
      sites,
      now,
      failedSites: scan.failedSites,
    },
  }
}

export async function assembleWorklist(): Promise<Sourced<WorklistPayload>> {
  const empty: WorklistPayload = {
    findings: [],
    rates: [],
    window: emptyWindow(0),
    patients: {},
    sites: [],
  }

  let now: number
  try {
    const { clock } = await readClock()
    now = clock.now
  } catch (error) {
    return staleFallback(lastWorklist, messageFrom(error), empty)
  }

  try {
    const { resources, window } = await scanOrThrow(now)
    const catalogue = await readSites(now)

    let findings: Finding[] = []
    let rates: Rate[] = []
    let detectError: string | undefined
    try {
      const detect = await import('@/ctl/detect')
      findings = detect.runDetectors(resources, now)
      rates = detect.summariseFindings(findings, window)
    } catch (error) {
      detectError = messageFrom(error)
    }

    const patients = await resolvePatients(findings.map((finding) => finding.patientId))
    const sourced: Sourced<WorklistPayload> = {
      data: { findings, rates, window, patients, sites: catalogue.sites },
      fetchedAt: Date.now(),
      stale: catalogue.stale,
      error: detectError ?? catalogue.error,
    }
    return rememberWorklist(sourced)
  } catch (error) {
    return staleFallback(lastWorklist, messageFrom(error), { ...empty, window: emptyWindow(now) })
  }
}

function emptyReport(window: ScanWindow): LatencyReport {
  return { steps: [], breakage: [], window }
}

export async function assembleInsights(): Promise<Sourced<InsightsPayload>> {
  const empty: InsightsPayload = {
    report: emptyReport(emptyWindow(0)),
    sites: [],
  }

  let now: number
  try {
    const { clock } = await readClock()
    now = clock.now
  } catch (error) {
    return staleFallback(lastInsights, messageFrom(error), empty)
  }

  try {
    const { resources, window } = await scanOrThrow(now)
    const catalogue = await readSites(now)

    let report = emptyReport(window)
    let latencyError: string | undefined
    try {
      const latency = await import('@/ctl/latency')
      report = latency.computeLatency(resources, now, window)
    } catch (error) {
      latencyError = messageFrom(error)
    }

    const sourced: Sourced<InsightsPayload> = {
      data: { report, sites: catalogue.sites },
      fetchedAt: Date.now(),
      stale: catalogue.stale,
      error: latencyError ?? catalogue.error,
    }
    return rememberInsights(sourced)
  } catch (error) {
    return staleFallback(lastInsights, messageFrom(error), {
      report: emptyReport(emptyWindow(now)),
      sites: [],
    })
  }
}
