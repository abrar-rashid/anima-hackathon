import type { ReactNode } from 'react'
import { cx } from '../cx'
import styles from './data-list.module.css'

export type DataListItem = {
  term: string
  description: ReactNode
}

export type DataListProps = {
  items: DataListItem[]
  compact?: boolean
}

export function DataList({ items, compact = false }: DataListProps) {
  return (
    <dl className={cx(styles.list, compact && styles.compact)}>
      {items.map((item) => (
        <div key={item.term} className={styles.row}>
          <dt className={styles.term}>{item.term}</dt>
          <dd className={styles.description}>{item.description}</dd>
        </div>
      ))}
    </dl>
  )
}
