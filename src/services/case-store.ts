import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Proposal, Snapshot } from '@/agents/schemas'
import type { ReceiptRow } from '@/api/contracts'
import type { CovenantCase, ProtocolVersion } from '@/domain/types'

export interface StoredCase {
  case: CovenantCase
  protocol: ProtocolVersion
  snapshot: Snapshot | null
  proposal: Proposal | null
  connection: {
    live: boolean
    world: string
    simulatorNow: number
    acceptSupported: boolean | null
  }
  eligibility: {
    ruleText: string
    ordererRuleText: string
    selectedResultId: string
    selectedResultVersion: number
  }
  replay: {
    label: 'Recorded simulator replay'
    world: string
    capturedAt: string
  } | null
  receipts: ReceiptRow[]
  hardStops: string[]
}

export class CaseStore {
  private readonly memory = new Map<string, StoredCase>()

  constructor(private readonly persistDir?: string) {}

  get(caseId: string): StoredCase | undefined {
    const cached = this.memory.get(caseId)
    if (cached) return cached
    if (!this.persistDir) return undefined
    const file = join(this.persistDir, `${safeId(caseId)}.json`)
    if (!existsSync(file)) return undefined
    const record = JSON.parse(readFileSync(file, 'utf8')) as StoredCase
    this.memory.set(caseId, record)
    return record
  }

  save(record: StoredCase): void {
    this.memory.set(record.case.caseId, record)
    if (!this.persistDir) return
    mkdirSync(this.persistDir, { recursive: true })
    writeFileSync(join(this.persistDir, `${safeId(record.case.caseId)}.json`), JSON.stringify(record), 'utf8')
  }
}

function safeId(caseId: string): string {
  return caseId.replace(/[^a-zA-Z0-9._-]/g, '_')
}
