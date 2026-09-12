'use client'

import { cloneElement, useId, useState, type FocusEvent, type ReactElement } from 'react'
import styles from './tooltip.module.css'

type TriggerProps = {
  'aria-describedby'?: string
  onFocus?: (event: FocusEvent<HTMLElement>) => void
  onBlur?: (event: FocusEvent<HTMLElement>) => void
}

export type TooltipProps = {
  content: string
  children: ReactElement<TriggerProps>
}

export function Tooltip({ content, children }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)

  const trigger = cloneElement(children, {
    'aria-describedby': open ? id : children.props['aria-describedby'],
    onFocus: (event: FocusEvent<HTMLElement>) => {
      setOpen(true)
      children.props.onFocus?.(event)
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      setOpen(false)
      children.props.onBlur?.(event)
    },
  })

  return (
    <span
      className={styles.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {trigger}
      {open ? (
        <span role="tooltip" id={id} className={styles.tip}>
          {content}
        </span>
      ) : null}
    </span>
  )
}
