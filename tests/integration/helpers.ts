import { expect } from 'vitest'
import { ELIGIBILITY_RULE_TEXT } from '@/domain/eligibility'
import type { FakeRead } from '@/adapters/fake/anima-read'
import type { FakeWrite } from '@/adapters/fake/anima-write'
import type { CaseSnapshot } from '@/api/contracts'
import type { AppContainer } from '@/services/container'
import type { CaseStore } from '@/services/case-store'
import { apply, NOW, staff } from '../unit/services/helpers'

export { CASE_ID, classification, NOW, PATIENT_ID, RESULT_ID, staff } from '../unit/services/helpers'

export async function fakeContainer(): Promise<AppContainer> {
  const { getContainer, resetContainer } = await import('@/services/container')
  resetContainer()
  return getContainer()
}

export function writePort(container: AppContainer): FakeWrite {
  return container.write as FakeWrite
}

export function readPort(container: AppContainer): FakeRead {
  return container.read as FakeRead
}

export function assertOwnerPresent(state: { currentAccountableOwner: { teamId: string } }): void {
  expect(state.currentAccountableOwner.teamId.length).toBeGreaterThan(0)
}

export function assertNoClinicalInference(snapshot: CaseSnapshot): void {
  expect(snapshot.eligibility.ruleText).toBe(ELIGIBILITY_RULE_TEXT)
  expect(snapshot.case.sourceClassification.rule).toBe('source-reference-range')
  expect(snapshot.case.sourceClassification.ruleText).toBe(ELIGIBILITY_RULE_TEXT)
  expect(snapshot.proposal?.prohibited).toEqual(
    expect.arrayContaining([
      { field: 'review', reason: 'Clinician decision required' },
      { field: 'plan', reason: 'Clinician decision required' },
      { field: 'urgency', reason: 'Clinician decision required' },
    ]),
  )
}

export function recordHumanClinicalPath(store: CaseStore, caseId: string): void {
  const stored = store.get(caseId)
  if (!stored) throw new Error(`case-not-found:${caseId}`)
  const proto = stored.protocol
  let state = stored.case
  state = apply(state, { type: 'ClinicalReviewRecorded', actor: staff }, proto, `${caseId}:review`)
  state = apply(
    state,
    {
      type: 'PlanRecorded',
      actor: staff,
      planRef: {
        site: 'hospital',
        resourceId: 'plan-1',
        resourceVersion: 1,
        observedAtSimulatorTime: NOW,
        eventType: 'PlanRecorded',
      },
    },
    proto,
    `${caseId}:plan`,
  )
  state = apply(
    state,
    {
      type: 'PatientContactEvidenced',
      evidence: {
        site: 'gp',
        resourceId: 'msg-1',
        resourceVersion: 1,
        observedAtSimulatorTime: NOW,
        eventType: 'PatientContactEvidenced',
      },
    },
    proto,
    `${caseId}:contact`,
  )
  store.save({ ...stored, case: state })
}

export function scriptProvenanceOnTaskCreate(read: FakeRead): void {
  const original = read.addRecord.bind(read)
  read.addRecord = (patientId, record) => {
    if (record.kind === 'task' && record.id.startsWith('fake-task-') && !record.provenance) {
      original(patientId, {
        ...record,
        provenance: {
          created: {
            actor: { kind: 'team', name: 'team12' },
            time: record.createdAt,
            version: record.version,
            action: 'create_task',
          },
        },
      })
      return
    }
    original(patientId, record)
  }
}

export function attachActivityEvidence(read: FakeRead, patientId: string, resourceId: string): void {
  const record = (read.records.get(patientId) ?? []).find((item) => item.id === resourceId)
  if (record) {
    read.addRecord(patientId, {
      ...record,
      provenance: {
        created: {
          actor: { kind: 'team', name: 'team12' },
          time: record.createdAt,
          version: record.version,
          action: 'create_task',
        },
      },
    })
  }
  read.addEvent({
    id: `act-${resourceId}`,
    time: record?.createdAt ?? NOW,
    type: 'create_task',
    actor: 'team12',
    resourceId,
    patientId,
    detail: 'created',
  })
}

export function createdFakeTasks(read: FakeRead, patientId: string) {
  return (read.records.get(patientId) ?? []).filter(
    (item) => item.kind === 'task' && item.id.startsWith('fake-task-'),
  )
}
