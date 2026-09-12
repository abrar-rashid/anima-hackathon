import stageLatencies from '../../../medlatency-service/docs/seed-results/stage-latencies.json'
import type { Citation } from '@/ctl/contracts'
import {
  actorTone,
  labelInvestigation,
  labelStage,
  workflowFromSteps,
  type BloodWorkflow,
} from './blood-workflow'
import type { WardlineTask } from './types'

/** Wardline task with a string detector so this file is not blocked on types.ts. */
export type SeedWardlineTask = Omit<WardlineTask, 'detector'> & { detector: string }

interface StageLatencyRow {
  investigation: string
  stage: string
  resource_id: string
  clinical_event_at: string
  evidence_kind: string
}

const PATIENT_ID = 'SIM-000006'
const BLOOD_REQUEST_ID = 'r-7158'
const CT_REQUEST_ID = 'r-7182'
const FOLLOW_UP_DUE_AT = Date.parse('2026-09-18T16:00:00Z')
/** Documented simulator as-of from the seed handoff. */
const SEED_AS_OF = Date.parse('2026-09-14T15:20:00Z')
const DUE_SOON_MS = 60 * 60 * 1000
const LABORATORY = 'Authored seed report — not live laboratory/PACS clocks'

function asRows(value: unknown): StageLatencyRow[] {
  if (!Array.isArray(value)) return []
  const rows: StageLatencyRow[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const row = raw as Record<string, unknown>
    if (
      typeof row.investigation !== 'string' ||
      typeof row.stage !== 'string' ||
      typeof row.resource_id !== 'string' ||
      typeof row.clinical_event_at !== 'string'
    ) {
      continue
    }
    rows.push({
      investigation: row.investigation,
      stage: row.stage,
      resource_id: row.resource_id,
      clinical_event_at: row.clinical_event_at,
      evidence_kind: typeof row.evidence_kind === 'string' ? row.evidence_kind : '',
    })
  }
  return rows
}

function requestedResourceId(rows: StageLatencyRow[], investigation: string): string | null {
  if (investigation === 'blood') return BLOOD_REQUEST_ID
  if (investigation === 'ct') return CT_REQUEST_ID
  const requested = rows.find((row) => row.stage === 'requested')
  return requested?.resource_id ?? rows[0]?.resource_id ?? null
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function breachOf(dueAt: number, now: number): SeedWardlineTask['breach'] {
  if (dueAt < now) return 'breached'
  if (dueAt - now <= DUE_SOON_MS) return 'due-soon'
  return 'on-time'
}

function workflowFromRows(investigation: string, rows: StageLatencyRow[]): BloodWorkflow | null {
  const resourceId = requestedResourceId(rows, investigation)
  if (!resourceId) return null
  const panelName = labelInvestigation(investigation)
  const steps = rows
    .map((row) => {
      const time = Date.parse(row.clinical_event_at)
      if (!Number.isFinite(time)) return null
      return {
        id: `${row.resource_id}:${row.stage}`,
        label: labelStage(row.stage),
        field: 'clinical_event_at',
        time,
        actorName: null,
        actorKind: null,
        site: 'gp',
        tone: actorTone(null, null, 'gp'),
      }
    })
    .filter((step): step is NonNullable<typeof step> => step !== null)
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
  if (steps.length === 0) return null
  return workflowFromSteps({
    resourceId,
    patientId: PATIENT_ID,
    panelId: investigation,
    panelName,
    title: panelName,
    laboratory: LABORATORY,
    memberIds: uniqueIds(rows.map((row) => row.resource_id)),
    panels: [panelName],
    analytes: [],
    origin: 'retrospective-seed',
    steps,
  })
}

export function buildSeedReportWorkflows(): BloodWorkflow[] {
  const groups = new Map<string, StageLatencyRow[]>()
  for (const row of asRows(stageLatencies)) {
    const list = groups.get(row.investigation) ?? []
    list.push(row)
    groups.set(row.investigation, list)
  }
  const workflows: BloodWorkflow[] = []
  for (const [investigation, rows] of groups) {
    const workflow = workflowFromRows(investigation, rows)
    if (workflow) workflows.push(workflow)
  }
  return workflows.sort((a, b) => {
    const aTime = a.steps[a.steps.length - 1]?.time ?? 0
    const bTime = b.steps[b.steps.length - 1]?.time ?? 0
    return bTime - aTime || a.resourceId.localeCompare(b.resourceId)
  })
}

export function seedFollowUpTask(): SeedWardlineTask {
  const dueAt = FOLLOW_UP_DUE_AT
  const breach = breachOf(dueAt, SEED_AS_OF)
  const citation: Citation = {
    resourceId: 'r-7206',
    version: 1,
    site: 'gp',
    field: 'data.text',
    quote:
      'Authored open follow-up: book a GP symptom and weight review after CT. The appointment has not been booked or attended.',
  }
  return {
    id: 'r-7204',
    title: 'Book GP symptom and weight review after CT',
    patientId: PATIENT_ID,
    patientName: 'Eleanor Chen',
    site: 'gp',
    status: 'open',
    owner: 'GP team',
    priority: null,
    dueAt,
    createdAt: null,
    breach,
    overdueMs: breach === 'breached' ? SEED_AS_OF - dueAt : null,
    detector: 'medlatency-seed',
    citations: [citation],
  }
}
