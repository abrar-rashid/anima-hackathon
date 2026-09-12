'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import styles from '@/components/neighbourhood/neighbourhood.module.css'

/**
 * Error boundary for the town.
 *
 * `loadTownModel` degrades rather than throws, so reaching this means something
 * unexpected broke. Name the failure and keep navigation working — a dead end
 * with no way out is worse than the error itself.
 */
export default function TownError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('town route failed', error)
  }, [error])

  return (
    <div className={styles.page}>
      <div className={styles.centre}>
        <h1 className={styles.title}>The neighbourhood did not render</h1>
        <p className={`${styles.banner} ${styles.bannerAlarm}`}>
          {error.message || 'no message was attached to the error'}
          {error.digest ? ` · digest ${error.digest}` : ''}
        </p>
        <p className={styles.headerNote}>
          The simulator reads degrade on their own, so this is a rendering fault rather than a dead
          API. Retrying re-runs the seven site reads.
        </p>
        <div className={styles.controls}>
          <button type="button" className={styles.button} onClick={() => retry()}>
            retry
          </button>
          <Link className={styles.button} href="/">
            back to the worklist
          </Link>
        </div>
      </div>
    </div>
  )
}
