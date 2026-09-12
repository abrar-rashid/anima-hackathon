import type { ReactNode } from 'react'
import { cx } from '../cx'
import styles from './heading.module.css'

export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4'
export type HeadingSize = 'lead' | 'title' | 'hero'

export type HeadingProps = {
  as: HeadingLevel
  size?: HeadingSize
  id?: string
  children: ReactNode
}

const sizeClass: Record<HeadingSize, string> = {
  lead: styles.lead,
  title: styles.title,
  hero: styles.hero,
}

export function Heading({ as: Tag, size = 'title', id, children }: HeadingProps) {
  return (
    <Tag id={id} className={cx(styles.heading, sizeClass[size])}>
      {children}
    </Tag>
  )
}
