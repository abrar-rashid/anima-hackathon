// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CaseWorkspace } from '@/components/CaseWorkspace'
import { CASE_ID, heroSnapshot, PATIENT_NAME, submittedReceipt } from './fixtures'

function renderWorkspace(snapshot = heroSnapshot()) {
  return render(<CaseWorkspace snapshot={snapshot} patientName={PATIENT_NAME} />)
}

describe('CaseWorkspace', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps Current accountable owner visible after composition', () => {
    renderWorkspace()
    expect(screen.getAllByText('Current accountable owner: hospital').length).toBeGreaterThan(0)
  })

  it('treats an accept action as Protocol preview when acceptSupported is unknown', () => {
    renderWorkspace()
    expect(screen.getByText('Protocol preview')).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /accept/i })).toBeNull()
  })

  it('posts approve to the case approve route with staff and live action indexes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        receipts: [submittedReceipt()],
        case: heroSnapshot().case,
        hardStops: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderWorkspace()
    fireEvent.change(screen.getByLabelText('App-side staff attribution (simulator records team-level actor)'), {
      target: { value: 'hosp-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve covenant actions' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/case/${CASE_ID}/approve`)
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body))
    expect(body.staff.id).toBe('hosp-1')
    expect(body.actionIndexes).toEqual([0])
    expect(body.proposalHash).toMatch(/\S/)
  })

  it('announces submission in the live region after approve', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          receipts: [submittedReceipt()],
          case: heroSnapshot().case,
          hardStops: [],
        }),
      }),
    )
    renderWorkspace()
    fireEvent.change(screen.getByLabelText('App-side staff attribution (simulator records team-level actor)'), {
      target: { value: 'hosp-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve covenant actions' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/submitted/i))
    expect(screen.getByRole('status').textContent).not.toMatch(/complete|closed|accepted owner/i)
  })

  it('announces readback changes when refresh returns a later receipt state', async () => {
    const snapshot = heroSnapshot()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          receipts: [submittedReceipt()],
          case: snapshot.case,
          hardStops: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...snapshot,
          case: { ...snapshot.case, submissionState: 'VISIBLE_DOWNSTREAM' },
          receipts: [submittedReceipt({ status: 'VISIBLE_DOWNSTREAM' })],
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    renderWorkspace(snapshot)
    fireEvent.change(screen.getByLabelText('App-side staff attribution (simulator records team-level actor)'), {
      target: { value: 'hosp-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve covenant actions' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/submitted/i))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh case' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/visible downstream/i))
  })

  it('reloads the case through POST /api/case/open', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => heroSnapshot(),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Reload case' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/case/open')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body)).patientId).toBe('SIM-000001')
  })

  it('does not introduce inline motion', () => {
    const { container } = renderWorkspace()
    for (const el of Array.from(container.querySelectorAll('[style]'))) {
      expect(el.getAttribute('style') ?? '').not.toMatch(/transition|animation/)
    }
  })

  it('does not define transitions in the workspace stylesheet', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/case-workspace.module.css'), 'utf8')
    expect(css).not.toMatch(/\btransition\b/)
    expect(css).not.toMatch(/\banimation\b/)
  })
})
