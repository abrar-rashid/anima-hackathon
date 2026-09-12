import { describe, expect, it } from 'vitest'
import { FakeRead } from '@/adapters/fake/anima-read'
import { FakeWrite } from '@/adapters/fake/anima-write'
import { FakeClock } from '@/adapters/fake/clock'
import type { StaffIdentity } from '@/domain/types'

const staff: StaffIdentity = {
  id: 'staff-test-1',
  name: 'Test Clinician',
  role: 'gp',
  teamId: 'gp',
  attribution: 'app-side',
}

describe('in-memory fakes', () => {
  it('FakeWrite records calls, failNextWith scripts a failure, and create_task is readable on the next view', async () => {
    const clock = new FakeClock({ now: 1789286400000, paused: true, speed: 0 })
    const read = new FakeRead({ clock })
    const write = new FakeWrite(read, clock)

    write.failNextWith(500)
    await expect(
      write.executeApprovedAction({
        site: 'community',
        actionName: 'create_task',
        payload: { type: 'create_task', patientId: 'SIM-000001', title: 'Should fail' },
        staffIdentity: staff,
        expectedSourceVersions: [],
        idempotencyKey: 'fail-key',
      }),
    ).rejects.toMatchObject({ status: 500 })

    const receipt = await write.executeApprovedAction({
      site: 'community',
      actionName: 'create_task',
      payload: {
        type: 'create_task',
        patientId: 'SIM-000001',
        title: 'Review abnormal blood result',
      },
      staffIdentity: staff,
      expectedSourceVersions: [{ id: 'blood-v1-SIM-000001-crp-5', version: 1 }],
      idempotencyKey: 'team12|SIM-000001|blood-v1-SIM-000001-crp-5|1|v1|create_task|community',
    })

    expect(write.calls).toHaveLength(2)
    expect(write.calls[1]?.actionName).toBe('create_task')
    expect(write.calls[1]?.idempotencyKey).toContain('create_task')
    expect(receipt.httpStatus).toBe(200)
    expect(receipt.resourceId).toMatch(/^fake-task-/)

    const page = await read.getSiteRecords('community', 'SIM-000001')
    const created = page.items.find((item) => item.id === receipt.resourceId)
    expect(created).toMatchObject({
      id: receipt.resourceId,
      kind: 'task',
      status: 'open',
      patientId: 'SIM-000001',
      owner: 'community',
    })
  })

  it('FakeClock advances deterministically without wall-clock time', async () => {
    const clock = new FakeClock({ now: 1789286400000, paused: true, speed: 0 })
    const first = await clock.read()
    const advanced = await clock.advanceApproved(10)
    const second = await clock.read()
    expect(first.now).toBe(1789286400000)
    expect(advanced.advancedMinutes).toBe(10)
    expect(advanced.now).toBe(1789286400000 + 10 * 60 * 1000)
    expect(second.now).toBe(advanced.now)
    expect(advanced.paused).toBe(true)
  })
})
