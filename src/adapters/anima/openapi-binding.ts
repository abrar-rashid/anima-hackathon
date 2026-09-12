import type { OpenAPIDocument } from '@/ports/anima-read-port'

export class UnsupportedAction extends Error {
  constructor(public readonly action: string) {
    super(`UnsupportedAction: ${action}`)
    this.name = 'UnsupportedAction'
  }
}

export interface OperationBinding {
  actions: Set<string>
  hasIdempotencyHeader: boolean
  sites: string[]
}

type Parameter = {
  name?: string
  in?: string
  schema?: { enum?: string[] }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function bindOperations(doc: OpenAPIDocument): OperationBinding {
  const components = asRecord(doc.components)
  const schemas = asRecord(components.schemas)
  const actionSchema = asRecord(schemas.Action)
  const properties = asRecord(actionSchema.properties)
  const type = asRecord(properties.type)
  const actions = new Set<string>(Array.isArray(type.enum) ? (type.enum as string[]) : [])

  const paths = asRecord(doc.paths)
  const actionPath = asRecord(paths['/api/sites/{site}/actions'])
  const post = asRecord(actionPath.post)
  const parameters = [
    ...(Array.isArray(actionPath.parameters) ? (actionPath.parameters as Parameter[]) : []),
    ...(Array.isArray(post.parameters) ? (post.parameters as Parameter[]) : []),
  ]

  const hasIdempotencyHeader = parameters.some(
    (parameter) => parameter.name === 'Idempotency-Key' && parameter.in === 'header',
  )

  const siteParam = parameters.find((parameter) => parameter.name === 'site' && parameter.in === 'path')
  const sites = siteParam?.schema?.enum ?? []

  return { actions, hasIdempotencyHeader, sites }
}

export function assertActionSupported(binding: OperationBinding, action: string): void {
  if (!binding.actions.has(action)) {
    throw new UnsupportedAction(action)
  }
}
