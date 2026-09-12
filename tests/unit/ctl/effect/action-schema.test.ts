import { describe, expect, it } from 'vitest'
import openapi from '../../../fixtures/live/openapi.json'
import { clientRequestIdFrom, idempotencyKey } from '@/domain/idempotency'
import {
  loadLiveActionSchema,
  parseLiveActionSchema,
  resetLiveActionSchemaCache,
} from '@/ctl/effect/action-schema'

/** The pattern the spec verified against the live API. A plain string returns 400. */
const SPEC_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('parseLiveActionSchema against the captured document', () => {
  it('discovers the action types from the document rather than a list of our own', () => {
    const schema = parseLiveActionSchema(openapi)!

    expect(schema.actionTypes).toHaveLength(43)
    for (const action of ['create_task', 'process_document', 'accept', 'complete', 'order_test']) {
      expect(schema.actionTypes).toContain(action)
    }
    expect(schema.actionTypes).not.toContain('close_loop')
  })

  it('discovers the fields, targets and document commands the API exposes', () => {
    const schema = parseLiveActionSchema(openapi)!

    expect(schema.fields).toContain('clientRequestId')
    expect(schema.fields).toContain('expectedVersion')
    expect(schema.fields).toContain('documentCommand')
    expect(schema.fields).not.toContain('priority')
    expect(schema.targets).toContain('gp')
    expect(schema.documentCommands).toEqual(['send', 'assign', 'review', 'file', 'annotate'])
  })

  it('returns null for a document with no Action schema, so callers cannot assume support', () => {
    expect(parseLiveActionSchema({})).toBeNull()
    expect(parseLiveActionSchema({ components: { schemas: { Action: {} } } })).toBeNull()
  })

  it('returns null when the document cannot be fetched, rather than guessing', async () => {
    resetLiveActionSchemaCache()
    const loaded = await loadLiveActionSchema(async () => {
      throw new Error('HTTP 502')
    })
    expect(loaded).toBeNull()
    resetLiveActionSchemaCache()
  })
})

describe('clientRequestId format', () => {
  const key = idempotencyKey({
    team: 'team12',
    patientId: 'SIM-000001',
    resultId: 'discharge-summary-example',
    resultVersion: 1,
    protocolVersion: 'ctl-effect-map-1',
    actionKind: 'process_document',
    destination: 'gp',
  })

  it('matches the UUID pattern the spec verified against the live API', () => {
    expect(clientRequestIdFrom(key)).toMatch(SPEC_UUID)
  })

  it('matches the pattern published by the live document itself', () => {
    const pattern = parseLiveActionSchema(openapi)!.clientRequestIdPattern!
    expect(clientRequestIdFrom(key)).toMatch(new RegExp(pattern))
  })

  it('holds for every action type we might propose, not just one key', () => {
    const schema = parseLiveActionSchema(openapi)!
    for (const actionType of schema.actionTypes) {
      const uuid = clientRequestIdFrom(
        idempotencyKey({
          team: 'team12',
          patientId: 'SIM-000006',
          resultId: 'r-6738',
          resultVersion: 3,
          protocolVersion: 'ctl-effect-map-1',
          actionKind: actionType,
          destination: 'hospital',
        }),
      )
      expect(uuid, actionType).toMatch(SPEC_UUID)
    }
  })

  it('is deterministic, which is what makes a replay idempotent', () => {
    expect(clientRequestIdFrom(key)).toBe(clientRequestIdFrom(key))
    expect(clientRequestIdFrom(`${key}|x`)).not.toBe(clientRequestIdFrom(key))
  })

  it('rejects the raw key, showing why the hash is needed', () => {
    expect(key).not.toMatch(SPEC_UUID)
  })
})
