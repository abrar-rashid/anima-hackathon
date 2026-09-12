import type { ReactNode } from 'react'
import { cx } from '../cx'
import { STATE_ICONS } from '../icons'
import type { StateTone } from '../types'
import styles from './state-badge.module.css'

export type StateBadgeProps = {
  label: string
  tone: StateTone
  icon?: ReactNode
}

const toneClass: Record<StateTone, string> = {
  idle: styles.idle,
  owned: styles.owned,
  awaiting: styles.awaiting,
  proven: styles.proven,
  blocked: styles.blocked,
  unverified: styles.unverified,
}

export function StateBadge({ label, tone, icon }: StateBadgeProps) {
  const Icon = STATE_ICONS[tone]
  return (
    <span className={cx(styles.badge, toneClass[tone])} data-state-badge="" data-state-tone={tone}>
      <span className={styles.mark} aria-hidden="true">
        {icon ?? <Icon />}
      </span>
      <span>{label}</span>
    </span>
  )
}
