import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuditEntry, AuditLogRepository, PersistenceContainer, StoredCase } from '@/persistence/port'
import {
  PATIENT_A,
  PATIENT_B,
  T0,
  auditEntry,
  protocol,
  staff,
  storedCase,
} from './fixtures'

export interface PersistenceHandle {
  container: PersistenceContainer
  dispose(): void
}

export function runPersistenceContract(label: string, open: () => PersistenceHandle): void {
  describe(`${label} persistence contract`, () => {
    const handles: PersistenceHandle[] = []

    function fresh(): PersistenceContainer {
      const handle = open()
      handles.push(handle)
      return handle.container
    }

    afterEach(() => {
      for (const handle of handles.splice(0)) handle.dispose()
    })

    it('returns null for an unknown case and round-trips a stored case', async () => {
      const { cases } = fresh()
      expect(await cases.get('missing')).toBeNull()
      const record = storedCase()
      await cases.put(record)
      expect(await cases.get(record.case.caseId)).toEqual(record)
    })

    it('preserves event-log order exactly, including ids that sort differently', async () => {
      const { cases } = fresh()
      const record = storedCase()
      expect(record.eventLog.map((e) => e.eventId)).toEqual([
        `${record.case.caseId}:z-first`,
        `${record.case.caseId}:a-second`,
        `${record.case.caseId}:m-third`,
      ])
      await cases.put(record)
      const loaded = await cases.get(record.case.caseId)
      expect(loaded?.eventLog.map((e) => e.eventId)).toEqual(record.eventLog.map((e) => e.eventId))
      expect(loaded?.eventLog).toEqual(record.eventLog)
    })

    it('replaces a case atomically so a later put is a complete record, not a merge', async () => {
      const { cases } = fresh()
      const first = storedCase({ ownershipState: 'TRANSFER_REQUESTED' })
      await cases.put(first)
      const second = storedCase({
        ownershipState: 'ACCEPTED',
        acceptingActor: staff,
        currentAccountableOwner: { teamId: 'gp', actorId: staff.id },
        eventLog: [
          first.eventLog[0]!,
          first.eventLog[1]!,
          {
            eventId: `${first.case.caseId}:accepted`,
            caseId: first.case.caseId,
            simulatorTime: T0 + 3,
            actor: staff.id,
            event: { type: 'TransferAccepted', actor: staff },
          },
        ],
      }, T0 + 10)
      await cases.put(second)
      expect(await cases.get(first.case.caseId)).toEqual(second)
    })

    it('lists with patient, owner, ownership and closure filters', async () => {
      const { cases } = fresh()
      const hospitalOpen = storedCase({
        caseId: 'case-SIM-000001-a',
        patientId: PATIENT_A,
        currentAccountableOwner: { teamId: 'hospital' },
        ownershipState: 'TRANSFER_REQUESTED',
        closureState: 'RESULT_AVAILABLE',
      })
      const gpAccepted = storedCase({
        caseId: 'case-SIM-000001-b',
        patientId: PATIENT_A,
        currentAccountableOwner: { teamId: 'gp', actorId: staff.id },
        acceptingActor: staff,
        ownershipState: 'ACCEPTED',
        closureState: 'PLAN_RECORDED',
        deadlines: { ackDeadlineAt: T0 + 30 * 60_000 },
      })
      const otherPatient = storedCase({
        caseId: 'case-SIM-000002-a',
        patientId: PATIENT_B,
        currentAccountableOwner: { teamId: 'hospital' },
        ownershipState: 'ORDERER_OWNS',
        closureState: 'RESULT_AVAILABLE',
        deadlines: { ackDeadlineAt: null },
      })
      await cases.put(hospitalOpen)
      await cases.put(gpAccepted)
      await cases.put(otherPatient)

      const byPatient = await cases.list({ patientId: PATIENT_A })
      expect(byPatient.total).toBe(2)
      expect(byPatient.items.map((i) => i.case.caseId).sort()).toEqual([
        'case-SIM-000001-a',
        'case-SIM-000001-b',
      ])

      const byOwner = await cases.list({ ownerTeamId: 'gp' })
      expect(byOwner.total).toBe(1)
      expect(byOwner.items[0]?.case.caseId).toBe('case-SIM-000001-b')

      const byOwnership = await cases.list({ ownershipState: 'TRANSFER_REQUESTED' })
      expect(byOwnership.total).toBe(1)
      expect(byOwnership.items[0]?.case.caseId).toBe('case-SIM-000001-a')

      const byClosure = await cases.list({ closureState: 'PLAN_RECORDED' })
      expect(byClosure.total).toBe(1)
      expect(byClosure.items[0]?.case.caseId).toBe('case-SIM-000001-b')
    })

    it('overdueAt returns exactly outstanding acknowledgements past that simulator time', async () => {
      const { cases } = fresh()
      const deadline = T0 + 30 * 60_000
      const now = deadline + 1

      const overdueRequested = storedCase({
        caseId: 'case-SIM-000001-overdue',
        ownershipState: 'TRANSFER_REQUESTED',
        acceptingActor: null,
        deadlines: { ackDeadlineAt: deadline },
      })
      const overdueUnavailable = storedCase({
        caseId: 'case-SIM-000001-away',
        ownershipState: 'OWNER_UNAVAILABLE',
        acceptingActor: null,
        deadlines: { ackDeadlineAt: deadline },
      })
      const alreadyOverdueState = storedCase({
        caseId: 'case-SIM-000001-timedout',
        ownershipState: 'OVERDUE',
        acceptingActor: null,
        deadlines: { ackDeadlineAt: deadline },
      })
      const accepted = storedCase({
        caseId: 'case-SIM-000001-accepted',
        ownershipState: 'ACCEPTED',
        acceptingActor: staff,
        currentAccountableOwner: { teamId: 'gp', actorId: staff.id },
        deadlines: { ackDeadlineAt: deadline },
      })
      const declined = storedCase({
        caseId: 'case-SIM-000001-declined',
        ownershipState: 'DECLINED',
        acceptingActor: null,
        deadlines: { ackDeadlineAt: deadline },
      })
      const stillInsideDeadline = storedCase({
        caseId: 'case-SIM-000001-waiting',
        ownershipState: 'TRANSFER_REQUESTED',
        acceptingActor: null,
        deadlines: { ackDeadlineAt: now + 1 },
      })
      const noDeadline = storedCase({
        caseId: 'case-SIM-000001-open',
        ownershipState: 'ORDERER_OWNS',
        acceptingActor: null,
        deadlines: { ackDeadlineAt: null },
      })
      const dueExactlyNow = storedCase({
        caseId: 'case-SIM-000001-exact',
        ownershipState: 'TRANSFER_REQUESTED',
        acceptingActor: null,
        deadlines: { ackDeadlineAt: now },
      })

      for (const record of [
        overdueRequested,
        overdueUnavailable,
        alreadyOverdueState,
        accepted,
        declined,
        stillInsideDeadline,
        noDeadline,
        dueExactlyNow,
      ]) {
        await cases.put(record)
      }

      const result = await cases.list({ overdueAt: now })
      expect(result.items.map((i) => i.case.caseId).sort()).toEqual([
        'case-SIM-000001-away',
        'case-SIM-000001-exact',
        'case-SIM-000001-overdue',
        'case-SIM-000001-timedout',
      ])
      expect(result.total).toBe(4)
    })

    it('pagination over limit/offset neither drops nor duplicates', async () => {
      const { cases } = fresh()
      const records: StoredCase[] = []
      for (let i = 0; i < 7; i += 1) {
        const record = storedCase({
          caseId: `case-SIM-000001-p${String(i).padStart(2, '0')}`,
          ownershipState: 'TRANSFER_REQUESTED',
          acceptingActor: null,
          deadlines: { ackDeadlineAt: T0 },
        })
        records.push(record)
        await cases.put(record)
      }

      const pageSize = 3
      const seen: string[] = []
      const firstPage = await cases.list({ limit: pageSize, offset: 0 })
      seen.push(...firstPage.items.map((i) => i.case.caseId))
      let offset = firstPage.items.length
      while (offset < firstPage.total) {
        const page = await cases.list({ limit: pageSize, offset })
        expect(page.total).toBe(firstPage.total)
        if (page.items.length === 0) break
        seen.push(...page.items.map((i) => i.case.caseId))
        offset += page.items.length
      }

      expect(firstPage.total).toBe(7)
      expect(seen).toHaveLength(7)
      expect(new Set(seen).size).toBe(7)
      expect(seen).toEqual([...seen].sort((a, b) => a.localeCompare(b)))
    })

    it('audit append and query preserve append order and filter without mutation', async () => {
      const { audit } = fresh()
      const first = auditEntry({
        entryId: 'aud-1',
        recordedAt: 100,
        simulatorTime: T0,
        action: 'proposed',
      })
      const second = auditEntry({
        entryId: 'aud-2',
        recordedAt: 200,
        simulatorTime: T0 + 1,
        action: 'approved',
        actor: { kind: 'system', name: 'approval-gate' },
      })
      const otherCase = auditEntry({
        entryId: 'aud-3',
        caseId: 'case-SIM-000002-x',
        recordedAt: 300,
        simulatorTime: T0 + 2,
        action: 'clock-tick',
        actor: { kind: 'system', name: 'clock' },
      })
      await audit.append(first)
      await audit.append(second)
      await audit.append(otherCase)

      const all = await audit.query({})
      expect(all.total).toBe(3)
      expect(all.items.map((e) => e.entryId)).toEqual(['aud-1', 'aud-2', 'aud-3'])

      const byCase = await audit.query({ caseId: first.caseId })
      expect(byCase.total).toBe(2)
      expect(byCase.items.map((e) => e.entryId)).toEqual(['aud-1', 'aud-2'])

      const since = await audit.query({ since: 200 })
      expect(since.items.map((e) => e.entryId)).toEqual(['aud-2', 'aud-3'])

      const byActor = await audit.query({ actorId: staff.id })
      expect(byActor.items.map((e) => e.entryId)).toEqual(['aud-1'])
      expect(byActor.items[0]?.actor).toEqual(staff)
      if (byActor.items[0] && 'attribution' in byActor.items[0].actor) {
        expect(byActor.items[0].actor.attribution).toBe('app-side')
      }

      const page = await audit.query({ limit: 1, offset: 1 })
      expect(page.total).toBe(3)
      expect(page.items.map((e) => e.entryId)).toEqual(['aud-2'])
    })

    it('exposes only append and query on the audit repository — no update or delete path', () => {
      const { audit } = fresh()
      const proto = Object.getPrototypeOf(audit) as object
      const own = Object.getOwnPropertyNames(audit)
      const inherited = Object.getOwnPropertyNames(proto)
      const names = new Set([...own, ...inherited])
      expect(names.has('append')).toBe(true)
      expect(names.has('query')).toBe(true)
      for (const forbidden of ['update', 'delete', 'remove', 'splice', 'put', 'save', 'overwrite']) {
        expect(names.has(forbidden), `audit repository must not expose ${forbidden}`).toBe(false)
      }
      const keys: Array<keyof AuditLogRepository> = ['append', 'query']
      expect(keys).toHaveLength(2)
    })

    it('returned audit rows are copies — mutating them does not change the log', async () => {
      const { audit } = fresh()
      await audit.append(auditEntry({ entryId: 'aud-copy', detail: 'handover-proposed' }))
      const first = await audit.query({})
      first.items[0]!.detail = 'tampered'
      first.items[0]!.subject.resourceId = 'tampered'
      const again = await audit.query({})
      expect(again.items[0]?.detail).toBe('handover-proposed')
      expect(again.items[0]?.subject.resourceId).toBe('blood-v1-SIM-000001-crp-5')
    })

    it('keeps recordedAt (wall-clock) distinct from simulatorTime', async () => {
      const { audit } = fresh()
      const entry = auditEntry({
        entryId: 'aud-times',
        recordedAt: 9_000,
        simulatorTime: T0,
      })
      await audit.append(entry)
      const loaded = (await audit.query({ caseId: entry.caseId })).items[0]
      expect(loaded?.recordedAt).toBe(9_000)
      expect(loaded?.simulatorTime).toBe(T0)
      expect(loaded?.recordedAt).not.toBe(loaded?.simulatorTime)
    })

    it('round-trips protocols by id and lists them stably', async () => {
      const { protocols } = fresh()
      expect(await protocols.get('missing')).toBeNull()
      const v2 = { ...protocol, id: 'proto-v2', supersedes: 'proto-v1' }
      await protocols.put(protocol)
      await protocols.put(v2)
      expect(await protocols.get(protocol.id)).toEqual(protocol)
      const listed = await protocols.list()
      expect(listed.map((p) => p.id)).toEqual(['proto-v1', 'proto-v2'])
    })

    it('concurrent puts of the same case finish as one complete record, never a torn mix', async () => {
      const { cases } = fresh()
      const caseId = 'case-SIM-000001-race'
      const writerA = storedCase({
        caseId,
        ownershipState: 'TRANSFER_REQUESTED',
        acceptingActor: null,
        eventLog: [
          {
            eventId: 'only-a-1',
            caseId,
            simulatorTime: T0,
            actor: 'a',
            event: { type: 'ClockTick', now: T0 },
          },
          {
            eventId: 'only-a-2',
            caseId,
            simulatorTime: T0 + 1,
            actor: 'a',
            event: { type: 'ClockTick', now: T0 + 1 },
          },
        ],
      }, 1)
      const writerB = storedCase({
        caseId,
        ownershipState: 'ACCEPTED',
        acceptingActor: staff,
        currentAccountableOwner: { teamId: 'gp', actorId: staff.id },
        eventLog: [
          {
            eventId: 'only-b-1',
            caseId,
            simulatorTime: T0,
            actor: 'b',
            event: { type: 'TransferAccepted', actor: staff },
          },
        ],
      }, 2)

      await Promise.all([cases.put(writerA), cases.put(writerB)])
      const loaded = await cases.get(caseId)
      expect(loaded).not.toBeNull()
      const ids = loaded!.eventLog.map((e) => e.eventId)
      const isA = ids.join(',') === 'only-a-1,only-a-2' && loaded!.case.ownershipState === 'TRANSFER_REQUESTED'
      const isB = ids.join(',') === 'only-b-1' && loaded!.case.ownershipState === 'ACCEPTED'
      expect(isA || isB, 'result must be entirely writer A or entirely writer B').toBe(true)
      expect(loaded!.eventLog).toEqual(isA ? writerA.eventLog : writerB.eventLog)
    })

    it('rejects non-synthetic patient ids', async () => {
      const { cases } = fresh()
      await expect(cases.put(storedCase({ patientId: 'NHS-999' }))).rejects.toThrow(/SIM-/)
    })

    it('refuses to persist a secret-bearing payload', async () => {
      const { cases } = fresh()
      const poisoned = storedCase()
      const sneaky = poisoned as StoredCase & { case: CovenantCaseWithSecret }
      sneaky.case = { ...poisoned.case, ANIMA_SIM_API_KEY: 'must-never-be-stored' }
      await expect(cases.put(sneaky)).rejects.toThrow(/secret/i)
    })
  })
}

type CovenantCaseWithSecret = ReturnType<typeof storedCase>['case'] & { ANIMA_SIM_API_KEY: string }

const persistenceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../src/persistence')

export function persistenceSourceFiles(): string[] {
  return readdirSync(persistenceRoot)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(persistenceRoot, name))
}

export function readPersistenceSources(): string {
  return persistenceSourceFiles().map((file) => readFileSync(file, 'utf8')).join('\n')
}

export function expectAuditEntryShape(entry: AuditEntry): void {
  expect(Object.keys(entry.subject).sort()).toEqual(
    expect.arrayContaining(
      Object.keys(entry.subject).filter((k) => ['activityId', 'resourceId', 'resourceVersion'].includes(k)),
    ),
  )
  for (const key of Object.keys(entry.subject)) {
    expect(['activityId', 'resourceId', 'resourceVersion']).toContain(key)
  }
}
