import type { ReactElement } from 'react'
import { Text } from '@/design'
import type { SimResource, SiteDescriptor } from '@/ctl/contracts'
import { CitationDisclosure } from './CitationDisclosure'
import { formatSimTime, relativeToNow } from './format'
import { siteColor, siteLabel } from './site-label'
import type { TimelineEntry } from './types'
import styles from './loop-timeline.module.css'

const ACTION_VERBS: Record<string, string> = {
  seed: 'recorded',
  generate_history: 'recorded from history',
  create: 'created',
  accept: 'accepted',
  reject: 'rejected',
  complete: 'completed',
  cancel: 'cancelled',
  dispense: 'dispensed',
  update: 'updated',
  sent: 'sent',
}

function verbFor(action: string): string {
  return ACTION_VERBS[action] ?? action
}

export function TimelineEntryRow({
  entry,
  now,
  resources,
  sites,
}: {
  entry: TimelineEntry
  now: number
  resources: SimResource[]
  sites: SiteDescriptor[]
}): ReactElement {
  const color = siteColor(entry.site, sites)
  return (
    <li className={styles.entry}>
      <span
        className={styles.siteDot}
        style={color ? { backgroundColor: color } : undefined}
        aria-hidden="true"
      />
      <div className={styles.entryBody}>
        <Text as="p" size="meta" tone="muted">
          {relativeToNow(entry.time, now)} · {formatSimTime(entry.time)} · {siteLabel(entry.site, sites)}
        </Text>
        <Text as="p" size="body">
          <strong>{entry.actorName}</strong> ({entry.actorKind}) {verbFor(entry.action)}{' '}
          <em>{entry.resourceTitle}</em> ({entry.resourceKind}, v{entry.version})
        </Text>
        <CitationDisclosure
          citation={{ resourceId: entry.resourceId, version: entry.version, site: entry.site }}
          resources={resources}
          sites={sites}
          triggerLabel="View record"
        />
      </div>
    </li>
  )
}
