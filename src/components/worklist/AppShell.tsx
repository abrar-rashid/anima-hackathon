import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import { DesignRoot } from '@/design'
import type { WorklistNavCurrent } from './types'
import styles from './AppShell.module.css'

const LINKS: Array<{ href: string; id: WorklistNavCurrent; label: string }> = [
  { href: '/worklist', id: 'worklist', label: 'Worklist' },
  { href: '/insights', id: 'insights', label: 'Insights' },
  { href: '/town', id: 'town', label: 'Neighbourhood' },
]

export function AppShell({
  current,
  patientHref,
  children,
}: {
  current: WorklistNavCurrent
  patientHref?: string
  children: ReactNode
}): ReactElement {
  return (
    <DesignRoot>
      <div className={styles.shell}>
        <header className={styles.bar}>
          <Link href="/" className={styles.brand}>
            <p className={styles.wordmark}>Close The Loop</p>
            <p className={styles.notice}>Synthetic NHS neighbourhood · not real patients</p>
          </Link>
          <nav className={styles.nav} aria-label="Close The Loop">
            {LINKS.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                className={styles.link}
                aria-current={current === link.id ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
            {patientHref ? (
              <Link
                href={patientHref}
                className={styles.link}
                aria-current={current === 'patient' ? 'page' : undefined}
              >
                Patient
              </Link>
            ) : (
              <span className={`${styles.link} ${styles.inert}`} title="Open a patient from a worklist row">
                Patient
              </span>
            )}
          </nav>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </DesignRoot>
  )
}
