'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from './button'
import styles from './popover.module.css'

export type PopoverProps = {
  triggerLabel: string
  title: string
  children: ReactNode
}

export function Popover({ triggerLabel, title, children }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    function onPointer(event: MouseEvent) {
      const root = wrapRef.current
      if (!root || !(event.target instanceof Node) || root.contains(event.target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <Button
        ref={buttonRef}
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        {triggerLabel}
      </Button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          className={styles.panel}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
