import type { ReactNode } from 'react'
import { cx } from '../cx'
import styles from './surface.module.css'

export type SurfaceAs = 'section' | 'div' | 'article' | 'aside'
export type SurfaceElevation = 'flat' | 'raised' | 'inset'
export type SurfacePadding = 'sm' | 'md' | 'lg'

export type SurfaceProps = {
  as?: SurfaceAs
  elevation?: SurfaceElevation
  padding?: SurfacePadding
  labelledBy?: string
  children: ReactNode
}

const elevationClass: Record<SurfaceElevation, string> = {
  flat: styles.flat,
  raised: styles.raised,
  inset: styles.inset,
}

const paddingClass: Record<SurfacePadding, string> = {
  sm: styles.padSm,
  md: styles.padMd,
  lg: styles.padLg,
}

export function Surface({
  as: Tag = 'section',
  elevation = 'raised',
  padding = 'md',
  labelledBy,
  children,
}: SurfaceProps) {
  return (
    <Tag className={cx(styles.surface, elevationClass[elevation], paddingClass[padding])} aria-labelledby={labelledBy}>
      {children}
    </Tag>
  )
}
