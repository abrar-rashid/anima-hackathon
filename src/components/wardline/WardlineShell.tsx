'use client'

import type { ReactNode } from 'react'
import type { WardlineNav } from './types'
import styles from './wardline.module.css'
import './wardline-tokens.css'

const NAV: Array<{ id: WardlineNav; label: string }> = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'patients', label: 'Patients' },
  { id: 'sources', label: 'Sources' },
  { id: 'map', label: 'Map' },
]

function NavIcon({ id }: { id: WardlineNav }) {
  if (id === 'tasks') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M4 5h12M4 10h8M4 15h10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (id === 'patients') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="7" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M4.5 16c1.2-3 3.1-4.2 5.5-4.2S14.8 13 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (id === 'sources') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M4 7.5h5.5V4H4v3.5Zm6.5 8.5H16V12h-5.5v4Zm0-5.5H16V4h-5.5v6.5ZM4 16h5.5v-6.5H4V16Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M3.5 14.5 8 6l3 5.5 1.5-2.5 4 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="7" cy="8.5" r="1.2" fill="currentColor" />
    </svg>
  )
}

export function WardlineShell({
  nav,
  onNav,
  title,
  eyebrow = 'Northbank clinical operations',
  world,
  live,
  recordCount,
  onSync,
  syncing = false,
  children,
}: {
  nav: WardlineNav
  onNav: (next: WardlineNav) => void
  title: string
  eyebrow?: string
  world: string
  live: boolean
  recordCount: number
  onSync: () => void
  syncing?: boolean
  children: ReactNode
}) {
  return (
    <div className={`wardline ${styles.frame}`}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            +
          </span>
          <p className={styles.wordmark}>Wardline</p>
        </div>
        <nav className={styles.nav} aria-label="Wardline">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.navBtn}
              aria-current={nav === item.id ? 'page' : undefined}
              onClick={() => onNav(item.id)}
            >
              <NavIcon id={item.id} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <header className={styles.top}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
        </div>
        <div className={styles.aside}>
          <p className={styles.live} data-live={live ? 'true' : 'false'}>
            <span className={styles.liveDot} aria-hidden="true" />
            {live
              ? `${recordCount} records · up to date`
              : `${world === 'connecting' ? 'Connecting' : world}`}
          </p>
          <p className={styles.world}>{world}</p>
          <button type="button" className={styles.sync} onClick={onSync} disabled={syncing}>
            {syncing ? 'Reading Anima…' : 'Sync Anima API'}
          </button>
        </div>
      </header>

      <main className={styles.ops} data-map={nav === 'map' ? 'true' : 'false'}>
        {children}
      </main>
    </div>
  )
}
