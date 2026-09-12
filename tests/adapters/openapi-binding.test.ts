import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  assertActionSupported,
  bindOperations,
  UnsupportedAction,
} from '@/adapters/anima/openapi-binding'

const openapi = JSON.parse(
  readFileSync(path.join(process.cwd(), 'fixtures/openapi.redacted.json'), 'utf8'),
) as Record<string, unknown>

function actionTypeEnum(doc: Record<string, unknown>): [string, ...string[]] {
  const components = doc.components as {
    schemas?: { Action?: { properties?: { type?: { enum?: string[] } } } }
  }
  const values = components.schemas?.Action?.properties?.type?.enum ?? []
  if (values.length < 1) throw new Error('Action.type enum missing from OpenAPI fixture')
  return values as [string, ...string[]]
}

function capturedCreateTaskPayload(doc: Record<string, unknown>): unknown {
  const paths = doc.paths as {
    [path: string]: {
      post?: {
        requestBody?: {
          content?: { 'application/json'?: { examples?: { task?: { value?: unknown } } } }
        }
      }
    }
  }
  return paths['/api/sites/{site}/actions']?.post?.requestBody?.content?.['application/json']
    ?.examples?.task?.value
}

describe('openapi-binding', () => {
  it('validates captured create_task payload against Action schema enums from OpenAPI', () => {
    const ActionSchema = z.object({
      type: z.enum(actionTypeEnum(openapi)),
      patientId: z.string(),
      title: z.string().min(1).max(500),
      text: z.string(),
    })

    const payload = capturedCreateTaskPayload(openapi)
    const parsed = ActionSchema.parse(payload)
    expect(parsed.type).toBe('create_task')
    expect(parsed.patientId.startsWith('SIM-')).toBe(true)
    expect(parsed.title.length).toBeGreaterThan(0)
  })

  it('bindOperations reads create_task, Idempotency-Key and site enum from the fixture', () => {
    const binding = bindOperations(openapi)
    expect(binding.actions.has('create_task')).toBe(true)
    expect(binding.actions.has('accept')).toBe(true)
    expect(binding.hasIdempotencyHeader).toBe(true)
    expect(binding.sites).toEqual(
      expect.arrayContaining(['gp', 'hospital', 'diagnostics', 'community', 'pharmacy']),
    )
  })

  it('assertActionSupported throws UnsupportedAction when the action is absent', () => {
    const binding = bindOperations(openapi)
    expect(() => assertActionSupported(binding, 'create_task')).not.toThrow()
    expect(() => assertActionSupported(binding, 'not_a_live_action')).toThrow(UnsupportedAction)
    try {
      assertActionSupported(binding, 'not_a_live_action')
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedAction)
      expect((error as Error).name).toBe('UnsupportedAction')
    }
  })
})
