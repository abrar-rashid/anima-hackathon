import 'server-only'

import {
  findPatient,
  readCatalogue,
  readClock,
  readTeam,
  readSiteView,
  scanSitesForWork,
  type SiteViewSlice,
} from '@/anima/readers'
import { loadMedlatencyBundle } from '@/medlatency/client'
import type { Finding, SimResource, Site, SiteDescriptor } from '@/ctl/contracts'
import { runDetectors } from '@/ctl/detect'
import { getContainer } from '@/services/container'
import { FEATURED_PATIENT_IDS, rankPatients } from './rank-patients'
import { buildBloodWorkflows, buildRetrospectiveWorkflows, selectBloodWorkflows } from './blood-workflow'
import { mapMedlatencyPresentation } from './map-medlatency'
import { buildSeedReportWorkflows } from './seed-report'
import { buildStepChains } from './step-intervals'
import type {
  WardlineMedlatency,
  WardlinePayload,
  WardlineSourceCard,
  WardlineStats,
  WardlineTask,
} from './types'

const CLOSED = new Set(['complete', 'completed', 'closed', 'done', 'cancelled'])
const MEDLATENCY_PATIENT_IDS = ['SIM-000006', 'DEMO-005'] as const
const ELEANOR_ID = 'SIM-000006'

function isClosed(status: string): boolean {
  return CLOSED.has(status.toLowerCase())
}

function isEmergency(priority: string | null | undefined): boolean {
  return (priority ?? '').toLowerCase() === 'emergency'
}

function isUrgent(priority: string | null | undefined): boolean {
  const value = (priority ?? '').toLowerCase()
  return value === 'urgent' || value === 'emergency'
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

function toTask(finding: Finding, names: Record<string, string>): WardlineTask {
  return {
    id: finding.id,
    title: finding.summary,
    patientId: finding.patientId ?? null,
    patientName: finding.patientId ? (names[finding.patientId] ?? null) : null,
    site: finding.site,
    status: finding.status,
    owner: finding.owner ?? null,
    priority: finding.priority ?? null,
    dueAt: finding.dueAt ?? null,
    createdAt: finding.createdAt ?? null,
    breach: finding.breach,
    overdueMs: finding.overdueMs ?? null,
    detector: finding.detector,
    citations: finding.citations,
  }
}

function statsOf(tasks: WardlineTask[]): WardlineStats {
  const active = tasks.filter((task) => !isClosed(task.status)).length
  const emergency = tasks.filter((task) => isEmergency(task.priority)).length
  const completed = tasks.filter((task) => isClosed(task.status)).length
  const evidenced = tasks.filter((task) => task.citations.length > 0).length
  return { active, emergency, completed, evidenced, total: tasks.length }
}

function projectionsFrom(findings: Finding[], siteId: string): string[] {
  const kinds = new Set<string>()
  for (const finding of findings) {
    if (finding.site !== siteId) continue
    kinds.add(finding.detector.replace(/-/g, ' '))
    for (const citation of finding.citations) {
      if (citation.field) kinds.add(citation.field)
    }
  }
  return [...kinds].slice(0, 6)
}

function sourceCards(sites: SiteDescriptor[], findings: Finding[]): WardlineSourceCard[] {
  const byId = new Map(sites.map((site) => [site.id, site]))
  const seen = new Set<string>()
  const ids: string[] = []
  for (const site of sites) {
    if (!seen.has(site.id)) {
      seen.add(site.id)
      ids.push(site.id)
    }
  }
  for (const finding of findings) {
    if (!seen.has(finding.site)) {
      seen.add(finding.site)
      ids.push(finding.site)
    }
  }

  const preferred: Site[] = ['hospital', 'gp']
  const ordered = [
    ...preferred.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !preferred.includes(id as Site)),
  ]

  return ordered.map((id) => {
    const described = byId.get(id)
    const siteFindings = findings.filter((finding) => finding.site === id)
    return {
      id,
      name: described?.name ?? id,
      subtitle: described?.subtitle ?? null,
      kind: described?.kind ?? null,
      linkedTasks: siteFindings.length,
      urgentTasks: siteFindings.filter((finding) => isUrgent(finding.priority)).length,
      evidencedTasks: siteFindings.filter((finding) => finding.citations.length > 0).length,
      projections: projectionsFrom(findings, id),
    }
  })
}

function pinRank(patientId: string | null): number {
  if (patientId === ELEANOR_ID) return 0
  if (patientId === 'SIM-000001') return 1
  return 2
}

function priorityRank(priority: string | null): number {
  const value = (priority ?? '').toLowerCase()
  if (value === 'emergency') return 0
  if (value === 'urgent') return 1
  if (value === 'standard' || value === 'routine') return 2
  return 3
}

function sortTasks(tasks: WardlineTask[]): WardlineTask[] {
  return [...tasks].sort((a, b) => {
    const pinDiff = pinRank(a.patientId) - pinRank(b.patientId)
    if (pinDiff !== 0) return pinDiff
    const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority)
    if (priorityDiff !== 0) return priorityDiff
    return (b.createdAt ?? 0) - (a.createdAt ?? 0)
  })
}

function packetPatientId(packet: unknown): string | null {
  if (!packet || typeof packet !== 'object') return null
  const overview = 'overview' in packet ? packet.overview : null
  if (!overview || typeof overview !== 'object') return null
  const patient = 'patient' in overview ? overview.patient : null
  if (!patient || typeof patient !== 'object') return null
  const id = 'id' in patient ? patient.id : null
  return typeof id === 'string' && id.length > 0 ? id : null
}

