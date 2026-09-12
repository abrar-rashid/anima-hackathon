'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from '../cx'
import styles from './tabs.module.css'

export type TabItem = {
  id: string
  label: string
  content: ReactNode
}

export type TabsProps = {
  label: string
  tabs: TabItem[]
  value?: string
  defaultValue?: string
  onChange?: (id: string) => void
}

export function Tabs({ label, tabs, value, defaultValue, onChange }: TabsProps) {
  const baseId = useId()
  const first = tabs[0]?.id ?? ''
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? first)
  const current = value ?? uncontrolled

  function select(id: string) {
    if (value === undefined) setUncontrolled(id)
    onChange?.(id)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === current)
    if (index < 0) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      select(tabs[(index + 1) % tabs.length]?.id ?? current)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      select(tabs[(index - 1 + tabs.length) % tabs.length]?.id ?? current)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      select(tabs[0]?.id ?? current)
    }
    if (event.key === 'End') {
      event.preventDefault()
      select(tabs[tabs.length - 1]?.id ?? current)
    }
  }

  return (
    <div>
      <div className={styles.list} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === current
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={cx(styles.tab)}
              onClick={() => select(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => {
        const selected = tab.id === current
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${baseId}-panel-${tab.id}`}
            aria-labelledby={`${baseId}-tab-${tab.id}`}
            hidden={!selected}
            className={styles.panel}
          >
            {selected ? tab.content : null}
          </div>
        )
      })}
    </div>
  )
}
