import type { ReactNode } from 'react'
import { IconIdle } from '../icons'
import styles from './empty-state.module.css'

export type EmptyStateProps = {
  title: string
  body: string
  action?: ReactNode
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.block}>
      <div className={styles.lead}>
        <span className={styles.mark} aria-hidden="true">
          <IconIdle />
        </span>
        <h2 className={styles.title}>{title}</h2>
      </div>
      <p className={styles.body}>{body}</p>
      {action}
    </div>
  )
}
