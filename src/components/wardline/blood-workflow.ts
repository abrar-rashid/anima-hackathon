import type { SimResource } from '@/ctl/contracts'
import { readableAction } from '@/ctl/latency/compute'
import { retrospectiveEvent } from '@/ctl/normalise/retrospective'

export type BloodActorTone = 'doctors' | 'clinical' | 'laboratory' | 'nurses'

export interface BloodWorkflowStep {
  id: string
  label: string
  field: string
  time: number
  actorName: string | null
  actorKind: string | null
  site: string | null
  tone: BloodActorTone
}

export interface BloodWorkflowGap {
  fromId: string
  toId: string
  fromLabel: string
  toLabel: string
  elapsedMs: number
  label: string
}

export interface BloodWorkflow {
  resourceId: string
  patientId: string | null
  panelId: string | null
  panelName: string
  title: string
  laboratory: string | null
  /** Source blood-result ids folded into this track. */
  memberIds: string[]
  /** Panel names that share these timestamps. */
  panels: string[]
  /** Analyte names folded into the same draw times. */
  analytes: string[]
  origin?: 'blood-result' | 'retrospective-seed' | 'medlatency'
  steps: BloodWorkflowStep[]
  gaps: BloodWorkflowGap[]
  totalElapsedMs: number
}

