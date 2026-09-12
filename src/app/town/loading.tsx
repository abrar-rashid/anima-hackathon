import styles from '@/components/neighbourhood/neighbourhood.module.css'

/**
 * Shown while the seven site reads fan out. Says what it is waiting for rather
 * than spinning, because a write-heavy simulator can take a few seconds.
 */
export default function TownLoading() {
  return (
    <div className={styles.page}>
      <div className={styles.centre}>
        <h1 className={styles.title}>Reading the neighbourhood</h1>
        <p className={styles.headerNote}>
          Fetching the simulator clock, the site catalogue and seven site views in parallel. Sites
          that fail will be named rather than hidden.
        </p>
      </div>
    </div>
  )
}
