import type { ReactNode } from 'react'
import { cx } from '../cx'
import type { TextTone } from '../types'
import styles from './text.module.css'

export type TextAs = 'p' | 'span' | 'div'
export type TextSize = 'meta' | 'body' | 'lead'

export type TextProps = {
  as?: TextAs
  size?: TextSize
  tone?: TextTone
  measure?: boolean
  data?: boolean
  children: ReactNode
}

const sizeClass: Record<TextSize, string> = {
  meta: styles.meta,
  body: styles.body,
  lead: styles.lead,
}

const toneClass: Record<TextTone, string> = {
  ink: styles.ink,
  muted: styles.muted,
  owned: styles.owned,
  awaiting: styles.awaiting,
  proven: styles.proven,
  blocked: styles.blocked,
  unverified: styles.unverified,
}

export function Text({
  as: Tag = 'p',
  size = 'body',
  tone = 'ink',
  measure = false,
  data = false,
  children,
}: TextProps) {
  return (
    <Tag className={cx(styles.text, sizeClass[size], toneClass[tone], measure && styles.measure, data && styles.data)}>
      {children}
    </Tag>
  )
}
