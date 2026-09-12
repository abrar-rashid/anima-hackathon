import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApproveRequest, ApproveResponse, CaseSnapshotResponse, TwinRequest, TwinResponse } from '@/api/contracts'
import { hashProposal } from '@/services/proposal-hash'
import { writeCallLog } from '@/services/container'
import { staff } from './helpers'

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('API routes', () => {
  it('opens a case through POST /api/case/open against fake ports', async () => {
    vi.stubEnv('COVENANT_FAKE_PORTS', '1')
    const { resetContainer } = await import('@/services/container')
    resetContainer()
    const { POST } = await import('@/app/api/case/open/route')
    const response = await POST(
      new Request('http://localhost/api/case/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    expect(response.status).toBe(200)
    const body = CaseSnapshotResponse.parse(await response.json())
    expect(body.case.sourceResultId).toBe('blood-v1-SIM-000001-crp-5')
    expect(body.proposal?.actions.length).toBeGreaterThan(0)
  })

  it('returns 409 proposal-stale without writing when the approve hash does not match', async () => {
    vi.stubEnv('COVENANT_FAKE_PORTS', '1')
    const { resetContainer, getContainer } = await import('@/services/container')
    resetContainer()
    const { POST: open } = await import('@/app/api/case/open/route')
    const opened = await open(
      new Request('http://localhost/api/case/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    const snapshot = CaseSnapshotResponse.parse(await opened.json())
    const writesBefore = writeCallLog(getContainer().write)?.length ?? 0

    const { POST: approve } = await import('@/app/api/case/[caseId]/approve/route')
    const response = await approve(
      new Request(`http://localhost/api/case/${snapshot.case.caseId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          ApproveRequest.parse({
            proposalHash: 'p-stale',
            approverId: staff.id,
            staff,
            actionIndexes: [0],
          }),
        ),
      }),
      { params: Promise.resolve({ caseId: snapshot.case.caseId }) },
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'proposal-stale' })
    expect(writeCallLog(getContainer().write)).toHaveLength(writesBefore)
    expect(hashProposal(snapshot.proposal)).not.toBe('p-stale')
  })

  it('approve, refresh and twin responses parse through their contract schemas', async () => {
    vi.stubEnv('COVENANT_FAKE_PORTS', '1')
    const { resetContainer } = await import('@/services/container')
    resetContainer()
    const { POST: open } = await import('@/app/api/case/open/route')
    const opened = await open(
      new Request('http://localhost/api/case/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    const snapshot = CaseSnapshotResponse.parse(await opened.json())

    const { POST: approve } = await import('@/app/api/case/[caseId]/approve/route')
    const approved = await approve(
      new Request(`http://localhost/api/case/${snapshot.case.caseId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          ApproveRequest.parse({
            proposalHash: hashProposal(snapshot.proposal),
            approverId: staff.id,
            staff,
            actionIndexes: [0],
          }),
        ),
      }),
      { params: Promise.resolve({ caseId: snapshot.case.caseId }) },
    )
    expect(approved.status).toBe(200)
    ApproveResponse.parse(await approved.json())

    const { POST: refresh } = await import('@/app/api/case/[caseId]/refresh/route')
    const refreshed = await refresh(new Request('http://localhost/refresh'), {
      params: Promise.resolve({ caseId: snapshot.case.caseId }),
    })
    expect(refreshed.status).toBe(200)
    const refreshBody = await refreshed.json()
    CaseSnapshotResponse.parse(refreshBody)
    ApproveResponse.shape.receipts.parse(refreshBody.receipts)

    const { POST: twin } = await import('@/app/api/case/[caseId]/twin/route')
    const twinned = await twin(
      new Request('http://localhost/twin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          TwinRequest.parse({
            traceId: 'after-hours-timeout',
            baseProtocolId: 'v3',
            diff: { ackDeadlineMinutes: 30 },
          }),
        ),
      }),
      { params: Promise.resolve({ caseId: snapshot.case.caseId }) },
    )
    expect(twinned.status).toBe(200)
    TwinResponse.parse(await twinned.json())
  })

  it('exposes fake write-call counts only when COVENANT_FAKE_PORTS=1', async () => {
    vi.stubEnv('COVENANT_FAKE_PORTS', '')
    const { GET } = await import('@/app/api/test/writes/route')
    const hidden = await GET()
    expect(hidden.status).toBe(404)

    vi.resetModules()
    vi.stubEnv('COVENANT_FAKE_PORTS', '1')
    const { resetContainer } = await import('@/services/container')
    resetContainer()
    const { GET: counted } = await import('@/app/api/test/writes/route')
    const shown = await counted()
    expect(shown.status).toBe(200)
    expect(await shown.json()).toEqual({ count: 0 })
  })
})
