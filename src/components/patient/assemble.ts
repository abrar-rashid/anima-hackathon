import 'server-only'

import type { ScanWindow, SimResource } from '@/ctl/contracts'
import { rankFindings, runDetectors } from '@/ctl/detect'
import { extractTasksDetailed } from '@/ctl/extract'
import { findPatient, readCatalogue, readClock, readPatientAcrossSites } from '@/anima/readers'
import { proposeTopProposal } from './effect-bridge'
import { buildTimeline } from './timeline'
import type { PatientLoopPayload } from './types'

const FREE_TEXT_KINDS = new Set(['discharge-summary', 'document'])

/**
 * Reads and merges everything the patient loop page needs, from real reads
 * only. Every field on `PatientLoopPayload` traces to something one of these
 * calls returned; nothing here computes a fact the source did not supply.
 */
export async function assemblePatientLoop(patientId: string): Promise<PatientLoopPayload> {
  const [clockResult, patientResult, acrossSitesResult] = await Promise.allSettled([
    readClock(),
    findPatient(patientId),
    readPatientAcrossSites(patientId),
  ])

  const now = clockResult.status === 'fulfilled' ? clockResult.value.clock.now : Date.now()

  const patient = patientResult.status === 'fulfilled' ? patientResult.value : null
  const patientLookupError =
    patientResult.status === 'rejected'
      ? patientResult.reason instanceof Error
        ? patientResult.reason.message
        : String(patientResult.reason)
      : undefined

  const slices = acrossSitesResult.status === 'fulfilled' ? acrossSitesResult.value.slices : []
  const failedSites = acrossSitesResult.status === 'fulfilled' ? acrossSitesResult.value.failedSites : []

  const resources = dedupeResources(slices.flatMap((slice) => slice.resources))

  const window: ScanWindow = {
    scanned: resources.length,
    total: slices.reduce((sum, slice) => sum + slice.total, 0),
    sites: slices.map((slice) => slice.site),
    now,
    failedSites,
  }

  const findings = rankFindings(runDetectors(resources, now))
  const tasks = resources.filter((r) => r.kind === 'task')
  const documents = resources.filter((r) => FREE_TEXT_KINDS.has(r.kind))

  const [extractionResult, proposalResult, catalogueResult] = await Promise.allSettled([
    extractTasksDetailed(documents),
    proposeTopProposal(findings, resources, now),
    readCatalogue(now),
  ])

  const extraction =
    extractionResult.status === 'fulfilled'
      ? {
          tasks: extractionResult.value.tasks,
          reason: extractionResult.value.reason,
          spansRead: extractionResult.value.spansRead,
          resourcesRead: extractionResult.value.resourcesRead,
        }
      : {
          tasks: [],
          reason: extractionResult.reason instanceof Error
            ? extractionResult.reason.message
            : String(extractionResult.reason),
          spansRead: 0,
          resourcesRead: 0,
        }

  const proposal =
    proposalResult.status === 'fulfilled'
      ? proposalResult.value
      : { proposal: null, finding: null, reason: 'Could not evaluate a proposal for this patient.' }

  const sites = catalogueResult.status === 'fulfilled' ? catalogueResult.value.data : []

  return {
    patientId,
    now,
    patient,
    patientLookupError,
    window,
    resources,
    timeline: buildTimeline(resources),
    tasks,
    findings,
    extraction,
    documents,
    proposal,
    sites,
  }
}

function dedupeResources(resources: SimResource[]): SimResource[] {
  const byKey = new Map<string, SimResource>()
  for (const resource of resources) {
    const key = `${resource.site}:${resource.id}`
    const seen = byKey.get(key)
    if (!seen || resource.version > seen.version) byKey.set(key, resource)
  }
  return [...byKey.values()]
}
