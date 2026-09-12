import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  acquireCaseLock,
  approveCovenant,
  assertTextAndIcon,
  contrastRatio,
  focusHasVisibleIndicator,
  focusedAccessibleName,
  openHeroCase,
  readThemeTokens,
  releaseCaseLock,
  requireFakeWriteCounter,
  selectDutyStaff,
} from './helpers'

const FOREGROUND_TOKENS = ['--text', '--muted', '--accent', '--ok', '--warn', '--bad'] as const
const BACKGROUND_TOKENS = ['--bg', '--panel', '--panel-2'] as const
const BODY_TEXT_MIN = 4.5

test.beforeEach(async () => {
  await acquireCaseLock()
})

test.afterEach(async () => {
  await releaseCaseLock()
})

async function expectNoSeriousAxeViolations(page: Page, zoomLabel: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze()
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(
    blocking,
    `${zoomLabel} axe serious/critical violations: ${JSON.stringify(
      blocking.map((item) => ({ id: item.id, impact: item.impact, help: item.help, nodes: item.nodes.length })),
      null,
      2,
    )}`,
  ).toEqual([])
}

test('axe reports no serious or critical violations at default zoom and at 200% zoom', async ({ page }) => {
  await openHeroCase(page)
  await expectNoSeriousAxeViolations(page, '100%')

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2'
  })
  await expect(page.getByRole('heading', { name: 'Covenant graph' })).toBeVisible()
  await expectNoSeriousAxeViolations(page, '200%')
})

test('Tab traversal reaches Approve covenant actions and Test patch with a visible focus indicator', async ({
  page,
}) => {
  await openHeroCase(page)
  await selectDutyStaff(page)
  await page.locator('body').focus()

  const seen: string[] = []
  let reachedApprove = false
  let approveFocused = false
  let reachedPatch = false
  let patchFocused = false

  for (let step = 0; step < 60; step += 1) {
    await page.keyboard.press('Tab')
    const name = await focusedAccessibleName(page)
    if (name) seen.push(name)
    const visible = await focusHasVisibleIndicator(page)

    if (/Approve covenant actions/i.test(name)) {
      reachedApprove = true
      approveFocused = visible
    }
    if (/^Test patch$/i.test(name) || name === 'Test patch') {
      reachedPatch = true
      patchFocused = visible
    }
    if (reachedApprove && reachedPatch) break
  }

  expect(reachedApprove, `Tab did not reach Approve covenant actions. Focus path: ${seen.join(' → ')}`).toBe(true)
  expect(reachedPatch, `Tab did not reach Test patch. Focus path: ${seen.join(' → ')}`).toBe(true)
  expect(approveFocused, 'Approve covenant actions had no visible focus indicator').toBe(true)
  expect(patchFocused, 'Test patch had no visible focus indicator').toBe(true)
})

test('live region text changes after approve', async ({ page, request }) => {
  await openHeroCase(page)
  await requireFakeWriteCounter(request)
  const live = page.getByRole('status').first()
  const before = (await live.innerText()).trim()

  await selectDutyStaff(page)
  await approveCovenant(page)

  await expect(live).not.toHaveText(before)
  await expect(live).toHaveText(/\S/)
  await expect(live).toHaveText(/submitted|visible downstream|Activity|readback|Write/i)
})

test('prefers-reduced-motion keeps the same case content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openHeroCase(page)
  await expect(page.getByText(/^Current accountable owner:\s+\S+/).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Covenant graph' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Evidence', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Proposed covenant' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve covenant actions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Test patch' })).toBeVisible()
  await expect(page.getByText('Technical details')).toBeVisible()
})

test('theme tokens meet WCAG 2.2 AA contrast against panel backgrounds', async ({ page }) => {
  await openHeroCase(page)
  const tokens = await readThemeTokens(page)
  const failures: string[] = []
  const measured: string[] = []

  for (const fg of FOREGROUND_TOKENS) {
    for (const bg of BACKGROUND_TOKENS) {
      const ratio = contrastRatio(tokens[fg], tokens[bg])
      const rounded = Math.round(ratio * 100) / 100
      measured.push(`${fg} on ${bg}: ${rounded}:1`)
      if (ratio < BODY_TEXT_MIN) {
        failures.push(`${fg} (${tokens[fg]}) on ${bg} (${tokens[bg]}): ${rounded}:1 < ${BODY_TEXT_MIN}:1`)
      }
    }
  }

  expect(failures, `Contrast failures:\n${failures.join('\n')}\nMeasured:\n${measured.join('\n')}`).toEqual([])
})

test('no state is communicated by colour alone', async ({ page }) => {
  await openHeroCase(page)

  const liveBadge = page.locator('[data-state-badge]').first()
  await expect(liveBadge).toBeVisible()
  await expect(liveBadge.locator('[aria-hidden="true"]')).toHaveText(/\S/)
  await expect(liveBadge).toHaveText(/Live|Recorded simulator replay|Connection unknown/)

  const graphButtons = page.getByRole('heading', { name: 'Covenant graph' }).locator('..').getByRole('button')
  const graphCount = await graphButtons.count()
  expect(graphCount).toBeGreaterThan(0)
  for (let index = 0; index < graphCount; index += 1) {
    const button = graphButtons.nth(index)
    await expect(button.locator('[aria-hidden="true"]')).toHaveText(/\S/)
    await expect(button).toHaveText(/\S/)
  }

  await page.getByRole('button', { name: 'Test patch' }).click()
  const evidence = page.getByRole('region', { name: 'simulator regression evidence' })
  await expect(evidence).toBeVisible({ timeout: 20_000 })
  await assertTextAndIcon(evidence, 'PROPOSED')

  const invariantItems = page.getByRole('heading', { name: 'Invariants' }).locator('..').getByRole('listitem')
  const invariantCount = await invariantItems.count()
  expect(invariantCount).toBeGreaterThan(0)
  for (let index = 0; index < invariantCount; index += 1) {
    const item = invariantItems.nth(index)
    await expect(item.getByText(/pass|fail/i)).toBeVisible()
    await expect(item.locator('[aria-hidden="true"]').first()).toHaveText(/\S/)
  }
})
