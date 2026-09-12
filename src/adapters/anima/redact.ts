const LEAF_KEYS = new Set(['text', 'body', 'clinicalDetails', 'detail'])

function redactValue(value: unknown, key: string | undefined, inSections: boolean): unknown {
  if (typeof value === 'string') {
    if (/Bearer\s+\S+/.test(value)) return '[redacted]'
    if (key && LEAF_KEYS.has(key)) return '[redacted]'
    if (inSections) return '[redacted]'
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, undefined, inSections || key === 'sections'))
  }
  if (value && typeof value === 'object') {
    const nextInSections = inSections || key === 'sections'
    const out: Record<string, unknown> = {}
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = redactValue(child, childKey, nextInSections)
    }
    return out
  }
  return value
}

export function redact(json: unknown): unknown {
  return redactValue(json, undefined, false)
}
