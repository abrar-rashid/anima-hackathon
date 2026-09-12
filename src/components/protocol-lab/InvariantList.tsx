import styles from './protocol-lab.module.css'

export type InvariantRow = {
  id: number
  name: string
  passed: boolean
  detail: string
}

export function InvariantList({ invariants }: { invariants: InvariantRow[] }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Invariants</h3>
      <ul className={styles.invariantList}>
        {invariants.map((invariant) => {
          const passed = invariant.passed
          return (
            <li key={invariant.id} className={styles.invariantItem}>
              <span className={`${styles.status} ${passed ? styles.pass : styles.fail}`}>
                <span aria-hidden="true">{passed ? '✓' : '✗'}</span>
                {passed ? 'pass' : 'fail'}
              </span>
              <span>{invariant.name}</span>
              <span className={styles.detail}>{invariant.detail}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
