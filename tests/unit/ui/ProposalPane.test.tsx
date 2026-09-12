// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProposalPane } from '@/components/ProposalPane'
import { DEFAULT_STAFF, heroProposal, RESULT_ID } from './fixtures'

function renderPane(
  proposal = heroProposal(),
  extras: {
    selectedStaffId?: string | null
    onStaffChange?: (id: string) => void
    onApprove?: () => void
  } = {},
) {
  return render(
    <ProposalPane
      currentOwner="hospital"
      nextOwner="gp"
      transfer={proposal.transfer}
      deadlines={proposal.deadlines}
      actions={proposal.actions}
      prohibited={proposal.prohibited}
      hardStops={proposal.hardStops}
      staffRoster={DEFAULT_STAFF}
      selectedStaffId={extras.selectedStaffId ?? null}
      onStaffChange={extras.onStaffChange ?? (() => undefined)}
      onApprove={extras.onApprove ?? (() => undefined)}
    />,
  )
}

afterEach(() => {
  cleanup()
})

describe('ProposalPane', () => {
  it('lists action and destination', () => {
    renderPane()
    expect(screen.getByRole('listitem', { name: /create_task to gp/i })).toBeTruthy()
    expect(screen.getByRole('listitem', { name: /accept to gp/i })).toBeTruthy()
  })

  it('lists current versus next owner', () => {
    renderPane()
    expect(screen.getByText(/Current owner:\s*hospital/)).toBeTruthy()
    expect(screen.getByText(/Next owner:\s*gp/)).toBeTruthy()
  })

  it('lists deadlines with policy source', () => {
    renderPane()
    expect(screen.getByText(String(heroProposal().deadlines.ackDeadlineAt))).toBeTruthy()
    expect(screen.getByText(/protocol v3 ackDeadlineMinutes/)).toBeTruthy()
  })

  it('shows a payload preview in a pre element', () => {
    renderPane()
    const pre = screen.getAllByRole('generic').find((el) => el.tagName === 'PRE') ?? document.querySelector('pre')
    expect(pre).toBeTruthy()
    expect(pre?.textContent).toMatch(/create_task/)
    expect(pre?.textContent).toMatch(/SIM-000001/)
  })

  it('shows expected readback', () => {
    renderPane()
    expect(screen.getByText(/GP Connect Task bundle contains the created task id/)).toBeTruthy()
  })

  it('shows included source versions', () => {
    renderPane()
    expect(screen.getAllByText(new RegExp(RESULT_ID)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/v1/).length).toBeGreaterThan(0)
  })

  it('shows idempotency key status', () => {
    renderPane()
    expect(screen.getAllByText('Idempotency key issued').length).toBeGreaterThan(0)
  })

  it('lists hard stops', () => {
    renderPane(heroProposal({ hardStops: ['Source version changed during review'] }))
    const list = screen.getByRole('list', { name: 'Hard stops' })
    expect(within(list).getByText('Source version changed during review')).toBeTruthy()
  })

  it('shows clinical rows as Clinician decision required and disabled', () => {
    renderPane()
    const locked = screen.getAllByRole('button', { name: 'Clinician decision required' })
    expect(locked.length).toBeGreaterThan(0)
    for (const row of locked) {
      expect(row).toHaveProperty('disabled', true)
    }
  })

  it('disables Approve covenant actions when any hard stop is present', () => {
    renderPane(heroProposal({ hardStops: ['Source version changed during review'] }), {
      selectedStaffId: 'hosp-1',
    })
    expect(screen.getByRole('button', { name: 'Approve covenant actions' })).toHaveProperty('disabled', true)
  })

  it('disables Approve covenant actions when staff is unselected', () => {
    renderPane(heroProposal(), { selectedStaffId: null })
    expect(screen.getByRole('button', { name: 'Approve covenant actions' })).toHaveProperty('disabled', true)
  })

  it('enables Approve covenant actions when staff is selected and there are no hard stops', () => {
    const onApprove = vi.fn()
    renderPane(heroProposal(), { selectedStaffId: 'hosp-1', onApprove })
    const button = screen.getByRole('button', { name: 'Approve covenant actions' })
    expect(button).toHaveProperty('disabled', false)
    fireEvent.click(button)
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('shows Protocol preview on unsupported action rows with no execute control', () => {
    renderPane()
    const row = screen.getByRole('listitem', { name: /accept to gp/i })
    expect(within(row).getByText('Protocol preview')).toBeTruthy()
    expect(within(row).queryByRole('checkbox')).toBeNull()
    expect(within(row).queryByRole('button', { name: /execute|include/i })).toBeNull()
  })

  it('labels the staff selector as app-side attribution', () => {
    renderPane()
    expect(
      screen.getByLabelText('App-side staff attribution (simulator records team-level actor)'),
    ).toBeTruthy()
  })

  it('offers the default synthetic staff roster', () => {
    renderPane()
    expect(screen.getByRole('option', { name: /Dr Ada Sim/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Dr Morgan Bell/ })).toBeTruthy()
  })
})
