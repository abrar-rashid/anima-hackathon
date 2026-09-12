import type { BreachState, Citation, Site } from '@/ctl/contracts'
import {
  actorTone,
  labelStage,
  workflowFromSteps,
  type BloodWorkflow,
} from './blood-workflow'
import type { WardlineTask } from './types'

/** Avoid blocking if WardlineTask.detector is still Finding['detector']. */
export type MappedWardlineTask = Omit<WardlineTask, 'detector'> & { detector: string }

const VALIDATED_MODES = new Set(['fixture_replay', 'model'])
const DUE_SOON_MS = 60 * 60 * 1000

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function parseTime(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.length === 0) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function siteFromFamily(family: string | null): Site {
  return family === 'diagnostic' ? 'diagnostics' : 'gp'
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function breachOf(dueAt: number | null, now: number | null): BreachState {
  if (dueAt === null || now === null) return 'no-deadline'
  if (dueAt < now) return 'breached'
  if (dueAt - now <= DUE_SOON_MS) return 'due-soon'
  return 'on-time'
}

function firstEvidencedQuote(stages: unknown[]): Citation | null {
  for (const raw of stages) {
    const stage = asRecord(raw)
    if (stage.assessment !== 'evidenced') continue
    for (const item of asArray(stage.evidence)) {
      const evidence = asRecord(item)
      const resourceId = str(evidence.resource_id)
      const quote = str(evidence.quote)
      if (!resourceId || !quote) continue
      return {
        resourceId,
        version: 1,
        site: 'gp',
        ...(str(evidence.pointer) ? { field: str(evidence.pointer)! } : {}),
        quote,
      }
    }
  }
  return null
}

function timelineTimes(timeline: unknown[]): Map<string, number> {
  const times = new Map<string, { time: number; rank: number }>()
  for (const raw of timeline) {
    const row = asRecord(raw)
    const resourceId = str(row.resource_id)
    const time = parseTime(row.time)
    if (!resourceId || time === null) continue
    const hidden = row.hidden_by_default === true
    const clinical = row.pointer === '/clinical_event_at' || row.kind === 'clinical_event'
    const rank = (hidden ? 2 : 0) + (clinical ? 0 : 1)
    const existing = times.get(resourceId)
    if (!existing || rank < existing.rank) times.set(resourceId, { time, rank })
  }
  return new Map([...times].map(([id, value]) => [id, value.time]))
}

function taskStatus(task: Record<string, unknown>): string {
  const resolution = asRecord(task.resolution)
  if (resolution.fulfillment === 'fulfilled') return 'completed'
  if (task.active === false) return str(resolution.lifecycle) ?? 'closed'
  return 'open'
}

function mapTask(
  raw: unknown,
  patientId: string | null,
  patientName: string | null,
  now: number | null,
): MappedWardlineTask | null {
  const task = asRecord(raw)
  const id = str(task.id)
  const title = str(task.label)
  if (!id || !title) return null
  const site = siteFromFamily(str(task.family))
  const dueAt = parseTime(task.deadline)
  const breach = breachOf(dueAt, now)
  const citation = firstEvidencedQuote(asArray(task.stages))
  const citations: Citation[] = citation ? [{ ...citation, site }] : []
  return {
    id,
    title,
    patientId,
    patientName,
    site,
    status: taskStatus(task),
    owner: str(task.responsible),
    priority: null,
    dueAt,
    createdAt: null,
    breach,
    overdueMs: breach === 'breached' && dueAt !== null && now !== null ? now - dueAt : null,
    detector: 'medlatency',
    citations,
  }
}

function mapWorkflow(
  raw: unknown,
  patientId: string | null,
  times: Map<string, number>,
): BloodWorkflow | null {
  const task = asRecord(raw)
  const id = str(task.id)
  const title = str(task.label) ?? 'Diagnostic pathway'
  if (!id) return null
  const site = siteFromFamily(str(task.family))
  const memberIds: string[] = []
  const steps = []
  for (const rawStage of asArray(task.stages)) {
    const stage = asRecord(rawStage)
    if (stage.assessment !== 'evidenced') continue
    const stageName = str(stage.stage)
    if (!stageName) continue
    const evidence = asRecord(asArray(stage.evidence)[0])
    const resourceId = str(evidence.resource_id)
    const time = resourceId ? (times.get(resourceId) ?? null) : null
    if (!resourceId || time === null) continue
    memberIds.push(resourceId)
    const actorName = str(task.responsible)
    steps.push({
      id: `${id}:${stageName}`,
      label: labelStage(stageName),
      field: 'time',
      time,
      actorName,
      actorKind: null,
      site,
      tone: actorTone(null, actorName, site),
    })
  }
  steps.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
  if (steps.length === 0) return null
  return workflowFromSteps({
    resourceId: id,
    patientId,
    panelId: str(task.item) ?? id,
    panelName: title,
    title,
    laboratory: 'MedLatency presentation — not live laboratory/PACS clocks',
    memberIds: uniqueIds(memberIds),
    panels: [title],
    analytes: [],
    origin: 'medlatency',
    steps,
  })
}

export function mapMedlatencyPresentation(packet: unknown): {
  validated: boolean
  analysisMode: string | null
  tasks: MappedWardlineTask[]
  workflows: BloodWorkflow[]
} {
  const root = asRecord(packet)
  const overview = asRecord(root.overview)
  const analysisMode = str(overview.analysis_mode)
  const validated = analysisMode !== null && VALIDATED_MODES.has(analysisMode)
  if (!validated) {
    return { validated: false, analysisMode, tasks: [], workflows: [] }
  }

  const patient = asRecord(overview.patient)
  const patientId = str(patient.id)
  const patientName = str(patient.display_name)
  const now = parseTime(overview.clinical_as_of)
  const times = timelineTimes(asArray(root.timeline))
  const tasks: MappedWardlineTask[] = []
  const workflows: BloodWorkflow[] = []
  for (const raw of asArray(root.tasks)) {
    const task = mapTask(raw, patientId, patientName, now)
    if (task) tasks.push(task)
    const workflow = mapWorkflow(raw, patientId, times)
    if (workflow) workflows.push(workflow)
  }
  return { validated: true, analysisMode, tasks, workflows }
}
