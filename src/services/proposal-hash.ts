function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      const item = record[key]
      if (item !== undefined) next[key] = canonicalize(item)
    }
    return next
  }
  return value
}

export function hashProposal(proposal: unknown): string {
  const encoded = JSON.stringify(canonicalize(proposal))
  let hash = 2166136261
  for (let i = 0; i < encoded.length; i += 1) {
    hash ^= encoded.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `p${(hash >>> 0).toString(16)}`
}
