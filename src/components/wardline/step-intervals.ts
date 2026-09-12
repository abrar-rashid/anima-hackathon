import type { ProvenanceEntry, SimResource, Site } from '@/ctl/contracts'
import { readableAction } from '@/ctl/latency/compute'

export interface WardlineStepNode {
  action: string
  label: string
  time: number
  actor: string
}

export interface WardlineStepGap {
  fromAction: string
  toAction: string
  fromLabel: string
  toLabel: string
  elapsedMs: number
}

export interface WardlineStepChain {
  resourceId: string
  title: string
  kind: string
  site: Site
  patientId: string | null
  nodes: WardlineStepNode[]
  gaps: WardlineStepGap[]
  totalElapsedMs: number
}

function eventsOf(resource: SimResource): ProvenanceEntry[] {
  const { created, changes } = resource.provenance
  return created ? [created, ...changes] : [...changes]
}

/**
 * One visual track per resource that has at least two provenance actions.
 * Gaps are measured timestamps, never estimated.
 */
export function buildStepChains(resources: readonly SimResource[]): WardlineStepChain[] {
  const chains: WardlineStepChain[] = []

  for (const resource of resources) {
    const events = eventsOf(resource)
    if (events.length < 2) continue

    const nodes: WardlineStepNode[] = events.map((event) => ({
      action: event.action,
      label: readableAction(event.action),
      time: event.time,
      actor: event.actor.name,
    }))

    const gaps: WardlineStepGap[] = []
    for (let i = 1; i < nodes.length; i += 1) {
      const from = nodes[i - 1]!
      const to = nodes[i]!
      const elapsedMs = to.time - from.time
      if (elapsedMs < 0) continue
      gaps.push({
        fromAction: from.action,
        toAction: to.action,
        fromLabel: from.label,
        toLabel: to.label,
        elapsedMs,
      })
    }
    if (gaps.length === 0) continue

    chains.push({
      resourceId: resource.id,
      title: resource.title,
      kind: resource.kind,
      site: resource.site,
      patientId: resource.patientId ?? null,
      nodes,
      gaps,
      totalElapsedMs: gaps.reduce((sum, gap) => sum + gap.elapsedMs, 0),
    })
  }

  return chains.sort((a, b) => b.totalElapsedMs - a.totalElapsedMs || a.resourceId.localeCompare(b.resourceId))
}

/** Log-scaled shares so a multi-day wait does not erase a twenty-minute one. */
export function gapWidths(elapsedMs: readonly number[]): number[] {
  if (elapsedMs.length === 0) return []
  const weights = elapsedMs.map((ms) => Math.log10(Math.max(ms, 1) + 1))
  const sum = weights.reduce((total, weight) => total + weight, 0)
  if (sum === 0) return elapsedMs.map(() => 1 / elapsedMs.length)
  return weights.map((weight) => weight / sum)
}

export function formatStepDuration(ms: number): string {
  const abs = Math.abs(Math.trunc(ms))
  if (abs < 1000) return `${abs} ms`
  if (abs < 60_000) return `${Math.round(abs / 1000)}s`
  const minutes = Math.floor(abs / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

export function longestGap(chains: readonly WardlineStepChain[]): {
  chain: WardlineStepChain
  gap: WardlineStepGap
} | null {
  let best: { chain: WardlineStepChain; gap: WardlineStepGap } | null = null
  for (const chain of chains) {
    for (const gap of chain.gaps) {
      if (!best || gap.elapsedMs > best.gap.elapsedMs) best = { chain, gap }
    }
  }
  return best
}

export function chainsForResource(
  chains: readonly WardlineStepChain[],
  resourceId: string | undefined,
): WardlineStepChain | null {
  if (!resourceId) return null
  return chains.find((chain) => chain.resourceId === resourceId) ?? null
}

export function chainsForPatient(
  chains: readonly WardlineStepChain[],
  patientId: string,
): WardlineStepChain[] {
  return chains.filter((chain) => chain.patientId === patientId)
}
