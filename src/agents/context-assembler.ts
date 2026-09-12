import { openai } from '@animahealth/adk'

import type { EvidenceRef, SiteId, TeamId } from '@/domain/types'

import { app } from './app'
import { AssemblerInputSchema, SnapshotSchema, type Snapshot } from './schemas'

const SITE_IDS = new Set<SiteId>([
  'gp',
  'hospital',
  'community',
  'pharmacy',
  'diagnostics',
  'referrals',
  'wearables',
  'patient',
])

function isSiteId(value: string): value is SiteId {
  return SITE_IDS.has(value as SiteId)
}

function isTeamId(value: string): value is TeamId {
  return value === 'gp-duty' || isSiteId(value)
}

function cite(
  field: string,
  source: {
    site: EvidenceRef['site']
    resourceId: string
    resourceVersion: number
    observedAt: number
  },
): EvidenceRef {
  return {
    site: source.site,
    resourceId: source.resourceId,
    resourceVersion: source.resourceVersion,
    observedAtSimulatorTime: source.observedAt,
    eventType: field,
  }
}

function recordSite(record: { site?: string; owner: string }): SiteId {
  if (record.site && isSiteId(record.site)) return record.site
  if (isSiteId(record.owner)) return record.owner
  return 'gp'
}

function classificationsEqual(
  left: Snapshot['result']['classification'],
  right: Snapshot['result']['classification'],
): boolean {
  return (
    left.rule === right.rule &&
    left.analyteId === right.analyteId &&
    left.value === right.value &&
    left.unit === right.unit &&
    left.referenceLow === right.referenceLow &&
    left.referenceHigh === right.referenceHigh &&
    left.direction === right.direction
  )
}

export function assembleSnapshot(raw: unknown): Snapshot {
  const input = AssemblerInputSchema.parse(raw)
  const now = input.simulatorNow
  const resultRef = {
    site: isSiteId(input.result.owner) ? input.result.owner : 'diagnostics',
    resourceId: input.result.id,
    resourceVersion: input.result.version,
    observedAt: now,
  }
  const clockRef = {
    site: 'clock' as const,
    resourceId: 'clock',
    resourceVersion: 0,
    observedAt: now,
  }

  const discharge = input.records.find((record) => record.kind === 'discharge-summary')
  const tasks = input.records.filter((record) => record.kind === 'task')
  const conflicts: string[] = []
  const missingEvidence: string[] = []

  let orderingTeamId: TeamId
  let requestedReceiver: TeamId
  if (discharge) {
    orderingTeamId = 'hospital'
    requestedReceiver = 'gp'
  } else if (input.orderingTeamId && input.requestedReceiver) {
    orderingTeamId = input.orderingTeamId
    requestedReceiver = input.requestedReceiver
    missingEvidence.push('No discharge-summary record to cite the ordering team')
  } else {
    orderingTeamId =
      isTeamId(input.result.owner) && input.result.owner !== 'diagnostics'
        ? input.result.owner
        : 'hospital'
    requestedReceiver = 'gp'
    missingEvidence.push('No discharge-summary record to cite the ordering team')
  }

  if (input.result.visibleTo.length > 1) {
    conflicts.push(
      'Result is visible to multiple teams while the ordering team remains accountable',
    )
  }

  if (
    input.activity.length === 0 ||
    !input.activity.some((entry) => entry.resourceId === input.result.id)
  ) {
    missingEvidence.push('No Activity record for the current result')
  }

  const orderRef = discharge
    ? {
        site: recordSite(discharge),
        resourceId: discharge.id,
        resourceVersion: discharge.version,
        observedAt: now,
      }
    : resultRef
  const taskRef = tasks[0]
    ? {
        site: recordSite(tasks[0]),
        resourceId: tasks[0].id,
        resourceVersion: tasks[0].version,
        observedAt: now,
      }
    : resultRef

  return {
    patientId: input.patientId,
    result: {
      id: input.result.id,
      version: input.result.version,
      classification: input.result.classification,
    },
    orderingTeamId,
    requestedReceiver,
    existingTasks: tasks.map((task) => ({
      id: task.id,
      version: task.version,
      title: task.title ?? task.id,
      status: task.status,
    })),
    visibility: [...input.result.visibleTo],
    simulatorNow: now,
    conflicts,
    missingEvidence,
    citations: [
      cite('patientId', resultRef),
      cite('result', resultRef),
      cite('result.id', resultRef),
      cite('result.version', resultRef),
      cite('result.classification', resultRef),
      cite('orderingTeamId', orderRef),
      cite('requestedReceiver', orderRef),
      cite('existingTasks', taskRef),
      cite('visibility', resultRef),
      cite('simulatorNow', clockRef),
      cite('conflicts', resultRef),
      cite('missingEvidence', resultRef),
    ],
  }
}

export function gateSnapshot(
  deterministic: Snapshot,
  candidate: Snapshot,
  note: (field: string) => void,
): Snapshot {
  if (!classificationsEqual(deterministic.result.classification, candidate.result.classification)) {
    note('classification')
  }
  if (deterministic.orderingTeamId !== candidate.orderingTeamId) {
    note('orderingTeamId')
  }
  return {
    ...deterministic,
    conflicts: Array.isArray(candidate.conflicts) ? candidate.conflicts : deterministic.conflicts,
  }
}

const skipUnusableModel = {
  name: 'skip-unusable-model',
  canHandle: (ctx: { error: Error }) => ctx.error.name === 'OutputParseError',
  handle: () => ({ action: 'skip' as const }),
}

export const contextAssemblerDeterministic = app.step({
  name: 'context-assembler-deterministic',
  description: 'Build a fully cited snapshot from supplied read-port records.',
  execute: (ctx) => {
    if (!ctx.state.assemblerInput) ctx.fail('assemblerInput is required')
    const snapshot = assembleSnapshot(ctx.state.assemblerInput)
    ctx.state.snapshot = snapshot
    ctx.state.deterministicSnapshot = snapshot
    ctx.output(snapshot)
  },
})

export const contextAssemblerModel = app.agent({
  name: 'context-assembler-model',
  model: openai('gpt-4o-mini'),
  context: [
    app.context.system(
      'Re-emit the supplied snapshot JSON. You may refine conflicts wording only. Do not change classification, ordering team, transfer, or deadlines.',
    ),
    app.context.user((ctx) => JSON.stringify(ctx.state.snapshot)),
  ],
  output: { schema: SnapshotSchema, mode: 'native', key: 'snapshot' },
  errorHandlers: [skipUnusableModel],
})

export const contextAssemblerGate = app.step({
  name: 'context-assembler-gate',
  description: 'Discard model changes to classification and ordering team.',
  execute: (ctx) => {
    const deterministic = ctx.state.deterministicSnapshot
    const current = ctx.state.snapshot
    if (!deterministic || !current) return
    ctx.state.snapshot = gateSnapshot(deterministic, current, (field) => {
      ctx.note(`model-output-overridden: ${field}`)
    })
  },
})

export const contextAssembler = app.sequence({
  name: 'context-assembler',
  runnables: [
    contextAssemblerDeterministic,
    app.step({
      name: 'context-assembler-maybe-model',
      execute: (ctx) => {
        if (process.env.OPENAI_API_KEY || ctx.state.forceModel) return contextAssemblerModel
      },
    }),
    contextAssemblerGate,
  ],
})
