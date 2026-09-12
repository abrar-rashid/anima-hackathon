import type { ReactElement } from 'react'
import { Heading, Surface, Text } from '@/design'
import type { Rate } from '@/ctl/contracts'
import { formatFraction } from '@/components/worklist/format'
import styles from './insights.module.css'

export function LoopBreakage({ rates }: { rates: Rate[] }): ReactElement {
  return (
    <Surface as="section" padding="lg" labelledBy="breakage-heading">
      <div className={styles.panel}>
        <Heading as="h2" size="title" id="breakage-heading">
          Loop breakage
        </Heading>
        <Text size="body" measure>
          Each rate is a count over the resources actually scanned. Not a percentage, and not a
          claim about the whole population.
        </Text>
        {rates.length === 0 ? (
          <Text size="body" tone="muted">
            No breakage rates were returned for this scan window.
          </Text>
        ) : (
          <ul className={styles.list}>
            {rates.map((rate) => (
              <li key={rate.label} className={styles.break}>
                <p className={styles.fraction}>{formatFraction(rate)}</p>
                <Text as="p" size="body">
                  {rate.label}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Surface>
  )
}
