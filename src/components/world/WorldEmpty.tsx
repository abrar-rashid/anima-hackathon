import styles from './world.module.css'

export type WorldEmptyReason = 'empty' | 'loading' | 'error'

export type WorldEmptyProps = {
  reason: WorldEmptyReason
  message?: string
  sectionId?: string
}

const COPY: Record<WorldEmptyReason, { title: string; body: string }> = {
  loading: {
    title: 'Assembling the borough atlas',
    body: 'Waiting for a snapshot. No district, result or stitch is invented while this loads. The case workspace remains the clinical record.',
  },
  empty: {
    title: 'No snapshot assembled',
    body: 'This view invents nothing. Open the case workspace to hold the covenant; the atlas appears only when a WorldSnapshot is supplied.',
  },
  error: {
    title: 'The borough atlas could not be drawn',
    body: 'The case workspace is unchanged and no write was sent. This view only visualises; it never decides.',
  },
}

export function WorldEmpty({ reason, message, sectionId }: WorldEmptyProps) {
  const copy = COPY[reason]
  return (
    <div
      className={styles.empty}
      role={reason === 'error' ? 'alert' : 'status'}
      data-world-empty={reason}
      id={sectionId}
    >
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      {message ? <p>{message}</p> : null}
    </div>
  )
}
