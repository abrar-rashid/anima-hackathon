import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CaseStore, StoredCase } from '@/services/case-store'

/**
 * Read persisted covenants through the case store. The store has no list API,
 * so filenames are discovered on disk and each record is loaded via `store.get`.
 * Synthetic SIM-* patients only. Never writes.
 */
export function listStoredCases(store: CaseStore): StoredCase[] {
  const dir = join(process.cwd(), '.data', 'cases')
  if (!existsSync(dir)) return []

  const seen = new Set<string>()
  const records: StoredCase[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const raw = JSON.parse(readFileSync(join(dir, name), 'utf8')) as StoredCase
    const caseId = raw.case?.caseId
    const patientId = raw.case?.patientId
    if (!caseId || !patientId?.startsWith('SIM-') || seen.has(caseId)) continue
    const stored = store.get(caseId) ?? raw
    if (!stored.case.patientId.startsWith('SIM-')) continue
    seen.add(caseId)
    records.push(stored)
  }
  return records.sort((a, b) => a.case.caseId.localeCompare(b.case.caseId))
}
