export type AgentName = 'context-assembler' | 'covenant-compiler' | 'reliability-analyst'

export type AgentRunResult<TOutput> =
  | { ok: true; value: TOutput; notes: string[] }
  | { ok: false; error: string; fallback: TOutput | null; notes: string[] }

export interface AdkRuntimePort {
  run<TInput, TOutput>(agent: AgentName, input: TInput): Promise<AgentRunResult<TOutput>>
}
