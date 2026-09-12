import { describe, expect, it } from 'vitest'
import type { Runnable } from '@animahealth/adk'
import { runTest, user } from '@animahealth/adk/testing'

import { app } from '@/agents/app'
import { contextAssembler } from '@/agents/context-assembler'
import type { Snapshot } from '@/agents/schemas'

import { SIM_ASSEMBLER_INPUT } from './sim-case'

const CITED_FIELDS = [
  'patientId',
  'result',
  'result.id',
  'result.version',
  'result.classification',
  'orderingTeamId',
  'requestedReceiver',
  'existingTasks',
  'visibility',
  'simulatorNow',
  'conflicts',
  'missingEvidence',
] as const

describe('context-assembler', () => {
  it('deterministic assembler cites every field (no field without citation)', async () => {
    const result = await runTest(contextAssembler as Runnable, [user('assemble')], {
      schema: app.schema,
      initialState: { session: { assemblerInput: SIM_ASSEMBLER_INPUT } },
    })

    const snapshot = result.result.state.snapshot as Snapshot | null
    expect(snapshot).toBeTruthy()
    if (!snapshot) throw new Error('expected snapshot')

    expect(snapshot.patientId).toBe('SIM-000001')
    expect(snapshot.result.id).toBe('blood-v1-SIM-000001-crp-5')
    expect(snapshot.result.version).toBe(1)
    expect(snapshot.result.classification.value).toBe(5.6)
    expect(snapshot.result.classification.direction).toBe('above')
    expect(snapshot.orderingTeamId).toBe('hospital')
    expect(snapshot.requestedReceiver).toBe('gp')
    expect(snapshot.existingTasks).toEqual([
      {
        id: 'r-2',
        version: 1,
        title: 'Arrange post-discharge monitoring',
        status: 'open',
      },
    ])
    expect(snapshot.visibility).toEqual(['gp', 'hospital', 'diagnostics'])
    expect(snapshot.simulatorNow).toBe(1789286400000)

    const cited = new Set(snapshot.citations.map((citation) => citation.eventType))
    for (const field of CITED_FIELDS) {
      expect(cited.has(field), `missing citation for ${field}`).toBe(true)
    }
    expect(snapshot.citations.every((citation) => citation.resourceId.length > 0)).toBe(true)
  })
})
