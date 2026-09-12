'use client'

import type { KeyboardEvent } from 'react'
import styles from './segmented.module.css'

export type SegmentedOption = {
  value: string
  label: string
}

export type SegmentedProps = {
  label: string
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
}

export function Segmented({ label, options, value, onChange }: SegmentedProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = options.findIndex((option) => option.value === value)
    if (index < 0) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(options[(index + 1) % options.length]?.value ?? value)
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(options[(index - 1 + options.length) % options.length]?.value ?? value)
    }
  }

  return (
    <div role="radiogroup" aria-label={label} className={styles.group} onKeyDown={onKeyDown}>
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={styles.option}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
