import type { ReactNode } from 'react'
import { cx } from '../cx'
import { Heading } from '../primitives/heading'
import { StateBadge } from '../primitives/state-badge'
import type { StateTone } from '../types'
import styles from './hero-fact.module.css'

export type HeroFactProps = {
  fact: string
  meaning: string
  state: StateTone
  verified?: boolean
  headingAs?: 'h1' | 'h2'
  headingId?: string
  detail?: ReactNode
}

const surfaceClass: Partial<Record<StateTone, string>> = {
  owned: styles.owned,
  awaiting: styles.awaiting,
  blocked: styles.blocked,
  unverified: styles.unverified,
}

export function HeroFact({
  fact,
  meaning,
  state,
  verified = false,
  headingAs = 'h1',
  headingId,
  detail,
}: HeroFactProps) {
  const tone: StateTone = !verified && state === 'proven' ? 'unverified' : state
  const badgeLabel =
    tone === 'proven'
      ? 'Proven by readback'
      : tone === 'unverified'
        ? 'Not verified by readback'
        : tone === 'owned'
          ? 'Owned'
          : tone === 'awaiting'
            ? 'Awaiting acknowledgement'
            : tone === 'blocked'
              ? 'Blocked'
              : 'Idle'

  return (
    <section className={cx(styles.block, surfaceClass[tone])} aria-labelledby={headingId}>
      <Heading as={headingAs} size="hero" id={headingId}>
        {fact}
      </Heading>
      <div className={styles.meta}>
        <StateBadge tone={tone} label={badgeLabel} />
        <p className={styles.meaning}>{meaning}</p>
      </div>
      {detail ? <div className={styles.detail}>{detail}</div> : null}
    </section>
  )
}
