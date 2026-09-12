import styles from './skeleton.module.css'

export type SkeletonProps = {
  label?: string
  bars?: number
}

export function Skeleton({
  label = 'Loading. No records have been returned yet.',
  bars = 3,
}: SkeletonProps) {
  const count = Math.max(1, Math.min(bars, 6))
  return (
    <div className={styles.block} role="status" aria-live="polite">
      <p className={styles.label}>{label}</p>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.bar} />
      ))}
    </div>
  )
}
