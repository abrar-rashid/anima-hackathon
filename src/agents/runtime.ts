import { isAnnotationEvent, type Event } from '@animahealth/adk'

import type { AdkRuntimePort, AgentName, AgentRunResult } from '@/ports/adk-runtime-port'

import { app } from './app'
import { assembleSnapshot, contextAssembler } from './context-assembler'
import { compileProposal, covenantCompiler } from './covenant-compiler'
import { analyseReliability, reliabilityAnalyst } from './reliability-analyst'
import type { AnalystInput, AssemblerInput, CompilerInput } from './schemas'

const SEQUENCES = {
  'context-assembler': contextAssembler,
  'covenant-compiler': covenantCompiler,
  'reliability-analyst': reliabilityAnalyst,
} as const

function notesFrom(events: readonly Event[]): string[] {
  return events
    .filter(isAnnotationEvent)
    .map((event) => event.message)
    .filter((message): message is string => typeof message === 'string' && message.length > 0)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function deterministicValue(agent: AgentName, input: unknown): unknown {
  if (agent === 'context-assembler') return assembleSnapshot(input as AssemblerInput)
  if (agent === 'covenant-compiler') return compileProposal(input as CompilerInput)
  return analyseReliability(input as AnalystInput)
}

function sessionSeed(agent: AgentName, input: unknown) {
  if (agent === 'context-assembler') return { assemblerInput: input as AssemblerInput }
  if (agent === 'covenant-compiler') return { compilerInput: input as CompilerInput }
  return { analystInput: input as AnalystInput }
}

function selectedValue(
  agent: AgentName,
  state: { snapshot: unknown; proposal: unknown; patch: unknown },
): unknown {
  if (agent === 'context-assembler') return state.snapshot
  if (agent === 'covenant-compiler') return state.proposal
  return state.patch
}

export class AdkRuntime implements AdkRuntimePort {
  async run<TInput, TOutput>(agent: AgentName, input: TInput): Promise<AgentRunResult<TOutput>> {
    let fallback: TOutput | null = null
    try {
      fallback = deterministicValue(agent, input) as TOutput
      const result = await app.run(SEQUENCES[agent], {
        input: {
          message: agent,
          initialState: { session: sessionSeed(agent, input) },
        },
      })
      const notes = notesFrom(result.session.events)
      if (result.status === 'error') {
        return { ok: false, error: result.error, fallback, notes }
      }
      const value = (selectedValue(agent, result.state) ?? fallback) as TOutput
      return { ok: true, value, notes }
    } catch (error) {
      if (fallback === null) {
        try {
          fallback = deterministicValue(agent, input) as TOutput
        } catch {
          fallback = null
        }
      }
      return { ok: false, error: errorMessage(error), fallback, notes: [] }
    }
  }
}
