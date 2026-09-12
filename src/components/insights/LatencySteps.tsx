import type { ReactElement } from 'react'
import { Heading, Surface, Text } from '@/design'
import type { LatencyBucket } from '@/ctl/contracts'
import { formatDuration } from '@/components/worklist/format'
import styles from './insights.module.css'

function figure(label: string, ms: number, n: number): ReactElement {
  return (
    <div className={styles.figure}>
      <Text as="span" size="meta" tone="muted">
        {label}
      </Text>
      <Text as="span" size="body" data>
        {formatDuration(ms)} · n = {n}
      </Text>
    </div>
  )
}

export function LatencySteps({ steps }: { steps: LatencyBucket[] }): ReactElement {
  return (
    <Surface as="section" padding="lg" labelledBy="latency-steps-heading">
      <div className={styles.panel}>
        <Heading as="h2" size="title" id="latency-steps-heading">
          Step latency
        </Heading>
        <Text size="body" measure>
          Elapsed time between consecutive provenance actions. Every figure is an observed count, not
          an estimate.
        </Text>
        {steps.length === 0 ? (
          <Text size="body" tone="muted">
            No provenance transitions were observed in this scan window.
          </Text>
        ) : (
          <ol className={styles.list}>
            {steps.map((step) => (
              <li key={step.label} className={styles.step}>
                <Text as="p" size="lead">
                  {step.label}
                </Text>
                <div className={styles.figures}>
                  {figure('Median', step.medianMs, step.n)}
                  {figure('p90', step.p90Ms, step.n)}
                  {figure('Max', step.maxMs, step.n)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Surface>
  )
}
