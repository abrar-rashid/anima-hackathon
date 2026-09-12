// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReceiptPane } from '@/components/ReceiptPane'
import { submittedReceipt } from './fixtures'

const CHAIN = ['SUBMITTED', 'VISIBLE_DOWNSTREAM', 'ACCEPTED', 'EVIDENCED'] as const

function chain(status: (typeof CHAIN)[number] | 'FAILED' | 'STALE' | 'DUPLICATE_LINKED') {
  return render(
    <ReceiptPane
      receipts={[submittedReceipt({ status })]}
      currentOwner="hospital"
      nextSafeAction="Refresh the destination readback"
    />,
  )
}

function reachedFlags() {
  const row = screen.getByRole('listitem', { name: /action 0/i })
  return CHAIN.map((step) => {
    const node = within(row).getByText(step)
    return node.getAttribute('data-reached') === 'true'
  })
}

afterEach(() => {
  cleanup()
})

describe('ReceiptPane', () => {
  it('shows the per-action state chain SUBMITTED -> VISIBLE_DOWNSTREAM -> ACCEPTED -> EVIDENCED', () => {
    chain('SUBMITTED')
    const row = screen.getByRole('listitem', { name: /action 0/i })
    expect(row.textContent).toMatch(/SUBMITTED[\s\S]*VISIBLE_DOWNSTREAM[\s\S]*ACCEPTED[\s\S]*EVIDENCED/)
  })

  it('marks only SUBMITTED as reached after an HTTP success', () => {
    chain('SUBMITTED')
    expect(reachedFlags()).toEqual([true, false, false, false])
  })

  it('marks VISIBLE_DOWNSTREAM as reached only when the receipt status says so', () => {
    chain('VISIBLE_DOWNSTREAM')
    expect(reachedFlags()).toEqual([true, true, false, false])
  })

  it('marks ACCEPTED as reached only when the receipt status says so', () => {
    chain('ACCEPTED')
    expect(reachedFlags()).toEqual([true, true, true, false])
  })

  it('marks EVIDENCED as reached only when the receipt status says so', () => {
    chain('EVIDENCED')
    expect(reachedFlags()).toEqual([true, true, true, true])
  })

  it('shows an inline failure row for STALE', () => {
    chain('STALE')
    expect(screen.getByText('STALE')).toBeTruthy()
    expect(screen.getByText(/Current accountable owner: hospital/)).toBeTruthy()
    expect(screen.getByText(/Refresh the destination readback/)).toBeTruthy()
  })

  it('shows an inline failure row for FAILED', () => {
    render(
      <ReceiptPane
        receipts={[submittedReceipt({ status: 'FAILED', error: 'simulator returned 500' })]}
        currentOwner="hospital"
      />,
    )
    expect(screen.getByText('FAILED')).toBeTruthy()
    expect(screen.getByText(/simulator returned 500/)).toBeTruthy()
  })

  it('shows an inline failure row for DUPLICATE_LINKED', () => {
    chain('DUPLICATE_LINKED')
    expect(screen.getByText('DUPLICATE_LINKED')).toBeTruthy()
  })

  it('shows an inline failure row when Activity evidence is missing', () => {
    render(
      <ReceiptPane
        receipts={[submittedReceipt({ status: 'VISIBLE_DOWNSTREAM', activityId: null })]}
        currentOwner="hospital"
      />,
    )
    expect(screen.getByText(/Activity evidence unavailable/)).toBeTruthy()
  })
})
