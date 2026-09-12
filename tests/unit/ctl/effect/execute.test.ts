import { describe, expect, it } from 'vitest'
import openapi from '../../../fixtures/live/openapi.json'
import type { ActionProposal, SimResource } from '@/ctl/contracts'
import { clientRequestIdFrom } from '@/domain/idempotency'
import { parseLiveActionSchema } from '@/ctl/effect/action-schema'
import { compareReadback, executeProposal, type ExecuteDeps } from '@/ctl/effect/execute'

const schema = parseLiveActionSchema(openapi)!

const SPEC_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const KEY = 'team12|SIM-000001|discharge-summary-example|1|ctl-effect-map-1|process_document|gp'

function liveHandover(overrides: Partial<SimResource> = {}): SimResource {
  return {
    id: 'discharge-summary-example',
    kind: 'discharge-summary',
    title: 'Discharge summary \u00b7 monitoring handover',
    status: 'sent',
    version: 1,
    visibleTo: ['hospital', 'gp'],
    site: 'gp',
    patientId: 'SIM-000001',
    createdAt: 1789200000000,
    data: { stage: 'sent' },
    provenance: { changes: [] },
    ...overrides,
  }
}

function proposal(overrides: Partial<ActionProposal> = {}): ActionProposal {
  return {
    actionType: 'process_document',
    site: 'gp',
    payload: {
      type: 'process_document',
      resourceId: 'discharge-summary-example',
      documentCommand: 'review',
      expectedVersion: 1,
      patientId: 'SIM-000001',
    },
    sourceVersions: [{ id: 'discharge-summary-example', version: 1 }],
    idempotencyKey: KEY,
    rationale: 'unprocessed-handover fired on discharge-summary-example v1.',
    citations: [{ resourceId: 'discharge-summary-example', version: 1, site: 'gp' }],
    hardStops: [],
    supported: true,
    ...overrides,
  }
}

/** What the live API returns: the mutated resource with its provenance chain. */
function apiResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'discharge-summary-example',
    kind: 'discharge-summary',
    title: 'Discharge summary \u00b7 monitoring handover',
    status: 'reviewed',
    patientId: 'SIM-000001',
    version: 2,
    visibleTo: ['hospital', 'gp'],
    createdAt: 1789200000000,
    data: { stage: 'reviewed' },
    provenance: {
      created: {
        time: 1789200000000,
        actor: { kind: 'simulation', name: 'Dr Morgan Bell' },
        action: 'seed',
        source: 'hospital',
        version: 1,
      },
      changes: [
        {
          time: 1789290000000,
          actor: { kind: 'team', name: 'team12' },
          action: 'process_document',
          source: 'gp',
          version: 2,
        },
      ],
    },
    ...overrides,
  }
}

interface Harness {
  deps: Partial<ExecuteDeps>
  posts: { site: string; body: Record<string, unknown> }[]
  invalidated: () => number
}

function harness(options: {
  response?: { status: number; body: unknown }
  live?: SimResource | null
  schema?: typeof schema | null
} = {}): Harness {
  const posts: { site: string; body: Record<string, unknown> }[] = []
  let invalidated = 0
  let tick = 1_000

  return {
    posts,
    invalidated: () => invalidated,
    deps: {
      clock: () => (tick += 6_000),
      loadSchema: async () => (options.schema === undefined ? schema : options.schema),
      readResource: async () => (options.live === undefined ? liveHandover() : options.live),
      postAction: async (site, body) => {
        posts.push({ site, body })
        return options.response ?? { status: 200, body: apiResponse() }
      },
      invalidate: () => {
        invalidated += 1
      },
    },
  }
}

