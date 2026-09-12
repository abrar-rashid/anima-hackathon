import type { ReactNode } from 'react'
import { cx } from '../cx'
import type { SpaceScale } from '../types'
import styles from './stack.module.css'

export type StackAs = 'div' | 'section' | 'article' | 'ul' | 'ol' | 'form' | 'nav'
export type StackAlign = 'start' | 'center' | 'stretch'

export type StackProps = {
  as?: StackAs
  gap?: SpaceScale
  align?: StackAlign
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

const alignClass: Record<StackAlign, string> = {
  start: styles.alignStart,
  center: styles.alignCenter,
  stretch: styles.alignStretch,
}

export function Stack({ as: Tag = 'div', gap = 'sm', align = 'stretch', children }: StackProps) {
  const list = Tag === 'ul' || Tag === 'ol'
  return <Tag className={cx(styles.stack, gapClass[gap], alignClass[align], list && styles.list)}>{children}</Tag>
}
