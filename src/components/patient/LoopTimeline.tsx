import type { ReactElement } from 'react'
import { EmptyState, Heading, Stack } from '@/design'
import type { SimResource, SiteDescriptor } from '@/ctl/contracts'
import { TimelineDay } from './TimelineDay'
import type { TimelineDayGroup } from './types'
import styles from './loop-timeline.module.css'

/**
 * The centrepiece: one chronological spine of everything recorded for this
 * patient, across every site, grouped by simulator day. Ordering and grouping
 * come from `timeline.ts`, which is pure and independently tested.
 */
export function LoopTimeline({
  timeline,
  now,
  resources,
  sites,
}: {
  timeline: TimelineDayGroup[]
  now: number
  resources: SimResource[]
  sites: SiteDescriptor[]
}): ReactElement {
  return (
    <section aria-labelledby="loop-timeline-heading">
      <Stack gap="md">
        <Heading as="h2" size="title" id="loop-timeline-heading">
          The loop
        </Heading>
        {timeline.length === 0 ? (
          <EmptyState
            title="No recorded activity"
            body="No provenance entries were read for this patient across any site. Nothing was invented to fill this in."
          />
        ) : (
          <ol className={styles.days}>
            {timeline.map((group) => (
              <TimelineDay key={group.dayKey} group={group} now={now} resources={resources} sites={sites} />
            ))}
          </ol>
        )}
      </Stack>
    </section>
  )
}
