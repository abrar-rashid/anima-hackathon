import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryPersistence } from '@/persistence/memory'
import type { PersistenceContainer } from '@/persistence/port'
import { runPersistenceContract } from './contract'
import { auditEntry, storedCase } from './fixtures'

runPersistenceContract('memory', () => ({
  container: createMemoryPersistence(),
  dispose() {
    /* in-memory */
  },
}))

describe('memory persistence determinism', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not call Date.now or Math.random', async () => {
    const now = vi.spyOn(Date, 'now')
    const rand = vi.spyOn(Math, 'random')
    const store: PersistenceContainer = createMemoryPersistence()
    await store.cases.put(storedCase())
    await store.audit.append(auditEntry())
    await store.protocols.put({
      id: 'proto-v1',
      supersedes: null,
      receiverMode: 'ACCOUNTABLE_TEAM',
      ackDeadlineMinutes: 30,
      fallbackTeamId: 'gp-duty',
      exceptionRoute: 'duty-clinician-task',
      dedupeWindowMinutes: 15,
      clinicalPolicyRefs: [],
      approval: { status: 'DRAFT', approvers: [], rollbackTarget: null },
    })
    await store.cases.list({ overdueAt: 1 })
    await store.audit.query({})
    expect(now).not.toHaveBeenCalled()
    expect(rand).not.toHaveBeenCalled()
  })
})
