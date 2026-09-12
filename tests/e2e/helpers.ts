import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { open, stat, unlink, type FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const PATIENT_ID = 'SIM-000001'
export const RESULT_ID = 'blood-v1-SIM-000001-crp-5'
export const DISABLED_DEPLOY_REASON =
  'Production activation requires named clinical and operational approvers, controlled rollout and a rollback target.'
export const ALLOWED_PATCH_FIELDS = [
  'receiverMode',
  'ackDeadlineMinutes',
  'fallbackTeamId',
  'exceptionRoute',
  'dedupeWindowMinutes',
] as const

const LOCK_PATH = join(tmpdir(), 'care-covenant-e2e.lock')
const LOCK_STALE_MS = 120_000

let lockHandle: FileHandle | undefined

export async function acquireCaseLock(): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          const info = await stat(LOCK_PATH)
          if (Date.now() - info.mtimeMs > LOCK_STALE_MS) await unlink(LOCK_PATH)
        } catch {
          // lock file absent
        }
        try {
          lockHandle = await open(LOCK_PATH, 'wx')
          return true
        } catch {
          return false
        }
      },
      { timeout: 90_000, message: 'Timed out waiting for the shared case-page lock' },
    )
    .toBe(true)
}

export async function releaseCaseLock(): Promise<void> {
  try {
    await lockHandle?.close()
  } catch {
    // already closed
  }
  lockHandle = undefined
  try {
    await unlink(LOCK_PATH)
  } catch {
    // already removed
  }
}

export async function requireFakeWriteCounter(request: APIRequestContext): Promise<number> {
  const response = await request.get('/api/test/writes')
  if (response.status() !== 200) {
    throw new Error(
      `Fake write counter unavailable (HTTP ${response.status()}). Refusing to approve — COVENANT_FAKE_PORTS is not active on this server.`,
    )
  }
  const body = (await response.json()) as { count?: unknown }
  if (typeof body.count !== 'number') {
    throw new Error('Fake write counter did not return a numeric count.')
  }
  return body.count
}

export async function openHeroCase(page: Page): Promise<void> {
  await page.goto(`/case/${PATIENT_ID}`)
  await expect(page.getByRole('heading', { name: 'Case could not be loaded' })).toHaveCount(0)
  await expect(page.getByText(PATIENT_ID, { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(RESULT_ID, { exact: true }).first()).toBeVisible()
}

export function ownerLine(page: Page): Locator {
  return page.getByText(/^Current accountable owner:\s+\S+/).first()
}

export async function selectDutyStaff(page: Page): Promise<void> {
  await page
    .getByLabel('App-side staff attribution (simulator records team-level actor)')
    .selectOption('gp-duty-1')
}

export async function approveCovenant(page: Page): Promise<void> {
  const approve = page.getByRole('button', { name: 'Approve covenant actions' })
  await expect(approve).toBeEnabled()
  await approve.click()
  await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible({ timeout: 20_000 })
}

export async function focusHasVisibleIndicator(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement) || el === document.body) return false
    const style = getComputedStyle(el)
    const outlineWidth = Number.parseFloat(style.outlineWidth)
    const hasOutline = style.outlineStyle !== 'none' && outlineWidth > 0
    const hasShadow = style.boxShadow !== 'none' && style.boxShadow !== ''
    return hasOutline || hasShadow
  })
}

export async function focusedAccessibleName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement)) return ''
    const labelled = el.getAttribute('aria-label')
    if (labelled?.trim()) return labelled.trim()
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  })
}

export function hexToRgb(value: string): { r: number; g: number; b: number } {
  const hex = value.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(hex)
  if (short) {
    const digits = short[1]
    return {
      r: Number.parseInt(digits[0] + digits[0], 16),
      g: Number.parseInt(digits[1] + digits[1], 16),
      b: Number.parseInt(digits[2] + digits[2], 16),
    }
  }
  const full = /^#([0-9a-f]{6})$/i.exec(hex)
  if (full) {
    return {
      r: Number.parseInt(full[1].slice(0, 2), 16),
      g: Number.parseInt(full[1].slice(2, 4), 16),
      b: Number.parseInt(full[1].slice(4, 6), 16),
    }
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value)
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
  }
  throw new Error(`Unsupported color value: ${value}`)
}

function channel(value: number): number {
  const scaled = value / 255
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(value: string): number {
  const { r, g, b } = hexToRgb(value)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

export async function readThemeTokens(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    const keys = ['--bg', '--panel', '--panel-2', '--text', '--muted', '--accent', '--ok', '--warn', '--bad']
    const tokens: Record<string, string> = {}
    for (const key of keys) tokens[key] = style.getPropertyValue(key).trim()
    return tokens
  })
}

export function assertTextAndIcon(host: Locator, label: RegExp | string): Promise<void> {
  return (async () => {
    await expect(host.getByText(label)).toBeVisible()
    await expect(host.locator('[aria-hidden="true"]').first()).toHaveText(/\S/)
  })()
}