function mapPackets(packets: readonly unknown[]) {
  const rows: Array<{ packet: unknown; mapped: ReturnType<typeof mapMedlatencyPresentation> }> = []
  for (const packet of packets) {
    try {
      rows.push({ packet, mapped: mapMedlatencyPresentation(packet) })
    } catch {
      // A broken packet must not fail Anima assembly.
    }
  }
  return rows
}

function medlatencyNote(
  reachable: boolean,
  packets: readonly unknown[],
  mappedRows: ReturnType<typeof mapPackets>,
): string {
  const note = reachable
    ? 'Local MedLatency service. Fixture replays are authored, not live model output.'
    : 'MedLatency local service is not reachable. Showing Anima reads and the authored seed report.'
  const simPacket = packets.some((packet) => packetPatientId(packet) === ELEANOR_ID)
  if (!simPacket) return note
  const simMapped = mappedRows.find((row) => packetPatientId(row.packet) === ELEANOR_ID)
  if (simMapped?.mapped.validated === true) return note
  return `${note} SIM-000006 is evidence-only; no validated analysis is included.`
}

async function resolvePatients(ids: readonly (string | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const results = await Promise.allSettled(unique.map((id) => findPatient(id)))
  return results.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : [],
  )
}

export async function assembleWardline(): Promise<WardlinePayload> {
  const container = getContainer()
  const [{ clock }, team, scan, catalogue, authoredBlood, medBundle] = await Promise.all([
    readClock(),
    readTeam().catch(() => ({ team: 'unknown', world: 'unknown', scopes: [] })),
    scanSitesForWork(),
    readCatalogue(0).catch(
      (): { data: SiteDescriptor[]; fetchedAt: number; stale: boolean; error?: string } => ({
        data: [],
        fetchedAt: Date.now(),
        stale: false,
      }),
    ),
    Promise.all(
      (['gp', 'diagnostics'] as const).map((site) =>
        readSiteView(site, { patient: ELEANOR_ID, limit: 200 }).catch(() => null),
      ),
    ),
    loadMedlatencyBundle(MEDLATENCY_PATIENT_IDS).catch(() => ({ reachable: false, packets: [] })),
  ])

  const resources = flattenResources([
    ...scan.slices,
    ...authoredBlood.filter((slice): slice is SiteViewSlice => slice !== null),
  ])
  const findings = runDetectors(resources, clock.now)
  const directory = await resolvePatients([
    ...FEATURED_PATIENT_IDS,
    ...findings.map((finding) => finding.patientId),
  ])
  const names: Record<string, string> = {}
  for (const patient of directory) names[patient.id] = patient.name

  const patients = rankPatients(directory, findings)
  const animaTasks = findings.map((finding) => toTask(finding, names))

  const retrospective = buildRetrospectiveWorkflows(resources)
  const seeded = retrospective.some((workflow) => workflow.patientId === ELEANOR_ID)
    ? []
    : buildSeedReportWorkflows()

  const mappedRows = mapPackets(medBundle.packets)
  const validatedMapped = mappedRows.filter((row) => row.mapped.validated === true)
  const validatedMedWorkflows = validatedMapped.flatMap((row) => row.mapped.workflows)
  const analysisModes = [
    ...new Set(
      mappedRows
        .map((row) => row.mapped.analysisMode)
        .filter((mode): mode is string => typeof mode === 'string' && mode.length > 0),
    ),
  ]

  const seenTaskIds = new Set(animaTasks.map((task) => task.id))
  const mergedMedTasks: WardlineTask[] = []
  for (const row of validatedMapped) {
    for (const task of row.mapped.tasks) {
      if (seenTaskIds.has(task.id)) continue
      seenTaskIds.add(task.id)
      mergedMedTasks.push(task)
    }
  }

  const tasks = sortTasks([...animaTasks, ...mergedMedTasks])

  const sources = sourceCards(catalogue.data, findings)
  if (medBundle.reachable) {
    sources.push({
      id: 'medlatency',
      name: 'MedLatency',
      subtitle: 'Local evidence service (loopback)',
      kind: 'analysis',
      linkedTasks: mergedMedTasks.length,
      urgentTasks: mergedMedTasks.filter((task) => isUrgent(task.priority)).length,
      evidencedTasks: mergedMedTasks.filter((task) => task.citations.length > 0).length,
      projections: analysisModes.slice(0, 6),
    })
  }

  const medlatency: WardlineMedlatency = {
    reachable: medBundle.reachable,
    analysisModes,
    validatedPatients: validatedMapped.length,
    note: medlatencyNote(medBundle.reachable, medBundle.packets, mappedRows),
  }

  return {
    world: team.world,
    live: container.live,
    fetchedAt: Date.now(),
    stale: catalogue.stale,
    ...('error' in catalogue && catalogue.error ? { error: catalogue.error } : {}),
    clock,
    stats: statsOf(tasks),
    tasks,
    patients,
    profilesShown: patients.length,
    directoryTotal: scan.total,
    sources,
    sites: catalogue.data,
    scan: {
      scanned: scan.scanned,
      total: scan.total,
      sites: scan.slices.map((slice) => slice.site),
      failedSites: scan.failedSites,
    },
    chains: buildStepChains(resources),
    bloodWorkflows: [
      ...selectBloodWorkflows(buildBloodWorkflows(resources)),
      ...retrospective,
      ...seeded,
      ...validatedMedWorkflows,
    ],
    medlatency,
  }
}