describe('the write is refused before it is attempted', () => {
  it('refuses when the proposal carries any hard stop', async () => {
    const h = harness()
    const receipt = await executeProposal(
      proposal({ hardStops: ['stale-source-version', 'missing-staff-identity'] }),
      { deps: h.deps },
    )

    expect(receipt.ok).toBe(false)
    expect(receipt.provenByReadback).toBe(false)
    expect(receipt.message).toContain('stale-source-version')
    expect(receipt.message).toContain('missing-staff-identity')
    expect(h.posts).toEqual([])
  })

  it('refuses when the action is not exposed by the live schema', async () => {
    const h = harness()
    const receipt = await executeProposal(proposal({ supported: false }), { deps: h.deps })

    expect(receipt.ok).toBe(false)
    expect(receipt.hardStops).toEqual(['unsupported-action'])
    expect(h.posts).toEqual([])
  })

  it('refuses when the source cannot be re-read immediately before writing', async () => {
    const h = harness({ live: null })
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.ok).toBe(false)
    expect(receipt.hardStops).toEqual(['source-absent'])
    expect(receipt.message).toContain('could not re-read source')
    expect(h.posts).toEqual([])
  })

  it('refuses when the source moved on between approval and execution', async () => {
    const h = harness({ live: liveHandover({ version: 2 }) })
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.ok).toBe(false)
    expect(receipt.hardStops).toContain('stale-source-version')
    expect(h.posts).toEqual([])
  })

  it('refuses when the source was already processed between approval and execution', async () => {
    const h = harness({ live: liveHandover({ data: { stage: 'filed' }, status: 'filed' }) })
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.ok).toBe(false)
    expect(receipt.hardStops).toContain('source-not-current')
    expect(h.posts).toEqual([])
  })

  it('refuses when the live schema became unreadable after the proposal was built', async () => {
    const h = harness({ schema: null })
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.ok).toBe(false)
    expect(receipt.hardStops).toContain('unsupported-action')
    expect(h.posts).toEqual([])
  })

  it('never invalidates the read cache on a refusal', async () => {
    const h = harness({ live: null })
    await executeProposal(proposal(), { deps: h.deps })
    expect(h.invalidated()).toBe(0)
  })
})

describe('the write itself', () => {
  it('posts the approved payload unchanged, plus a conforming clientRequestId', async () => {
    const h = harness()
    await executeProposal(proposal(), { deps: h.deps })

    expect(h.posts).toHaveLength(1)
    const post = h.posts[0]!
    expect(post.site).toBe('gp')
    expect(post.body).toMatchObject(proposal().payload)
    expect(post.body.clientRequestId).toBe(clientRequestIdFrom(KEY))
    expect(String(post.body.clientRequestId)).toMatch(SPEC_UUID)
  })

  it('surfaces how long the write took, because live writes take about six seconds', async () => {
    const receipt = await executeProposal(proposal(), { deps: harness().deps })

    expect(receipt.elapsedMs).toBeGreaterThan(0)
    expect(receipt.message).toContain('ms')
  })
})

