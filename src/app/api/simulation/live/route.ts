import { NextResponse } from 'next/server'
import { getContainer } from '@/services/container'
import {
  findPatient,
  readCatalogue,
  readClock,
  readPatientAcrossSites,
  readTeam,
} from '@/anima/readers'
import { runDetectors } from '@/ctl/detect'
import { ageFrom } from '@/ctl/normalise/resources'
import { SITES, type Finding, type SimResource } from '@/ctl/contracts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Everything the cockpit and the neighbourhood render, assembled from the
 * simulator.
 *
 * This route previously carried a `PATIENT_NAMES` map, a hardcoded three-row
 * task ledger, invented site names and a fallback CRP of 5.6 mg/L. Every one of
 * those is gone: if the simulator does not supply a field, the response says so
 * rather than substituting something plausible.
 */

interface LabAnalyte {
  name: string
  value: number
  unit: string
  referenceLow?: number
  referenceHigh?: number
}

function analytesOf(resource: SimResource): LabAnalyte[] {
  const data = resource.data as { analytes?: unknown }
  if (!Array.isArray(data.analytes)) return []
  return data.analytes.flatMap((raw) => {
    if (typeof raw !== 'object' || raw === null) return []
    const a = raw as Record<string, unknown>
    if (typeof a.name !== 'string' || typeof a.value !== 'number') return []
    return [
      {
        name: a.name,
        value: a.value,
        unit: typeof a.unit === 'string' ? a.unit : '',
        ...(typeof a.referenceLow === 'number' ? { referenceLow: a.referenceLow } : {}),
        ...(typeof a.referenceHigh === 'number' ? { referenceHigh: a.referenceHigh } : {}),
      },
    ]
  })
}

function collectedAt(resource: SimResource): number {
  const data = resource.data as { collectedAt?: unknown }
  if (typeof data.collectedAt === 'number') return data.collectedAt
  return resource.createdAt ?? resource.provenance.created?.time ?? 0
}

/** Outside the source's own reference range. Arithmetic, not interpretation. */
function outOfRange(a: LabAnalyte): boolean {
  if (a.referenceLow !== undefined && a.value < a.referenceLow) return true
  if (a.referenceHigh !== undefined && a.value > a.referenceHigh) return true
  return false
}

/**
 * The most recent result for this patient, preferring an analyte the source's
 * own range flags. Returns null when the simulator holds no result, so the UI
 * can say so instead of showing a number nobody measured.
 */
function latestLab(resources: SimResource[]): {
  name: string
  value: number
  unit: string
  refLow?: number
  refHigh?: number
  isAbnormal: boolean
  panel?: string
  laboratory?: string
  collectedAt: number
} | null {
  const reports = resources
    .filter((r) => r.kind === 'report' && (r.data as { kind?: unknown }).kind === 'blood-result')
    .sort((a, b) => collectedAt(b) - collectedAt(a))

  for (const report of reports) {
    const analytes = analytesOf(report)
    if (analytes.length === 0) continue
    const chosen = analytes.find(outOfRange) ?? analytes[0]!
    const data = report.data as { panel?: { name?: unknown }; laboratory?: unknown }
    return {
      name: chosen.name,
      value: chosen.value,
      unit: chosen.unit,
      ...(chosen.referenceLow !== undefined ? { refLow: chosen.referenceLow } : {}),
      ...(chosen.referenceHigh !== undefined ? { refHigh: chosen.referenceHigh } : {}),
      isAbnormal: outOfRange(chosen),
      ...(typeof data.panel?.name === 'string' ? { panel: data.panel.name } : {}),
      ...(typeof data.laboratory === 'string' ? { laboratory: data.laboratory } : {}),
      collectedAt: collectedAt(report),
    }
  }
  return null
}

/** Serial values for one analyte, oldest first, so a trend can be drawn. */
function analyteTrend(
  resources: SimResource[],
  analyteName: string,
): Array<{ collectedAt: number; value: number; unit: string; refLow?: number; refHigh?: number }> {
  return resources
    .filter((r) => r.kind === 'report')
    .flatMap((r) =>
      analytesOf(r)
        .filter((a) => a.name === analyteName)
        .map((a) => ({
          collectedAt: collectedAt(r),
          value: a.value,
          unit: a.unit,
          ...(a.referenceLow !== undefined ? { refLow: a.referenceLow } : {}),
          ...(a.referenceHigh !== undefined ? { refHigh: a.referenceHigh } : {}),
        })),
    )
    .sort((a, b) => a.collectedAt - b.collectedAt)
}

