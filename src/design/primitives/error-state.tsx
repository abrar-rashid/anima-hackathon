import type { ReactNode } from 'react'
import { IconBlocked } from '../icons'
import styles from './error-state.module.css'

export type ErrorStateProps = {
  title: string
  body: string
  recovery?: string
  action?: ReactNode
}

export function ErrorState({ title, body, recovery, action }: ErrorStateProps) {
  return (
    <div className={styles.block} role="alert">
      <div className={styles.lead}>
        <span className={styles.mark} aria-hidden="true">
          <IconBlocked />
        </span>
        <h2 className={styles.title}>{title}</h2>
      </div>
      <p className={styles.body}>{body}</p>
      {recovery ? <p className={styles.recovery}>{recovery}</p> : null}
      {action}
    </div>
  )
}
