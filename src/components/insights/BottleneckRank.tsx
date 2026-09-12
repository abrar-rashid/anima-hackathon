import type { ReactElement } from 'react'
import { Heading, Surface, Text } from '@/design'
import type { LatencyBucket } from '@/ctl/contracts'
import { formatDuration } from '@/components/worklist/format'
import styles from './insights.module.css'

export function rankBottlenecks(steps: LatencyBucket[]): LatencyBucket[] {
  return [...steps].sort((a, b) => b.medianMs - a.medianMs || b.p90Ms - a.p90Ms || b.maxMs - a.maxMs)
}

export function BottleneckRank({ steps }: { steps: LatencyBucket[] }): ReactElement {
  const ranked = rankBottlenecks(steps)
  return (
    <Surface as="section" padding="lg" labelledBy="bottleneck-heading">
      <div className={styles.panel}>
        <Heading as="h2" size="title" id="bottleneck-heading">
          Bottleneck ranking
        </Heading>
        <Text size="body" measure>
          Transitions that burn the most time, worst first. Ranked by observed median, then p90,
          then max.
        </Text>
        {ranked.length === 0 ? (
          <Text size="body" tone="muted">
            No transitions to rank in this scan window.
          </Text>
        ) : (
          <ol className={styles.list}>
            {ranked.map((step, index) => (
              <li key={step.label} className={styles.rank}>
                <span className={styles.index}>{index + 1}</span>
                <Text as="span" size="body">
                  {step.label}
                </Text>
                <Text as="span" size="meta" data>
                  median {formatDuration(step.medianMs)} · n = {step.n}
                </Text>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Surface>
  )
}