describe('proof by readback', () => {
  it('accepts a write whose returned resource matches on every claim the payload made', async () => {
    const h = harness()
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.httpStatus).toBe(200)
    expect(receipt.provenByReadback).toBe(true)
    expect(receipt.ok).toBe(true)
    expect(receipt.resource?.version).toBe(2)
    expect(receipt.simulatorTime).toBe(1789290000000)
    expect(h.invalidated()).toBe(1)
  })

  it('refuses to call an HTTP 200 proof when the returned resource is a different resource', async () => {
    const h = harness({ response: { status: 200, body: apiResponse({ id: 'r-9999' }) } })
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.httpStatus).toBe(200)
    expect(receipt.provenByReadback).toBe(false)
    expect(receipt.ok).toBe(false)
    expect(receipt.message).toContain('resource-id')
    expect(h.invalidated()).toBe(0)
  })

  it('refuses to call an HTTP 200 proof when the version did not advance', async () => {
    const h = harness({ response: { status: 200, body: apiResponse({ version: 1 }) } })
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.provenByReadback).toBe(false)
    expect(receipt.readbackChecks).toContainEqual(
      expect.objectContaining({ name: 'version-advanced', ok: false }),
    )
  })

  it('refuses to call an HTTP 200 proof when it names a different patient', async () => {
    const h = harness({ response: { status: 200, body: apiResponse({ patientId: 'SIM-000009' }) } })
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.provenByReadback).toBe(false)
    expect(receipt.message).toContain('patient-id')
  })

  it('refuses to call an HTTP 200 proof when provenance does not record our team', async () => {
    const h = harness({
      response: {
        status: 200,
        body: apiResponse({
          provenance: {
            changes: [
              {
                time: 1789290000000,
                actor: { kind: 'simulation', name: 'Synthetic history' },
                action: 'process_document',
                source: 'gp',
                version: 2,
              },
            ],
          },
        }),
      },
    })
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.provenByReadback).toBe(false)
    expect(receipt.readbackChecks).toContainEqual(
      expect.objectContaining({ name: 'provenance-records-team-write', ok: false }),
    )
  })

  it('refuses to call an HTTP 200 proof when the body is not a resource at all', async () => {
    const h = harness({ response: { status: 200, body: { ok: true } } })
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.provenByReadback).toBe(false)
    expect(receipt.resource).toBeUndefined()
    expect(receipt.readbackChecks[0]?.name).toBe('resource-returned')
  })

  it('reports a non-2xx response with the reason the API gave', async () => {
    const h = harness({
      response: { status: 400, body: { error: 'invalid_format', path: ['clientRequestId'] } },
    })
    const receipt = await executeProposal(proposal(), { deps: h.deps })

    expect(receipt.ok).toBe(false)
    expect(receipt.httpStatus).toBe(400)
    expect(receipt.message).toContain('invalid_format')
    expect(h.invalidated()).toBe(0)
  })

  it('does not throw when the transport fails', async () => {
    const receipt = await executeProposal(proposal(), {
      deps: {
        ...harness().deps,
        postAction: async () => {
          throw new Error('fetch failed')
        },
      },
    })

    expect(receipt.ok).toBe(false)
    expect(receipt.httpStatus).toBe(0)
    expect(receipt.message).toContain('fetch failed')
  })
})

describe('compareReadback', () => {
  it('checks only the claims the payload made', async () => {
    const chase = proposal({
      actionType: 'create_task',
      payload: {
        type: 'create_task',
        patientId: 'SIM-000001',
        title: 'Chase unclosed work: Discharge summary',
        text: 'Raised by Close The Loop.',
      },
    })

    const created: SimResource = {
      id: 'r-6738',
      kind: 'task',
      title: 'Chase unclosed work: Discharge summary',
      status: 'open',
      version: 1,
      visibleTo: ['gp'],
      site: 'gp',
      patientId: 'SIM-000001',
      data: {},
      provenance: {
        created: {
          time: 1789290000000,
          actor: { kind: 'team', name: 'team12' },
          action: 'create_task',
          source: 'gp',
          version: 1,
        },
        changes: [],
      },
    }

    const { provenByReadback, checks } = compareReadback(chase, created)

    expect(provenByReadback).toBe(true)
    expect(checks.map((check) => check.name)).toEqual([
      'patient-id',
      'title',
      'provenance-records-team-write',
    ])
  })

  it('fails a created task whose title is not the title that was approved', () => {
    const chase = proposal({
      actionType: 'create_task',
      payload: { type: 'create_task', patientId: 'SIM-000001', title: 'Chase unclosed work' },
    })

    const { provenByReadback } = compareReadback(chase, {
      id: 'r-6738',
      kind: 'task',
      title: 'Something else entirely',
      status: 'open',
      version: 1,
      visibleTo: ['gp'],
      site: 'gp',
      patientId: 'SIM-000001',
      data: {},
      provenance: {
        created: {
          time: 1789290000000,
          actor: { kind: 'team', name: 'team12' },
          action: 'create_task',
          source: 'gp',
          version: 1,
        },
        changes: [],
      },
    })

    expect(provenByReadback).toBe(false)
  })
})
