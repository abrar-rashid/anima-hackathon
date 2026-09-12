'use client'

import { WorldEmpty } from '@/components/world/WorldEmpty'
import styles from '@/components/world/world.module.css'

export default function WorldError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div className={styles.page}>
      <header className={styles.mast}>
        <p className={styles.nav}>
          <a href="/case/SIM-000001">Case workspace</a>
        </p>
        <h1>Pixel Societies</h1>
      </header>
      <WorldEmpty
        reason="error"
        message={error.digest ? `Error digest ${error.digest}. No write was sent.` : undefined}
      />
      <button className={styles.retry} type="button" onClick={() => retry()}>
        Try drawing again
      </button>
    </div>
  )
}
