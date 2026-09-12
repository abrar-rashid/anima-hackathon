import { DISABLED_DEPLOY_REASON } from '@/api/contracts'
import styles from './protocol-lab.module.css'

export { DISABLED_DEPLOY_REASON }

const REASON_ID = 'protocol-lab-disabled-reason'

export function GovernanceGate({
  reason = DISABLED_DEPLOY_REASON,
  rollbackTarget,
}: {
  reason?: string
  rollbackTarget: string | null
}) {
  return (
    <section className={styles.gate} aria-labelledby="protocol-lab-governance-heading">
      <h3 className={styles.sectionTitle} id="protocol-lab-governance-heading">
        Governance
      </h3>
      <p className={styles.reason} id={REASON_ID}>
        {reason}
      </p>
      <p>
        Rollback target: {rollbackTarget ?? 'none'}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.gateButton} disabled aria-describedby={REASON_ID}>
          Approve
        </button>
        <button type="button" className={styles.gateButton} disabled aria-describedby={REASON_ID}>
          Deploy
        </button>
      </div>
    </section>
  )
}
