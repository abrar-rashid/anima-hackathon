import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CaseStore } from '@/services/case-store'
import { CASE_ID, heroProposal, openedCase, persist, protocol } from './helpers'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('CaseStore', () => {
  it('returns undefined for an unknown case and round-trips a saved record in memory', () => {
    const store = new CaseStore()
    expect(store.get('missing')).toBeUndefined()
    persist(store, openedCase(), heroProposal())
    const loaded = store.get(CASE_ID)
    expect(loaded?.case.caseId).toBe(CASE_ID)
    expect(loaded?.proposal?.actions[0]?.kind).toBe('create_task')
    expect(loaded?.protocol.id).toBe(protocol.id)
  })

  it('reloads a case from the JSON file after a fresh store instance', () => {
    const dir = mkdtempSync(join(tmpdir(), 'covenant-store-'))
    dirs.push(dir)
    const first = new CaseStore(dir)
    persist(first, openedCase(), heroProposal())
    const second = new CaseStore(dir)
    expect(second.get(CASE_ID)?.case.patientId).toBe('SIM-000001')
    expect(second.get(CASE_ID)?.case.sourceResultId).toBe('blood-v1-SIM-000001-crp-5')
  })
})
