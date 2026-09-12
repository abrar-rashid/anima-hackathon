import type { Site, SiteDescriptor } from '@/ctl/contracts'

/** Real site names only come from the catalogue. An unmatched id shows itself, never a made-up label. */
export function siteLabel(site: Site, sites: SiteDescriptor[]): string {
  return sites.find((s) => s.id === site)?.name ?? site
}

export function siteColor(site: Site, sites: SiteDescriptor[]): string | undefined {
  return sites.find((s) => s.id === site)?.color
}
