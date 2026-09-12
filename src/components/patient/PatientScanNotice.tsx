import type { ReactElement } from 'react'
import { Button, StateBadge } from '@/design'
import type { ScanWindow, SiteDescriptor } from '@/ctl/contracts'
import { formatCapturedAt } from './format'
import { siteLabel } from './site-label'
import styles from './scan-notice.module.css'

export function PatientScanNotice({
  stale,
  fetchedAt,
  error,
  window,
  sites,
  onRetry,
  busy,
}: {
  stale: boolean
  fetchedAt: number
  error?: string
  window: ScanWindow
  sites: SiteDescriptor[]
  onRetry: () => void
  busy: boolean
}): ReactElement | null {
  const failed = window.failedSites
  if (!stale && !error && failed.length === 0) return null

  const failedNames = failed.map((id) => siteLabel(id, sites)).join(', ')

  return (
    <div className={styles.stack}>
      {stale ? (
        <div className={`${styles.banner} ${styles.stale}`} role="status">
          <StateBadge tone="awaiting" label="Stale copy" />
          <p className={styles.title}>Showing the last successful read for this patient</p>
          <p className={styles.body}>
            Captured at {formatCapturedAt(fetchedAt)} (wall clock).{error ? ` ${error}` : ''}
          </p>
          <Button variant="secondary" size="sm" busy={busy} onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}

      {!stale && error ? (
        <div className={`${styles.banner} ${styles.error}`} role="alert">
          <StateBadge tone="blocked" label="Read failed" />
          <p className={styles.title}>This patient could not be read</p>
          <p className={styles.body}>{error} No invented record was substituted.</p>
          <Button variant="secondary" size="sm" busy={busy} onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className={`${styles.banner} ${styles.partial}`} role="status">
          <StateBadge tone="unverified" label="Partial read" />
          <p className={styles.title}>Some sites did not return</p>
          <p className={styles.body}>
            Failed: {failedNames || 'unknown'}. The loop below is built from the sites that responded.
          </p>
        </div>
      ) : null}
    </div>
  )
}
