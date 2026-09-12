/**
 * Last-known `GET /api/catalogue` response, captured from the live simulator on
 * 2026-09-12 (the same capture as `tests/fixtures/live/catalogue.json`).
 *
 * This is a cache of a real response, not a set of invented labels. It is used
 * only when the live catalogue read fails, and every site rendered from it is
 * marked `capture` so the UI can say the name is last-known rather than live.
 *
 * Note what the real payload does and does not contain:
 *
 * - the `name` is the system name ("GP Records"), and the place name the town
 *   wants on its signs ("Riverside Practice") is the leading segment of the
 *   `subtitle`. Both are verbatim source strings; neither is composed by us.
 * - there is **no entry at all** for `diagnostics` or `referrals`. Those two
 *   buildings therefore carry their real site id and say that no source named
 *   them, rather than borrowing a name from somewhere else.
 */

import type { Site } from '@/ctl/contracts'

export interface CapturedSite {
  name: string
  subtitle: string
  colorHex: string
}

export const CAPTURED_AT = '2026-09-12'

export const CAPTURED_CATALOGUE: Partial<Record<Site, CapturedSite>> = {
  gp: { name: 'GP Records', subtitle: 'Riverside Practice · primary care', colorHex: '#315b82' },
  hospital: {
    name: 'Hospital EPR',
    subtitle: 'Northbank General · secondary care',
    colorHex: '#63516f',
  },
  pharmacy: { name: 'Pharmacy', subtitle: 'High Street Pharmacy', colorHex: '#11675e' },
  community: { name: 'Community Care', subtitle: 'Community visiting team', colorHex: '#976039' },
  wearables: { name: 'Home Health', subtitle: 'Personal health journal', colorHex: '#6d71cb' },
}

/**
 * Roof colours for the two sites the catalogue does not cover.
 *
 * A colour is presentation, not a claim about the world, so these come from our
 * palette and are reported with `colorSource: 'palette'`. A *name* would be a
 * claim, so no name is supplied here.
 */
export const PALETTE_SITE_COLORS: Partial<Record<Site, string>> = {
  diagnostics: '#2f6274',
  referrals: '#6b4a4f',
}

/**
 * The place name a site's subtitle leads with, verbatim.
 *
 * The simulator writes subtitles as "Riverside Practice · primary care". Taking
 * the segment before the separator is a substring of the source string, not a
 * rewrite of it, and the UI always shows the full subtitle alongside.
 */
export function placeNameFromSubtitle(subtitle: string | undefined): string | null {
  if (!subtitle) return null
  const leading = subtitle.split('·')[0]?.trim()
  return leading && leading.length > 0 ? leading : null
}
