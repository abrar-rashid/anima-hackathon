'use client'

import type { ReactElement } from 'react'
import { Popover, Stack, Text } from '@/design'
import type { Citation, SimResource } from '@/ctl/contracts'
import { siteLabel } from './site-label'
import type { SiteDescriptor } from '@/ctl/contracts'

/**
 * Click-to-reveal proof for one claim. Every finding, task and highlighted
 * span routes through this so "where did this come from" always has an
 * answer that is either the real record or an honest "not found".
 */
export function CitationDisclosure({
  citation,
  resources,
  sites,
  triggerLabel = 'Source',
}: {
  citation: Citation
  resources: SimResource[]
  sites: SiteDescriptor[]
  triggerLabel?: string
}): ReactElement {
  const resource = resources.find((r) => r.id === citation.resourceId && r.site === citation.site)

  return (
    <Popover
      triggerLabel={triggerLabel}
      title={`${citation.resourceId} · v${citation.version} · ${siteLabel(citation.site, sites)}`}
    >
      <Stack gap="sm">
        {citation.quote ? (
          <Text as="p" size="body">
            &ldquo;{citation.quote}&rdquo;
          </Text>
        ) : null}
        {resource ? (
          <Stack gap="xs">
            <Text as="p" size="meta" tone="muted">
              {resource.kind} · {resource.title} · status {resource.status} · version {resource.version}
              {citation.version !== resource.version ? ' (a newer version than this citation)' : ''}
            </Text>
            {citation.field ? (
              <Text as="p" size="meta" tone="muted">
                Field: {citation.field}
              </Text>
            ) : null}
          </Stack>
        ) : (
          <Text as="p" size="meta" tone="blocked">
            Record {citation.resourceId} version {citation.version} at {siteLabel(citation.site, sites)} was
            not among the resources read for this patient. No source shown.
          </Text>
        )}
      </Stack>
    </Popover>
  )
}