/** A detector finding, in the shape the task ledger already renders. */
function toLedgerItem(finding: Finding, patientId: string): Record<string, unknown> {
  const citation = finding.citations[0]
  return {
    task_id: finding.id,
    episode_id: citation ? `${citation.site}:${citation.resourceId}` : finding.id,
    timestamp: new Date(finding.createdAt ?? finding.dueAt ?? Date.now()).toISOString(),
    title: finding.summary,
    status: finding.status,
    owner: finding.owner ?? 'not-supplied-by-source',
    note: citation
      ? `Read from ${citation.site} record ${citation.resourceId} version ${citation.version}.`
      : 'No source citation available.',
    deadline: finding.dueAt ? new Date(finding.dueAt).toISOString() : '',
    clinical_priority: finding.priority ?? 'not-supplied-by-source',
    snomed_id: 'not-supplied-by-source',
    performed_by: 'not-supplied-by-source',
    requested_id: finding.owner ?? 'not-supplied-by-source',
    patient_id: finding.patientId ?? patientId,
    detector: finding.detector,
    breach: finding.breach,
    overdueMs: finding.overdueMs ?? null,
    site: finding.site,
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId') ?? 'SIM-000001'

    const container = getContainer()
    // The clock anchors every deadline calculation, so read it first; the rest
    // fans out in parallel because each site read is independently useful.
    const { clock, events } = await readClock()
    const [team, patient, catalogue, patientSites] = await Promise.all([
      readTeam(),
      findPatient(patientId),
      readCatalogue(clock.now),
      readPatientAcrossSites(patientId),
    ])
    const { slices, failedSites } = patientSites
    const patientResources = slices.flatMap((s) => s.resources)

    // Findings for this patient come from their own records; the neighbourhood
    // counters need the wider scan.
    const patientFindings = runDetectors(patientResources, clock.now)

    const lab = latestLab(patientResources)
    const trend = lab ? analyteTrend(patientResources, lab.name) : []

    const ehr = patientResources.find((r) => r.kind === 'ehr-record')
    const problems =
      (ehr?.data as { problems?: Array<{ term: string; code: string; status: string; date: string }> })
        ?.problems ?? []

    // Real correspondence, with the free text the source actually wrote. The
    // cockpit previously showed an invented "Discharged following IV antibiotic
    // course" card quoting a letter that does not exist.
    const documents = patientResources
      .filter((r) => r.kind === 'discharge-summary' || r.kind === 'document')
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, 6)
      .map((r) => {
        const data = r.data as {
          sections?: Record<string, unknown>
          sentBy?: unknown
          sentAt?: unknown
          stage?: unknown
        }
        const sections = Object.entries(data.sections ?? {})
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .map(([key, text]) => ({ key, text }))
        return {
          id: r.id,
          site: r.site,
          title: r.title,
          version: r.version,
          status: r.status,
          stage: typeof data.stage === 'string' ? data.stage : null,
          sentBy: typeof data.sentBy === 'string' ? data.sentBy : null,
          sentAt: typeof data.sentAt === 'number' ? data.sentAt : (r.createdAt ?? null),
          sections,
          reviewed: r.provenance.changes.some((c) => /review|file/i.test(c.action)),
        }
      })

    const observations = patientResources
      .filter((r) => r.kind === 'observation')
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, 6)
      .map((r) => ({
        time: r.createdAt ?? clock.now,
        type: r.kind,
        detail: r.title || 'Observation recorded',
      }))

    // The agent's proposal is deliberately NOT assembled here. Opening a case
    // runs the ADK sequence through a language model and costs about seven and
    // a half seconds, which held the whole first paint hostage. The page loads
    // this payload, then fetches /api/simulation/case for the proposal.

    // Districts describe where THIS patient's work sits. A population-wide scan
    // cost 20 of the route's 24 seconds and answered a question the product no
    // longer asks, so it is gone.
    const byId = new Map(catalogue.data.map((site) => [site.id, site]))
    const districts = Object.fromEntries(
      SITES.map((site) => {
        const described = byId.get(site)
        const open = patientFindings.filter((f) => f.site === site)
        const resources = patientResources.filter((r) => r.site === site)
        return [
          site,
          {
            id: site,
            name: described?.name ?? site,
            subtitle: described?.subtitle ?? '',
            color: described?.color ?? '',
            /** False when the catalogue does not describe this scope. */
            namedByCatalogue: described !== undefined,
            activeCount: open.length,
            overdueCount: open.filter((f) => f.breach === 'breached').length,
            resourceCount: resources.length,
            recentEvent:
              events.find((e) => e.visibleTo.includes(site))?.detail ??
              'No recent activity recorded',
          },
        ]
      }),
    )

    return NextResponse.json({
      world: team.world,
      team: team.team,
      scopes: team.scopes,
      live: container.live,
      clock,
      dataQuality: {
        failedSites,
        patientResourcesScanned: patientResources.length,
        sitesRead: slices.map((s) => s.site),
        catalogueStale: catalogue.stale,
        labPresent: lab !== null,
      },
      patient: {
        id: patientId,
        name: patient?.name ?? 'not-supplied-by-source',
        age: ageFrom(patient?.birthDate, clock.now) ?? null,
        birthDate: patient?.birthDate ?? null,
        conditions: patient?.conditions ?? [],
        goals: patient?.goals ?? [],
        needs: patient?.needs ?? [],
        localIds: patient?.localIds ?? {},
        synthetic: patient?.synthetic ?? true,
        problems,
        recentLab: lab,
        labTrend: trend,
        documents,
        observations,
      },
      tasks: patientFindings.map((f) => toLedgerItem(f, patientId)),
      counts: {
        total: patientFindings.length,
        overdue: patientFindings.filter((f) => f.breach === 'breached').length,
        awaitingResult: patientFindings.filter((f) => f.detector === 'awaiting-result').length,
        unreviewedHandovers: patientFindings.filter((f) => f.detector === 'unprocessed-handover')
          .length,
      },
      districts,
      recentEvents: events.slice(0, 30),
    })
  } catch (error) {
    console.error('Failed to assemble live simulation state:', error)
    return NextResponse.json(
      {
        error: 'failed_to_fetch_live_state',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
