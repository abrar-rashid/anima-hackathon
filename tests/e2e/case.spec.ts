import { expect, test } from '@playwright/test'
import {
  ALLOWED_PATCH_FIELDS,
  DISABLED_DEPLOY_REASON,
  RESULT_ID,
  acquireCaseLock,
  approveCovenant,
  openHeroCase,
  ownerLine,
  releaseCaseLock,
  requireFakeWriteCounter,
  selectDutyStaff,
} from './helpers'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async () => {
  await acquireCaseLock()
})

test.afterEach(async () => {
  await releaseCaseLock()
})

test('eligible result opens with source id, version and a non-blank accountable owner', async ({ page }) => {
  await openHeroCase(page)
  await expect(page.getByText(RESULT_ID, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/^v\d+$/).first()).toBeVisible()
  const owner = ownerLine(page)
  await expect(owner).toBeVisible()
  const text = (await owner.innerText()).trim()
  expect(text).toMatch(/^Current accountable owner:\s+\S+/)
  expect(text.replace('Current accountable owner:', '').trim().length).toBeGreaterThan(0)
})

test('Test patch produces one allowed diff, PROPOSED status and a disabled deploy control', async ({
  page,
  request,
}) => {
  await openHeroCase(page)
  const writesBefore = await requireFakeWriteCounter(request)

  await page.getByRole('button', { name: 'Test patch' }).click()
  const evidence = page.getByRole('region', { name: 'simulator regression evidence' })
  await expect(evidence).toBeVisible({ timeout: 20_000 })
  await expect(evidence.getByText('PROPOSED')).toBeVisible()

  const diff = page.getByRole('table', { name: 'Changed protocol fields' })
  await expect(diff).toHaveCount(1)
  const fieldCells = diff.locator('tbody th')
  await expect(fieldCells.first()).toBeVisible()
  const fields = (await fieldCells.allInnerTexts()).map((text) => text.trim())
  expect(fields.length, 'Test patch must produce a non-empty allowed diff').toBeGreaterThan(0)
  for (const field of fields) {
    expect(ALLOWED_PATCH_FIELDS, `diff field ${field} is not in the allowed patch grammar`).toContain(field)
  }
  await expect(diff.getByText(/clinical|urgency|diagnosis|treatment/i)).toHaveCount(0)

  const deploy = page.getByRole('button', { name: 'Deploy' })
  await expect(deploy).toBeDisabled()
  await expect(page.getByText(DISABLED_DEPLOY_REASON, { exact: true })).toBeVisible()
  await expect(deploy).toHaveAttribute('aria-describedby', /protocol-lab-disabled-reason/)

  const writesAfter = await requireFakeWriteCounter(request)
  expect(writesAfter, 'Test patch must not call AnimaWritePort').toBe(writesBefore)
})

