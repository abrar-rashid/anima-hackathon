import { openai } from '@animahealth/adk'

import { PATCH_ALLOWED_FIELDS, validatePatch } from '@/domain/patch-grammar'

import { app } from './app'
import { AnalystInputSchema, PatchProposalSchema, type PatchProposal } from './schemas'

const DEFAULT_DIFF: NonNullable<PatchProposal['diff']> = {
  receiverMode: 'ACCOUNTABLE_TEAM',
  ackDeadlineMinutes: 30,
  fallbackTeamId: 'gp-duty',
  exceptionRoute: 'duty-clinician-task',
  dedupeWindowMinutes: 60,
}

const ALLOWED = new Set<string>(PATCH_ALLOWED_FIELDS)

function allowedDiff(diff: Record<string, unknown>): PatchProposal['diff'] {
  const next: PatchProposal['diff'] = {}
  for (const field of PATCH_ALLOWED_FIELDS) {
    if (field in diff) {
      ;(next as Record<string, unknown>)[field] = diff[field]
    }
  }
  return next
}

export function analyseReliability(raw: unknown): PatchProposal {
  const input = AnalystInputSchema.parse(raw)
  const proposed = input.proposedDiff ?? {}
  validatePatch(input.baseProtocol, proposed)

  const overlay = Object.fromEntries(
    Object.entries(proposed).filter(([key]) => ALLOWED.has(key)),
  )
  const merged = { ...DEFAULT_DIFF, ...overlay }
  const checked = validatePatch(input.baseProtocol, merged)
  const diff = checked.ok ? allowedDiff(merged) : allowedDiff(overlay)

  return {
    baseProtocolId: input.baseProtocol.id,
    diff,
    traceRef: input.traceRef,
    denominator: input.denominator,
    failureHypothesis:
      input.failureHypothesis ??
      'After-hours named-person transfer timed out; the ordering team stayed accountable without a duty-team fallback.',
    requestedTwinRun: true,
  }
}

export function gatePatch(
  deterministic: PatchProposal,
  candidate: PatchProposal,
  note: (field: string) => void,
): PatchProposal {
  const candidateDiff = candidate.diff ?? {}
  for (const key of Object.keys(candidateDiff)) {
    if (!ALLOWED.has(key)) {
      note(`diff.${key}`)
    }
  }
  if (JSON.stringify(deterministic.diff) !== JSON.stringify(allowedDiff(candidateDiff))) {
    for (const field of PATCH_ALLOWED_FIELDS) {
      if (deterministic.diff[field] !== candidateDiff[field]) {
        note(field)
      }
    }
  }
  return {
    ...deterministic,
    failureHypothesis:
      typeof candidate.failureHypothesis === 'string' && candidate.failureHypothesis.length > 0
        ? candidate.failureHypothesis
        : deterministic.failureHypothesis,
  }
}

const skipUnusableModel = {
  name: 'skip-unusable-model',
  canHandle: (ctx: { error: Error }) => ctx.error.name === 'OutputParseError',
  handle: () => ({ action: 'skip' as const }),
}

export const reliabilityAnalystDeterministic = app.step({
  name: 'reliability-analyst-deterministic',
  description: 'Propose a bounded operational protocol patch from a failed trace.',
  execute: (ctx) => {
    if (!ctx.state.analystInput) ctx.fail('analystInput is required')
    const patch = analyseReliability(ctx.state.analystInput)
    ctx.state.patch = patch
    ctx.state.deterministicPatch = patch
    ctx.output(patch)
  },
})

export const reliabilityAnalystModel = app.agent({
  name: 'reliability-analyst-model',
  model: openai('gpt-4o-mini'),
  context: [
    app.context.system(
      'Re-emit the supplied patch JSON. You may refine failureHypothesis prose only. Do not change classification, transfer, deadlines, or diff keys outside the operational patch grammar.',
    ),
    app.context.user((ctx) => JSON.stringify(ctx.state.patch)),
  ],
  output: { schema: PatchProposalSchema, mode: 'native', key: 'patch' },
  errorHandlers: [skipUnusableModel],
})

export const reliabilityAnalystGate = app.step({
  name: 'reliability-analyst-gate',
  description: 'Discard model changes outside the patch grammar.',
  execute: (ctx) => {
    const deterministic = ctx.state.deterministicPatch
    const current = ctx.state.patch
    if (!deterministic || !current) return
    ctx.state.patch = gatePatch(deterministic, current, (field) => {
      ctx.note(`model-output-overridden: ${field}`)
    })
  },
})

export const reliabilityAnalyst = app.sequence({
  name: 'reliability-analyst',
  runnables: [
    reliabilityAnalystDeterministic,
    app.step({
      name: 'reliability-analyst-maybe-model',
      execute: (ctx) => {
        if (process.env.OPENAI_API_KEY || ctx.state.forceModel) return reliabilityAnalystModel
      },
    }),
    reliabilityAnalystGate,
  ],
})
