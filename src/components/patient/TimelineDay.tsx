import type { ReactElement } from 'react'
import { Heading } from '@/design'
import type { SimResource, SiteDescriptor } from '@/ctl/contracts'
import { TimelineEntryRow } from './TimelineEntryRow'
import { TimelineRunRow } from './TimelineRunRow'
import type { TimelineDayGroup } from './types'
import styles from './loop-timeline.module.css'

export function TimelineDay({
  group,
  now,
  resources,
  sites,
}: {
  group: TimelineDayGroup
  now: number
  resources: SimResource[]
  sites: SiteDescriptor[]
}): ReactElement {
  return (
    <li className={styles.day}>
      <Heading as="h3" size="lead">
        {group.dayLabel}
      </Heading>
      <ul className={styles.list}>
        {group.items.map((item) =>
          item.kind === 'single' ? (
            <TimelineEntryRow key={item.entry.key} entry={item.entry} now={now} resources={resources} sites={sites} />
          ) : (
            <TimelineRunRow key={item.groupKey} item={item} now={now} resources={resources} sites={sites} />
          ),
        )}
      </ul>
    </li>
  )
}
