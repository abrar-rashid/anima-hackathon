import type { ReactElement } from 'react'
import { Heading, Surface, Text } from '@/design'
import type { Rate, ScanWindow } from '@/ctl/contracts'
import { headerCounters } from './counters'
import { formatScanWindow, formatSimTime } from './format'
import styles from './worklist-header.module.css'

export function WorklistHeader({
  rates,
  window,
}: {
  rates: Rate[]
  window: ScanWindow
}): ReactElement {
  const counters = headerCounters(rates, window)

  return (
    <header className={styles.block}>
      <div className={styles.lede}>
        <Heading as="h1" size="hero">
          Unclosed work
        </Heading>
        <Text size="lead" measure>
          What was written down and not finished. Ranked by the detector layer from source-supplied
          breach and priority — not by us.
        </Text>
        <Text as="p" size="meta" tone="muted" data>
          Scan window: {formatScanWindow(window)}. Simulator now {formatSimTime(window.now)}. Head
          and tail windows only; this is not the whole population. Synthetic neighbourhood.
        </Text>
      </div>
      <ul className={styles.list} aria-label="Worklist counters">
        {counters.map((counter) => (
          <li key={counter.id}>
            <Surface as="article" padding="md" labelledBy={`counter-${counter.id}`}>
              <div className={styles.card}>
                <Text as="p" size="meta" tone="muted">
                  {counter.title}
                </Text>
                <p className={styles.figure} id={`counter-${counter.id}`} data-counter={counter.id}>
                  {counter.rate ? counter.rate.numerator : '—'}
                </p>
                <Text as="p" size="meta" tone="ink">
                  {counter.detail}
                </Text>
              </div>
            </Surface>
          </li>
        ))}
      </ul>
    </header>
  )
}