const DATA_TIME_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'requestedAt', label: 'Requested' },
  { key: 'orderedAt', label: 'Ordered on the system' },
  { key: 'collectedAt', label: 'Sample collected' },
  { key: 'receivedAt', label: 'Laboratory received' },
  { key: 'processedAt', label: 'Processed' },
  { key: 'availableAt', label: 'Result available' },
  { key: 'reportedAt', label: 'Result reported' },
  { key: 'reviewedAt', label: 'Result reviewed' },
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function analyteNames(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.analytes)) return []
  const names: string[] = []
  const seen = new Set<string>()
  for (const raw of data.analytes) {
    const name = str(asRecord(raw).name)
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function stepRole(step: BloodWorkflowStep): string {
  if (step.field === 'createdAt' || step.field === 'provenance.created.time') return 'result'
  return step.field
}

export function actorTone(kind: string | null, name: string | null, site: string | null): BloodActorTone {
  const person = `${kind ?? ''} ${name ?? ''}`
  const blob = `${person} ${site ?? ''}`
  if (/nurs/i.test(blob)) return 'nurses'
  if (/doctor|consultant|dr\b/i.test(person)) return 'doctors'
  if (/lab|diagnostic/i.test(blob)) return 'laboratory'
  return 'clinical'
}

function gapLabel(from: BloodWorkflowStep, to: BloodWorkflowStep): string {
  if (
    from.field === 'collectedAt' &&
    (to.field === 'createdAt' ||
      to.field === 'provenance.created.time' ||
      /available|reported|recorded|blood results/i.test(to.label))
  ) {
    return 'Transport & processing latency'
  }
  if (/request|order/i.test(from.label) && to.field === 'collectedAt') {
    return 'Sample collection latency'
  }
  if (/review/i.test(to.label)) return 'Review latency'
  return `${from.label} → ${to.label}`
}

function isBloodResult(resource: SimResource): boolean {
  const data = asRecord(resource.data)
  return resource.kind === 'report' && str(data.kind) === 'blood-result'
}

function stepsFromResource(resource: SimResource): BloodWorkflowStep[] {
  const data = asRecord(resource.data)
  const created = resource.provenance.created
  const steps: BloodWorkflowStep[] = []

  for (const field of DATA_TIME_FIELDS) {
    const time = num(data[field.key])
    if (time === null) continue
    steps.push({
      id: `${resource.id}:${field.key}`,
      label: field.label,
      field: field.key,
      time,
      actorName: created?.actor.name ?? null,
      actorKind: created?.actor.kind ?? null,
      site: resource.site,
      tone: actorTone(created?.actor.kind ?? null, created?.actor.name ?? null, resource.site),
    })
  }

  const recordedAt = created?.time ?? resource.createdAt ?? null
  const already = steps.some((step) => recordedAt !== null && Math.abs(step.time - recordedAt) < 1)
  if (recordedAt !== null && !already) {
    steps.push({
      id: `${resource.id}:createdAt`,
      label: created ? readableAction(created.action) : 'Result recorded',
      field: created ? 'provenance.created.time' : 'createdAt',
      time: recordedAt,
      actorName: created?.actor.name ?? null,
      actorKind: created?.actor.kind ?? null,
      site: resource.site,
      tone: actorTone(created?.actor.kind ?? null, created?.actor.name ?? null, resource.site),
    })
  }

  for (const [index, change] of resource.provenance.changes.entries()) {
    steps.push({
      id: `${resource.id}:change:${index}:${change.action}`,
      label: readableAction(change.action),
      field: `provenance.changes.${index}.time`,
      time: change.time,
      actorName: change.actor.name,
      actorKind: change.actor.kind,
      site: resource.site,
      tone: actorTone(change.actor.kind, change.actor.name, resource.site),
    })
  }

  return steps.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
}

export function labelStage(stage: string): string {
  const spaced = stage.replaceAll('_', ' ').trim()
  if (spaced.length === 0) return stage
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function labelInvestigation(investigation: string): string {
  const key = investigation.toLowerCase()
  if (key.includes('ct')) return 'CT chest without intravenous contrast'
  if (key.includes('blood')) return 'FBC, U&E and CRP'
  return investigation
}

export function workflowFromSteps(
  workflow: Omit<BloodWorkflow, 'gaps' | 'totalElapsedMs'> & { gaps?: BloodWorkflowGap[] },
): BloodWorkflow {
  return withGaps(workflow)
}

function withGaps(workflow: Omit<BloodWorkflow, 'gaps' | 'totalElapsedMs'> & { gaps?: BloodWorkflowGap[] }): BloodWorkflow {
  const gaps: BloodWorkflowGap[] = []
  for (let i = 1; i < workflow.steps.length; i += 1) {
    const from = workflow.steps[i - 1]!
    const to = workflow.steps[i]!
    const elapsedMs = to.time - from.time
    if (elapsedMs < 0) continue
    gaps.push({
      fromId: from.id,
      toId: to.id,
      fromLabel: from.label,
      toLabel: to.label,
      elapsedMs,
      label: gapLabel(from, to),
    })
  }
  return {
    ...workflow,
    gaps,
    totalElapsedMs: gaps.reduce((sum, gap) => sum + gap.elapsedMs, 0),
  }
}

export function buildRetrospectiveWorkflows(resources: readonly SimResource[]): BloodWorkflow[] {
  const groups = new Map<
    string,
    {
      investigation: string
      patientId: string
      site: string | null
      steps: BloodWorkflowStep[]
      memberIds: string[]
    }
  >()

  for (const resource of resources) {
    const event = retrospectiveEvent(resource)
    if (!event || !resource.patientId) continue
    const existing = groups.get(event.requestResourceId) ?? {
      investigation: event.investigation,
      patientId: resource.patientId,
      site: resource.site,
      steps: [],
      memberIds: [],
    }
    existing.memberIds.push(resource.id, event.requestResourceId)
    existing.steps.push({
      id: `${resource.id}:${event.stage}`,
      label: labelStage(event.stage),
      field: 'clinical_event_at',
      time: event.time,
      actorName: event.role,
      actorKind: 'synthetic narrative',
      site: resource.site,
      tone: actorTone('synthetic narrative', event.role, resource.site),
    })
    groups.set(event.requestResourceId, existing)
  }

  const workflows: BloodWorkflow[] = []
  for (const [requestId, group] of groups) {
    const steps = group.steps.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
    if (steps.length === 0) continue
    const panelName = labelInvestigation(group.investigation)
    workflows.push(
      withGaps({
        resourceId: requestId,
        patientId: group.patientId,
        panelId: group.investigation,
        panelName,
        title: panelName,
        laboratory: 'Retrospective synthetic seed',
        memberIds: uniqueSorted(group.memberIds),
        panels: [panelName],
        analytes: [],
        origin: 'retrospective-seed',
        steps,
      }),
    )
  }

  return workflows.sort((a, b) => {
    const aTime = a.steps[a.steps.length - 1]?.time ?? 0
    const bTime = b.steps[b.steps.length - 1]?.time ?? 0
    return bTime - aTime || a.resourceId.localeCompare(b.resourceId)
  })
}

export function buildBloodWorkflows(resources: readonly SimResource[]): BloodWorkflow[] {
  const workflows: BloodWorkflow[] = []
  const seen = new Set<string>()
  for (const resource of resources) {
    if (!isBloodResult(resource)) continue
    if (seen.has(resource.id)) continue
    seen.add(resource.id)
    const data = asRecord(resource.data)
    const panel = asRecord(data.panel)
    const panelName = str(panel.name) ?? resource.title
    const steps = stepsFromResource(resource)
    if (steps.length === 0) continue
    workflows.push(
      withGaps({
        resourceId: resource.id,
        patientId: resource.patientId ?? null,
        panelId: str(panel.id),
        panelName,
        title: resource.title,
        laboratory: str(data.laboratory),
        memberIds: [resource.id],
        panels: [panelName],
        analytes: analyteNames(data),
        steps,
      }),
    )
  }
  return workflows.sort((a, b) => {
    const aTime = a.steps[a.steps.length - 1]?.time ?? 0
    const bTime = b.steps[b.steps.length - 1]?.time ?? 0
    return bTime - aTime || a.resourceId.localeCompare(b.resourceId)
  })
}

/** Newest draw per patient + panel, so six historical FBCs do not bury the live one. */
export function latestBloodWorkflows(workflows: readonly BloodWorkflow[]): BloodWorkflow[] {
  const seen = new Set<string>()
  const out: BloodWorkflow[] = []
  for (const workflow of workflows) {
    const key = `${workflow.patientId ?? 'none'}:${workflow.panelId ?? workflow.resourceId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(workflow)
  }
  return out
}

export function workflowsForPatient(
  workflows: readonly BloodWorkflow[],
  patientId: string,
): BloodWorkflow[] {
  return workflows.filter((workflow) => workflow.patientId === patientId)
}

export function workflowForResource(
  workflows: readonly BloodWorkflow[],
  resourceId: string | undefined,
): BloodWorkflow | null {
  if (!resourceId) return null
  return (
    workflows.find(
      (workflow) =>
        workflow.resourceId === resourceId || (workflow.memberIds ?? []).includes(resourceId),
    ) ?? null
  )
}

export function patientBloodWorkflow(
  workflows: readonly BloodWorkflow[],
  patientId: string | null | undefined,
): BloodWorkflow | null {
  if (!patientId) return null
  return workflows.find((workflow) => workflow.patientId === patientId) ?? null
}

/**
 * One track per patient. Panels and analytes that share a timestamp become
 * one node — they are the same blood-test time, not separate tests.
 */
export function congregateByPatient(workflows: readonly BloodWorkflow[]): BloodWorkflow[] {
  const byPatient = new Map<string, BloodWorkflow[]>()
  for (const workflow of workflows) {
    const key = workflow.patientId ?? workflow.resourceId
    const list = byPatient.get(key) ?? []
    list.push(workflow)
    byPatient.set(key, list)
  }

  const congregated: BloodWorkflow[] = []
  for (const [key, rows] of byPatient) {
    const byNode = new Map<string, BloodWorkflowStep>()
    const panels: string[] = []
    const analytes: string[] = []
    const memberIds: string[] = []
    let laboratory: string | null = null
    for (const row of rows) {
      memberIds.push(...row.memberIds)
      panels.push(...row.panels)
      analytes.push(...row.analytes)
      laboratory ??= row.laboratory
      for (const step of row.steps) {
        const id = `${key}:${stepRole(step)}:${step.time}`
        if (!byNode.has(id)) byNode.set(id, { ...step, id })
      }
    }
    const steps = [...byNode.values()].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
    if (steps.length === 0) continue
    congregated.push(
      withGaps({
        resourceId: `blood:${key}`,
        patientId: rows[0]?.patientId ?? null,
        panelId: null,
        panelName: 'Blood test',
        title: 'Blood test',
        laboratory,
        memberIds: uniqueSorted(memberIds),
        panels: uniqueSorted(panels),
        analytes: uniqueSorted(analytes),
        steps,
      }),
    )
  }

  return congregated.sort((a, b) => {
    const aTime = a.steps[a.steps.length - 1]?.time ?? 0
    const bTime = b.steps[b.steps.length - 1]?.time ?? 0
    return bTime - aTime || (a.patientId ?? '').localeCompare(b.patientId ?? '')
  })
}

/** Latest draw per panel, then one congregated timeline per patient. */
export function selectBloodWorkflows(workflows: readonly BloodWorkflow[]): BloodWorkflow[] {
  return congregateByPatient(latestBloodWorkflows(workflows))
}
