'use client'

import { useState, type ReactElement } from 'react'
import { Button, Text } from '@/design'
import type { SimResource, SiteDescriptor } from '@/ctl/contracts'
import { formatSimTime, relativeToNow } from './format'
import { siteColor, siteLabel } from './site-label'
import { TimelineEntryRow } from './TimelineEntryRow'
import type { TimelineItem } from './types'
import styles from './loop-timeline.module.css'

/** A collapsed run of low-signal repetition (e.g. routine observations). */
export function TimelineRunRow({
  item,
  now,
  resources,
  sites,
}: {
  item: Extract<TimelineItem, { kind: 'run' }>
  now: number
  resources: SimResource[]
  sites: SiteDescriptor[]
}): ReactElement {
  const [open, setOpen] = useState(false)
  const color = siteColor(item.site, sites)

  return (
    <li className={styles.run}>
      <span className={styles.siteDot} style={color ? { backgroundColor: color } : undefined} aria-hidden="true" />
      <div className={styles.entryBody}>
        <Text as="p" size="meta" tone="muted">
          {relativeToNow(item.firstTime, now)} to {relativeToNow(item.lastTime, now)} ·{' '}
          {siteLabel(item.site, sites)}
        </Text>
        <Text as="p" size="body">
          {item.count} routine {item.resourceKind} records {item.action} between {formatSimTime(item.firstTime)}{' '}
          and {formatSimTime(item.lastTime)}.
        </Text>
        <Button
          variant="silent"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide' : 'Show'} all {item.count} records
        </Button>
        {open ? (
          <ul className={styles.list}>
            {item.entries.map((entry) => (
              <TimelineEntryRow key={entry.key} entry={entry} now={now} resources={resources} sites={sites} />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  )
}
