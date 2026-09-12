import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../cx'
import type { SpaceScale } from '../types'
import styles from './grid.module.css'

export type GridColumns = 'auto' | 1 | 2 | 3

export type GridProps = {
  gap?: SpaceScale
  columns?: GridColumns
  min?: string
  children: ReactNode
}

const gapClass: Record<SpaceScale, string> = {
  '2xs': styles.gap2xs,
  xs: styles.gapXs,
  sm: styles.gapSm,
  md: styles.gapMd,
  lg: styles.gapLg,
  xl: styles.gapXl,
}

const columnClass: Record<Exclude<GridColumns, 'auto'>, string> = {
  1: styles.fixed1,
  2: styles.fixed2,
  3: styles.fixed3,
}

export function Grid({ gap = 'md', columns = 'auto', min = '16rem', children }: GridProps) {
  const style = { '--ds-grid-min': min } as CSSProperties
  return (
    <div
      className={cx(styles.grid, gapClass[gap], columns !== 'auto' && columnClass[columns])}
      style={style}
    >
      {children}
    </div>
  )
}
