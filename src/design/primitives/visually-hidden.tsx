import type { ReactNode } from 'react'
import styles from './visually-hidden.module.css'

export type VisuallyHiddenProps = {
  children: ReactNode
  as?: 'span' | 'p'
}

export function VisuallyHidden({ children, as: Tag = 'span' }: VisuallyHiddenProps) {
  return <Tag className={styles.hidden}>{children}</Tag>
}
