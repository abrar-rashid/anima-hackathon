import styles from './case-workspace.module.css'

export type LiveRegionProps = {
  message: string
}

export function LiveRegion({ message }: LiveRegionProps) {
  return (
    <p className={styles.live} role="status" aria-live="polite">
      {message}
    </p>
  )
}
