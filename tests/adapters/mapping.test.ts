import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bloodReportFrom,
  taskReadbackFrom,
  toEvidenceRef,
  toVersionedRecord,
} from '@/adapters/anima/mapping'

const gpView = JSON.parse(
  readFileSync(path.join(process.cwd(), 'fixtures/view.gp.SIM-000001.json'), 'utf8'),
) as { resources: Record<string, unknown>[] }

const diagnosticsView = JSON.parse(
  readFileSync(path.join(process.cwd(), 'fixtures/view.diagnostics.SIM-000001.json'), 'utf8'),
) as { resources: Record<string, unknown>[] }

const gpConnect = JSON.parse(
  readFileSync(path.join(process.cwd(), 'fixtures/gp-connect.SIM-000001.json'), 'utf8'),
) as Record<string, unknown>

const task = gpView.resources.find((resource) => resource.id === 'r-2')
if (!task) throw new Error('expected task r-2 in gp view fixture')

const crp = diagnosticsView.resources.find((resource) => resource.id === 'blood-v1-SIM-000001-crp-5')
if (!crp) throw new Error('expected CRP report in diagnostics fixture')

describe('mapping', () => {
  it('mapping preserves id, version, actor and time', () => {
    const record = toVersionedRecord(task)
    expect(record.id).toBe('r-2')
    expect(record.version).toBe(1)
    expect(record.kind).toBe('task')
    expect(record.patientId).toBe('SIM-000001')
    expect(record.status).toBe('open')
    expect(record.createdAt).toBe(1789200000000)

    const evidence = toEvidenceRef(task, 'gp', 1789286400000)
    expect(evidence.resourceId).toBe('r-2')
    expect(evidence.resourceVersion).toBe(1)
    expect(evidence.site).toBe('gp')
    expect(evidence.observedAtSimulatorTime).toBe(1789286400000)
    expect(evidence.activityId).toBe('generate_history@1')
    expect(evidence.eventType).toBe('generate_history')

    const provenance = task.provenance as {
      created: { time: number; actor: { kind: string; name: string } }
    }
    expect(provenance.created.time).toBe(1789200000000)
    expect(provenance.created.actor.kind).toBe('simulation')
    expect(provenance.created.actor.name).toBe('Synthetic GP history')
    expect(record.provenance).toEqual(task.provenance)
  })

  it('bloodReportFrom reads analytes from a diagnostics blood-result and ignores tasks', () => {
    const report = bloodReportFrom(crp)
    expect(report).not.toBeNull()
    expect(report?.id).toBe('blood-v1-SIM-000001-crp-5')
    expect(report?.version).toBe(1)
    expect(report?.patientId).toBe('SIM-000001')
    expect(report?.collectedAt).toBe(1789113600000)
    expect(report?.owner).toBe('diagnostics')
    expect(report?.analytes).toEqual([
      {
        id: 'crp',
        name: 'C-reactive protein',
        unit: 'mg/L',
        value: 5.6,
        referenceLow: 0,
        referenceHigh: 5,
      },
    ])
    expect(bloodReportFrom(task)).toBeNull()
  })

  it('taskReadbackFrom finds the gp-connect Task by id', () => {
    const found = taskReadbackFrom(gpConnect, 'r-2')
    expect(found).toEqual({ id: 'r-2', status: 'open', version: 1 })
    expect(taskReadbackFrom(gpConnect, 'missing-task')).toBeNull()
  })
})
