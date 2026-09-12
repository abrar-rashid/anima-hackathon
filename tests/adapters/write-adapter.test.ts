import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { StaffIdentity } from '@/domain/types'

const DUMMY_KEY = 'test-anima-sim-key'
const SIM_NOW = 1789286400000

const staff: StaffIdentity = {
  id: 'staff-test-1',
  name: 'Test Clinician',
  role: 'gp',
  teamId: 'gp',
  attribution: 'app-side',
}

const createdResource = {
  id: 'r-created-1',
  kind: 'task',
  title: 'Review abnormal blood result',
  status: 'open',
  owner: 'community',
  visibleTo: ['community', 'gp'],
  priority: 'routine',
  createdAt: SIM_NOW,
  data: {},
  version: 1,
  patientId: 'SIM-000001',
  provenance: {
    created: {
      time: SIM_NOW,
      actor: { kind: 'team', name: 'team12' },
      action: 'create_task',
      source: 'community',
      version: 1,
    },
    changes: [],
  },
}

const openapi = JSON.parse(
  readFileSync(path.join(process.cwd(), 'fixtures/openapi.redacted.json'), 'utf8'),
) as Record<string, unknown>

function actionTypeEnum(doc: Record<string, unknown>): [string, ...string[]] {
  const components = doc.components as {
    schemas?: { Action?: { properties?: { type?: { enum?: string[] } } } }
  }
  const values = components.schemas?.Action?.properties?.type?.enum ?? []
  if (values.length < 1) throw new Error('Action.type enum missing')
  return values as [string, ...string[]]
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function loadWrite() {
  vi.stubEnv('ANIMA_SIM_API_KEY', DUMMY_KEY)
  vi.stubEnv('ANIMA_SIM_BASE_URL', 'https://sim.example.test')
  const { createAnimaClient } = await import('@/adapters/anima/client')
  const { AnimaWriteAdapter, IdempotencyConflict, StaleVersionError, clientRequestIdFrom } =
    await import('@/adapters/anima/write-adapter')
  return {
    write: new AnimaWriteAdapter(createAnimaClient()),
    IdempotencyConflict,
    StaleVersionError,
    clientRequestIdFrom,
  }
}

describe('write-adapter', () => {
  it('HTTP 200 maps to a SubmissionReceipt and not a domain state', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify(createdResource), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { write, clientRequestIdFrom } = await loadWrite()
    const idempotencyKey = 'team12|SIM-000001|blood-v1-SIM-000001-crp-5|1|v1|create_task|community'

    const receipt = await write.executeApprovedAction({
      site: 'community',
      actionName: 'create_task',
      payload: {
        type: 'create_task',
        patientId: 'SIM-000001',
        title: 'Review abnormal blood result',
        text: 'Follow up out-of-range CRP',
      },
      staffIdentity: staff,
      expectedSourceVersions: [{ id: 'blood-v1-SIM-000001-crp-5', version: 1 }],
      idempotencyKey,
    })

    expect(receipt.httpStatus).toBe(200)
    expect(receipt.resourceId).toBe('r-created-1')
    expect(receipt.version).toBe(1)
    expect(receipt.simulatorTime).toBe(SIM_NOW)
    expect(receipt.activity).toEqual({
      actorKind: 'team',
      actorName: 'team12',
      action: 'create_task',
    })
    expect(receipt).not.toHaveProperty('submissionState')
    expect(receipt).not.toHaveProperty('ownershipState')
    expect(receipt).not.toHaveProperty('closureState')
    expect(JSON.stringify(receipt)).not.toContain('SUBMITTED')
    expect(JSON.stringify(receipt)).not.toContain('VISIBLE_DOWNSTREAM')

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    const init = call?.[1]
    const headers = new Headers((init as RequestInit | undefined)?.headers)
    expect(headers.get('Idempotency-Key')).toBe(idempotencyKey)
    const body = JSON.parse(String((init as RequestInit | undefined)?.body)) as {
      type: string
      clientRequestId: string
    }
    expect(body.type).toBe('create_task')
    expect(body.clientRequestId).toBe(clientRequestIdFrom(idempotencyKey))
    expect(body.clientRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    )

    const ActionSchema = z.object({
      type: z.enum(actionTypeEnum(openapi)),
      clientRequestId: z.string(),
      patientId: z.string(),
      title: z.string(),
      text: z.string(),
    })
    expect(ActionSchema.parse(body).type).toBe('create_task')
    expect(String((init as RequestInit | undefined)?.body)).not.toContain(staff.name)
  })

  it('throws StaleVersionError on 409 stale version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: 'stale_version', message: 'Stale version' }), {
          status: 409,
        })
      }),
    )
    const { write, StaleVersionError } = await loadWrite()
    await expect(
      write.executeApprovedAction({
        site: 'gp',
        actionName: 'complete',
        payload: { type: 'complete', resourceId: 'r-2', expectedVersion: 1 },
        staffIdentity: staff,
        expectedSourceVersions: [{ id: 'r-2', version: 1 }],
        idempotencyKey: 'team12|SIM-000001|r-2|1|v1|complete|gp',
      }),
    ).rejects.toBeInstanceOf(StaleVersionError)
  })

  it('throws IdempotencyConflict carrying the original resource id on 409 idempotency conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: 'idempotency_conflict',
            message: 'Idempotency conflict',
            id: 'r-original-9',
          }),
          { status: 409 },
        )
      }),
    )
    const { write, IdempotencyConflict } = await loadWrite()
    try {
      await write.executeApprovedAction({
        site: 'community',
        actionName: 'create_task',
        payload: { type: 'create_task', patientId: 'SIM-000001', title: 'Review' },
        staffIdentity: staff,
        expectedSourceVersions: [],
        idempotencyKey: 'same-key',
      })
      throw new Error('expected IdempotencyConflict')
    } catch (error) {
      expect(error).toBeInstanceOf(IdempotencyConflict)
      expect((error as { originalResourceId?: string }).originalResourceId).toBe('r-original-9')
    }
  })
})
