import { IconBlocked, IconOwned } from '../icons'
import { Button } from '../primitives/button'
import { cx } from '../cx'
import styles from './decision-block.module.css'

export type DecisionBlockProps = {
  actionLabel: string
  available: boolean
  reason: string
  onAction?: () => void
  busy?: boolean
}

export function DecisionBlock({
  actionLabel,
  available,
  reason,
  onAction,
  busy = false,
}: DecisionBlockProps) {
  const title = available ? `${actionLabel} is available` : `${actionLabel} is not available`
  const Icon = available ? IconOwned : IconBlocked

  return (
    <section className={cx(styles.block, available ? styles.available : styles.unavailable)} aria-label={title}>
      <div className={styles.lead}>
        <span className={styles.mark} aria-hidden="true">
          <Icon />
        </span>
        <h2 className={styles.title}>{title}</h2>
      </div>
      <p className={styles.reason}>{reason}</p>
      <Button variant={available ? 'primary' : 'secondary'} disabled={!available} busy={busy} onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  )
}
