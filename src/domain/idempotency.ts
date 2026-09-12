import { createHash } from 'node:crypto'

export function idempotencyKey(i: {
  team: string
  patientId: string
  resultId: string
  resultVersion: number
  protocolVersion: string
  actionKind: string
  destination: string
}): string {
  return [
    i.team,
    i.patientId,
    i.resultId,
    String(i.resultVersion),
    i.protocolVersion,
    i.actionKind,
    i.destination,
  ].join('|')
}

export function clientRequestIdFrom(key: string): string {
  const digest = createHash('sha256').update(key).digest()
  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x80
  bytes[8] = (bytes[8]! & 0x0f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
