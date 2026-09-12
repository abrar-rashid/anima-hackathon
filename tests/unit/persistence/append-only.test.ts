import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AuditLogRepository } from '@/persistence/port'
import { persistenceSourceFiles, readPersistenceSources } from './contract'

type ForbiddenAuditKeys = Extract<keyof AuditLogRepository, 'update' | 'delete' | 'remove' | 'put'>
type AssertNoMutate = ForbiddenAuditKeys extends never ? true : never
const auditIsAppendOnly: AssertNoMutate = true

describe('append-only audit log — absence of a mutate or delete path', () => {
  it('AuditLogRepository has only append and query', () => {
    expect(auditIsAppendOnly).toBe(true)
    const keys: Array<keyof AuditLogRepository> = ['append', 'query']
    expect(keys.sort()).toEqual(['append', 'query'])
  })

  it('persistence sources never import Anima adapters, write ports, or call fetch', () => {
    const src = readPersistenceSources()
    expect(src).not.toMatch(/\bfetch\s*\(/)
    expect(src).not.toMatch(/@\/adapters\/anima/)
    expect(src).not.toMatch(/@\/ports\/anima-write-port/)
    expect(src).not.toMatch(/ANIMA_SIM_API_KEY\s*[:=]/)
  })

  it('no implementation issues UPDATE/DELETE against audit_entries except abort triggers', () => {
    for (const file of persistenceSourceFiles()) {
      const stripped = readFileSync(file, 'utf8')
        .replace(/CREATE TRIGGER[\s\S]*?END;/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      expect(stripped, file).not.toMatch(/UPDATE\s+audit_entries/i)
      expect(stripped, file).not.toMatch(/DELETE\s+FROM\s+audit_entries/i)
      expect(stripped, file).not.toMatch(/audit(?:Log|Entries|_entries)?\.(?:splice|pop|shift|length\s*=)/)
    }
  })

  it('schema installs BEFORE UPDATE/DELETE abort triggers on audit_entries', () => {
    const src = readPersistenceSources()
    expect(src).toMatch(/BEFORE UPDATE ON audit_entries/)
    expect(src).toMatch(/BEFORE DELETE ON audit_entries/)
    expect(src).toMatch(/RAISE\(\s*ABORT/)
  })
})