test('approve executes exactly one write; readback advances only the submission chain', async ({
  page,
  request,
}) => {
  await openHeroCase(page)
  const writesBefore = await requireFakeWriteCounter(request)
  const ownerBefore = (await ownerLine(page).innerText()).trim()
  const resultAvailable = page.getByRole('button', { name: /Result available/ })
  const closed = page.getByRole('button', { name: /^Closed$/ })
  await expect(resultAvailable).toHaveAttribute('aria-current', 'step')
  await expect(closed).not.toHaveAttribute('aria-current', 'step')

  await selectDutyStaff(page)
  const approveResponse = page.waitForResponse(
    (response) => response.url().includes('/approve') && response.request().method() === 'POST',
  )
  await approveCovenant(page)
  const payload = (await (await approveResponse).json()) as {
    receipts: Array<{
      status: string
      resourceId: string | null
      version: number | null
      activityId: string | null
    }>
    case: {
      ownershipState: string
      closureState: string
      currentAccountableOwner: { teamId: string }
      eventLog: Array<{
        actor: string
        simulatorTime: number
        sourceVersion?: number
        activityId?: string
        event: { type: string }
      }>
    }
  }

  const writesAfterApprove = await requireFakeWriteCounter(request)
  expect
    .soft(
      writesAfterApprove - writesBefore,
      `Expected exactly one FakeWrite call after approve; before=${writesBefore} after=${writesAfterApprove}`,
    )
    .toBe(1)

  const receipt = page.getByRole('listitem', { name: 'Action 0 receipt' })
  await expect(receipt.getByText('SUBMITTED', { exact: true })).toHaveAttribute('data-reached', 'true')
  await expect(receipt.getByText('VISIBLE_DOWNSTREAM', { exact: true })).toHaveAttribute('data-reached', 'true')
  await expect(receipt.getByText('ACCEPTED', { exact: true })).toHaveAttribute('data-reached', 'false')
  await expect(receipt.getByText('EVIDENCED', { exact: true })).toHaveAttribute('data-reached', 'false')
  await expect(page.getByText('Current accountable owner:', { exact: false }).first()).toHaveText(ownerBefore)
  await expect(resultAvailable).toHaveAttribute('aria-current', 'step')
  await expect(closed).not.toHaveAttribute('aria-current', 'step')
  expect(payload.case.closureState).toBe('RESULT_AVAILABLE')
  expect(payload.case.ownershipState).not.toBe('ACCEPTED')
  expect(payload.case.currentAccountableOwner.teamId).toBeTruthy()
  expect(payload.receipts.some((row) => row.status === 'SUBMITTED' || row.status === 'VISIBLE_DOWNSTREAM' || row.status === 'EVIDENCED')).toBe(true)
  expect(payload.receipts.every((row) => row.status !== 'FAILED' || Boolean(row.status))).toBe(true)

  await page.getByRole('button', { name: 'Refresh case' }).click()
  await expect(ownerLine(page)).toHaveText(ownerBefore)
  await expect(resultAvailable).toHaveAttribute('aria-current', 'step')
  await expect(closed).not.toHaveAttribute('aria-current', 'step')
  const writesAfterReadback = await requireFakeWriteCounter(request)
  expect(
    writesAfterReadback,
    `Readback must not send another write; after approve=${writesAfterApprove} after refresh=${writesAfterReadback}`,
  ).toBe(writesAfterApprove)

  const live = page.getByRole('status').first()
  await expect(live).not.toHaveText('')
  await expect(live).not.toHaveText(/complete|closed|clinical fact/i)

  const firstReceipt = payload.receipts[0]
  expect(firstReceipt).toBeTruthy()
  const activityEvent =
    payload.case.eventLog.find((entry) => entry.event.type === 'ActivityEvidenced') ??
    payload.case.eventLog.find((entry) => entry.event.type === 'ActionSubmitted')
  expect(activityEvent, 'approve response must include an Activity or submission event').toBeTruthy()

  await page.getByText('Technical details').click()
  const details = page.locator('details').filter({ hasText: 'Technical details' })
  await expect(details).toHaveAttribute('open', '')
  const detailsText = (await details.innerText()).replace(/\s+/g, ' ')

  if (firstReceipt?.activityId) {
    await expect(details.getByText(firstReceipt.activityId, { exact: true })).toBeVisible()
  }
  if (firstReceipt?.version != null) {
    expect(detailsText).toContain(String(firstReceipt.version))
  }

  const actor = activityEvent?.actor ?? ''
  const time = activityEvent?.simulatorTime
  const version = firstReceipt?.version
  expect
    .soft(detailsText, `Technical details missing Activity actor "${actor}". Visible text: ${detailsText}`)
    .toContain(actor)
  expect
    .soft(detailsText, `Technical details missing Activity time "${time}". Visible text: ${detailsText}`)
    .toContain(String(time))
  expect
    .soft(detailsText, `Technical details missing Activity version "${version}". Visible text: ${detailsText}`)
    .toContain(String(version))
})
