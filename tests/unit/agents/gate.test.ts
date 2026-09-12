import { describe, expect, it } from 'vitest'
import { isAnnotationEvent, type Runnable } from '@animahealth/adk'
import { model, runTest, user } from '@animahealth/adk/testing'

import { app } from '@/agents/app'
import { assembleSnapshot, contextAssembler } from '@/agents/context-assembler'
import type { Snapshot } from '@/agents/schemas'

import { SIM_ASSEMBLER_INPUT } from './sim-case'

describe('model gate', () => {
  it('gate overrides a scripted model output that changes classification.value', async () => {
    const deterministic = assembleSnapshot(SIM_ASSEMBLER_INPUT)
    const tampered = structuredClone(deterministic)
    tampered.result.classification = { ...tampered.result.classification, value: 99 }

    const result = await runTest(
      contextAssembler as Runnable,
      [user('assemble'), model(JSON.stringify(tampered))],
      {
        schema: app.schema,
        initialState: {
          session: { assemblerInput: SIM_ASSEMBLER_INPUT, forceModel: true },
        },
      },
    )

    const snapshot = result.result.state.snapshot as Snapshot | null
    expect(snapshot).toBeTruthy()
    if (!snapshot) throw new Error('expected snapshot')

    expect(snapshot.result.classification.value).toBe(5.6)
    expect(snapshot.result.classification.value).not.toBe(99)
    expect(snapshot.orderingTeamId).toBe('hospital')

    const notes = result.events.filter(isAnnotationEvent).map((event) => event.message)
    expect(notes).toContain('model-output-overridden: classification')
  })
})
