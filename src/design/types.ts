import type { ReactNode } from 'react'

export type StateTone = 'idle' | 'owned' | 'awaiting' | 'proven' | 'blocked' | 'unverified'

export type SpaceScale = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export type TextTone = 'ink' | 'muted' | 'owned' | 'awaiting' | 'proven' | 'blocked' | 'unverified'

export type DesignChildren = {
  children: ReactNode
}
