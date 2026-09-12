import { describe, expect, it } from 'vitest'
import { NOT_SUPPLIED, type SimResource } from '@/ctl/contracts'
import { extractTasksDetailed } from '@/ctl/extract/extract'
import type { ExtractionModel, ModelCallResult } from '@/ctl/extract/model-client'
import type { ModelCandidate } from '@/ctl/extract/schema'

/**
 * The model is always mocked: no test may reach the OpenAI API. What is under
 * test is what the layer does with a response, including a dishonest one.
 */

const FOLLOW_UP = 'Follow-up arrangements require confirmation by the receiving team.'
const GP_ACTIONS = 'Review this handover and record its processing outcome in the simulation.'

function discharge(overrides: Partial<SimResource> = {}): SimResource {
  return {
    id: 'discharge-summary-example',
    kind: 'discharge-summary',
    title: 'Discharge summary \u00b7 monitoring handover',
    status: 'sent',
    version: 1,
    visibleTo: ['hospital', 'gp'],
    site: 'hospital',
    patientId: 'SIM-000001',
    createdAt: 1789200000000,
    data: { stage: 'sent', sections: { followUp: FOLLOW_UP, gpActions: GP_ACTIONS } },
    provenance: { changes: [] },
    ...overrides,
  }
}

function modelReturning(...batches: unknown[]): ExtractionModel {
  let call = 0
  return {
    async complete(): Promise<ModelCallResult> {
      const batch = batches[Math.min(call, batches.length - 1)]
      call += 1
      return { ok: true, content: JSON.stringify(batch) }
    },
  }
}

function candidates(...items: Partial<ModelCandidate>[]): { candidates: ModelCandidate[] } {
  return {
    candidates: items.map((item) => ({
      field: 'data.sections.followUp',
      tag: 'confirm-follow-up-arrangements',
      summary: 'Confirm follow-up arrangements',
      quote: FOLLOW_UP,
      timeframe: null,
      ...item,
    })),
  }
}

describe('extractTasksDetailed', () => {
  it('keeps a verbatim candidate and discards a fabricated one from the same response', async () => {
    const model = modelReturning(
      candidates(
        {},
        {
          tag: 'arrange-blood-test',
          summary: 'Arrange urgent bloods',
          quote: 'Arrange urgent bloods and repeat the potassium tomorrow.',
        },
      ),
    )

    const outcome = await extractTasksDetailed([discharge()], { model })

    expect(outcome.tasks).toHaveLength(1)
    expect(outcome.tasks[0]?.tag).toBe('confirm-follow-up-arrangements')
    expect(outcome.rejected).toEqual([
      expect.objectContaining({ reason: 'quote-not-found-in-source', claimedTag: 'arrange-blood-test' }),
    ])
    expect(outcome.reason).toBeNull()
  })

  it('discards an off-bank tag even when its quote is genuine', async () => {
    const outcome = await extractTasksDetailed([discharge()], {
      model: modelReturning(candidates({ tag: 'escalate-to-consultant' })),
    })

    expect(outcome.tasks).toEqual([])
    expect(outcome.rejected[0]?.reason).toBe('tag-not-in-bank')
  })

  it('carries the source priority and never the model priority', async () => {
    const withModelPriority = {
      candidates: [
        {
          field: 'data.sections.gpActions',
          tag: 'review-correspondence',
          summary: 'Review the handover',
          quote: GP_ACTIONS,
          timeframe: null,
          priority: 'emergency',
          clinical_priority: 'emergency',
        },
      ],
    }

    const urgent = await extractTasksDetailed([discharge({ priority: 'urgent' })], {
      model: modelReturning(withModelPriority),
    })
    expect(urgent.tasks[0]?.priority).toBe('urgent')

    const routine = await extractTasksDetailed([discharge({ priority: 'routine' })], {
      model: modelReturning(withModelPriority),
    })
    expect(routine.tasks[0]?.priority).toBe(NOT_SUPPLIED)

    const none = await extractTasksDetailed([discharge()], {
      model: modelReturning(withModelPriority),
    })
    expect(none.tasks[0]?.priority).toBe(NOT_SUPPLIED)
  })

  it('cites the resource, version, site, field and quote for every task', async () => {
    const outcome = await extractTasksDetailed([discharge()], {
      model: modelReturning(candidates({})),
    })

    expect(outcome.tasks[0]?.citation).toEqual({
      resourceId: 'discharge-summary-example',
      version: 1,
      site: 'hospital',
      field: 'data.sections.followUp',
      quote: FOLLOW_UP,
    })
  })

  it('collapses the same tag quoting the same span twice into one task', async () => {
    const outcome = await extractTasksDetailed([discharge()], {
      model: modelReturning(candidates({}, {})),
    })

    expect(outcome.tasks).toHaveLength(1)
    expect(outcome.rejected[0]?.reason).toBe('duplicate-candidate')
  })

  it('reports snomed as unsupplied rather than generating a code', async () => {
    const outcome = await extractTasksDetailed([discharge()], {
      model: modelReturning(candidates({})),
    })
    expect(outcome.tasks[0]?.snomedId).toBe(NOT_SUPPLIED)
  })
})

describe('degrading without fabricating', () => {
  it('returns an empty list and a reason when there is no API key', async () => {
    const outcome = await extractTasksDetailed([discharge()], { model: null })

    expect(outcome.tasks).toEqual([])
    expect(outcome.reason).toContain('OPENAI_API_KEY')
  })

  it('returns an empty list and a reason when the model call fails', async () => {
    const failing: ExtractionModel = {
      async complete() {
        return { ok: false, error: 'connection reset' }
      },
    }

    const outcome = await extractTasksDetailed([discharge()], { model: failing })

    expect(outcome.tasks).toEqual([])
    expect(outcome.reason).toContain('connection reset')
  })

  it('does not throw when the model returns something that is not JSON', async () => {
    const garbage: ExtractionModel = {
      async complete() {
        return { ok: true, content: 'I could not find any tasks.' }
      },
    }

    const outcome = await extractTasksDetailed([discharge()], { model: garbage })

    expect(outcome.tasks).toEqual([])
    expect(outcome.reason).toContain('invalid JSON')
  })

  it('does not throw when the response does not match the schema', async () => {
    const wrongShape: ExtractionModel = {
      async complete() {
        return { ok: true, content: JSON.stringify({ tasks: ['book a follow-up'] }) }
      },
    }

    const outcome = await extractTasksDetailed([discharge()], { model: wrongShape })

    expect(outcome.tasks).toEqual([])
    expect(outcome.reason).toContain('did not match')
  })

  it('says so when there is no free text to read, without calling the model', async () => {
    let called = false
    const model: ExtractionModel = {
      async complete() {
        called = true
        return { ok: true, content: '{"candidates":[]}' }
      },
    }

    const outcome = await extractTasksDetailed(
      [
        {
          id: 'r-2',
          kind: 'task',
          title: 'Arrange post-discharge monitoring',
          status: 'open',
          version: 1,
          visibleTo: ['gp'],
          site: 'gp',
          data: {},
          provenance: { changes: [] },
        },
      ],
      { model },
    )

    expect(called).toBe(false)
    expect(outcome.tasks).toEqual([])
    expect(outcome.reason).toBe('no free text in the supplied resources')
  })

  it('states how much text it read, so a surface can show a denominator', async () => {
    const outcome = await extractTasksDetailed([discharge()], {
      model: modelReturning(candidates({})),
    })

    expect(outcome.spansRead).toBe(2)
    expect(outcome.resourcesRead).toBe(1)
  })
})
