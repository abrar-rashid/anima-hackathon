/**
 * Last-known `GET /api/catalogue` values, captured from the live simulator on
 * 2026-09-12 and recorded in
 * docs/superpowers/specs/2026-09-12-close-the-loop-overhaul.md §2.
 *
 * This is a cache of real responses, not a set of invented labels. It is used
 * only when the live catalogue read fails, and any site rendered from it is
 * marked `capture` so the UI can say the name is last-known rather than live.
 *
 * The capture does not cover `diagnostics` or `referrals`; those entries are
 * absent rather than guessed, and the UI falls back to the real site id with a
 * visible "name not supplied by source" note.
 */

import type { Site } from '@/ctl/contracts'

export interface CapturedSite {
  name: string
  colorHex: string
}

export const CAPTURED_AT = '2026-09-12'

export const CAPTURED_CATALOGUE: Partial<Record<Site, CapturedSite>> = {
  gp: { name: 'Riverside Practice', colorHex: '#315b82' },
  hospital: { name: 'Northbank General', colorHex: '#63516f' },
  pharmacy: { name: 'High Street Pharmacy', colorHex: '#11675e' },
  community: { name: 'Community visiting team', colorHex: '#976039' },
  wearables: { name: 'Home Health', colorHex: '#6d71cb' },
}

/**
 * Roof colours for the two sites the capture does not cover.
 *
 * A colour is presentation, not a claim about the world, so these come from our
 * palette and are reported with `colorSource: 'palette'`. A *name* would be a
 * claim, so no name is supplied here.
 */
export const PALETTE_SITE_COLORS: Partial<Record<Site, string>> = {
  diagnostics: '#2f6274',
  referrals: '#6b4a4f',
}
