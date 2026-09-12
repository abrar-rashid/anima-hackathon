import { openai } from '@animahealth/adk'

import type { SiteId, TeamId } from '@/domain/types'

import { app } from './app'
import { CompilerInputSchema, ProposalSchema, type Proposal } from './schemas'

function siteFor(team: TeamId): SiteId {
  return team === 'gp-duty' ? 'gp' : team
}

function idempotencyKey(
  team: string,
  patientId: string,
  resultId: string,
  resultVersion: number,
  protocolId: string,
  kind: string,
  destination: string,
): string {
  return `${team}:${patientId}:${resultId}:${resultVersion}:${protocolId}:${kind}:${destination}`
}

export function compileProposal(raw: unknown): Proposal {
  const input = CompilerInputSchema.parse(raw)
  const { snapshot, protocol, binding } = input
  const acceptSupported = binding.acceptSupported === true
  const team = binding.team ?? 'unknown-team'
  const destination = siteFor(snapshot.requestedReceiver)
  const sourceVersions = [{ id: snapshot.result.id, version: snapshot.result.version }]
  const policySource = `protocol:${protocol.id}.ackDeadlineMinutes`

  const taskReadback = `GET /api/nhs/gp-connect?patient=${snapshot.patientId}`
  const createdTaskId = input.createdTaskId && input.createdTaskId !== snapshot.result.id ? input.createdTaskId : undefined

  const createTask: Proposal['actions'][number] = {
    kind: 'create_task',
    site: destination,
    payload: {
      type: 'create_task',
      title: 'Acknowledge abnormal-result handover',
      owner: snapshot.requestedReceiver,
      patientId: snapshot.patientId,
    },
    expectedReadback: taskReadback,
    sourceVersions,
    idempotencyKey: idempotencyKey(
      team,
      snapshot.patientId,
      snapshot.result.id,
      snapshot.result.version,
      protocol.id,
      'create_task',
      destination,
    ),
    supported: true,
    label: 'live',
  }

  const accept: Proposal['actions'][number] = {
    kind: 'accept',
    site: destination,
    payload: createdTaskId ? { type: 'accept', resourceId: createdTaskId } : { type: 'accept' },
    expectedReadback: taskReadback,
    sourceVersions,
    idempotencyKey: idempotencyKey(
      team,
      snapshot.patientId,
      snapshot.result.id,
      snapshot.result.version,
      protocol.id,
      'accept',
      destination,
    ),
    supported: acceptSupported,
    label: acceptSupported ? 'live' : 'Protocol preview',
    requiresSeparateApproval: true,
    ...(createdTaskId
      ? {}
      : {
          blockedReason:
            'Task id is not yet known. Accept becomes executable after the ordering team creates the transfer task and a receipt or readback returns its id.',
        }),
  }

  const hardStops: string[] = []
  if (!acceptSupported) {
    hardStops.push('accept is labelled Protocol preview; live transfer is not claimed')
  }

  return {
    transfer: {
      toTeam: snapshot.requestedReceiver,
      mode: protocol.receiverMode,
      ...(input.toActorId ? { toActorId: input.toActorId } : {}),
    },
    deadlines: {
      ackDeadlineAt: snapshot.simulatorNow + protocol.ackDeadlineMinutes * 60 * 1000,
      policySource,
    },
    actions: [createTask, accept],
    prohibited: [
      { field: 'review', reason: 'Clinician decision required' },
      { field: 'plan', reason: 'Clinician decision required' },
      { field: 'urgency', reason: 'Clinician decision required' },
    ],
    hardStops,
    fieldSources: {
      'transfer.toTeam': 'snapshot.requestedReceiver',
      'transfer.mode': `protocol:${protocol.id}.receiverMode`,
      'deadlines.ackDeadlineAt': policySource,
      'deadlines.policySource': `protocol:${protocol.id}`,
      'actions[0]': 'bound create_task',
      'actions[1]': acceptSupported
        ? createdTaskId
          ? 'bound accept from created task receipt'
          : 'accept awaits created task id'
        : 'preflight.acceptSupported',
    },
  }
}

export function createdHandoverTaskId(
  proposal: Proposal | null | undefined,
  receipts: { actionIndex: number; resourceId: string | null }[],
  sourceResultId?: string,
): string | undefined {
  if (!proposal) return undefined
  for (const row of receipts) {
    const action = proposal.actions[row.actionIndex]
    if (action?.kind !== 'create_task') continue
    if (!row.resourceId || row.resourceId === sourceResultId) continue
    return row.resourceId
  }
  return undefined
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function gateProposal(
  deterministic: Proposal,
  candidate: Proposal,
  note: (field: string) => void,
): Proposal {
  if (!sameJson(deterministic.transfer, candidate.transfer)) note('transfer')
  if (!sameJson(deterministic.deadlines, candidate.deadlines)) note('deadlines')
  return {
    ...deterministic,
  }
}

const skipUnusableModel = {
  name: 'skip-unusable-model',
  canHandle: (ctx: { error: Error }) => ctx.error.name === 'OutputParseError',
  handle: () => ({ action: 'skip' as const }),
}

export const covenantCompilerDeterministic = app.step({
  name: 'covenant-compiler-deterministic',
  description: 'Compile an operational proposal from a cited snapshot and protocol.',
  execute: (ctx) => {
    if (!ctx.state.compilerInput) ctx.fail('compilerInput is required')
    const proposal = compileProposal(ctx.state.compilerInput)
    ctx.state.proposal = proposal
    ctx.state.deterministicProposal = proposal
    ctx.output(proposal)
  },
})

export const covenantCompilerModel = app.agent({
  name: 'covenant-compiler-model',
  model: openai('gpt-4o-mini'),
  context: [
    app.context.system(
      'Re-emit the supplied proposal JSON. Do not change transfer, deadlines, classification, or prohibited clinical fields.',
    ),
    app.context.user((ctx) => JSON.stringify(ctx.state.proposal)),
  ],
  output: { schema: ProposalSchema, mode: 'native', key: 'proposal' },
  errorHandlers: [skipUnusableModel],
})

export const covenantCompilerGate = app.step({
  name: 'covenant-compiler-gate',
  description: 'Discard model changes to transfer and deadlines.',
  execute: (ctx) => {
    const deterministic = ctx.state.deterministicProposal
    const current = ctx.state.proposal
    if (!deterministic || !current) return
    ctx.state.proposal = gateProposal(deterministic, current, (field) => {
      ctx.note(`model-output-overridden: ${field}`)
    })
  },
})

export const covenantCompiler = app.sequence({
  name: 'covenant-compiler',
  runnables: [
    covenantCompilerDeterministic,
    app.step({
      name: 'covenant-compiler-maybe-model',
      execute: (ctx) => {
        if (process.env.OPENAI_API_KEY || ctx.state.forceModel) return covenantCompilerModel
      },
    }),
    covenantCompilerGate,
  ],
})
