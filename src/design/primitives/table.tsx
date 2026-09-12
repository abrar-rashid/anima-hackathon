import type { ReactNode } from 'react'
import { cx } from '../cx'
import styles from './table.module.css'

export type TableColumn<T> = {
  key: string
  header: string
  render: (row: T) => ReactNode
  data?: boolean
}

export type TableProps<T> = {
  caption: string
  columns: TableColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
}

export function Table<T>({ caption, columns, rows, getRowKey }: TableProps<T>) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={styles.head}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={cx(styles.cell, column.data && styles.data)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
