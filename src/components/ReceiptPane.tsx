import styles from './case-workspace.module.css'
import { StateBadge } from './StateBadge'

export type ReceiptStatus =
  | 'SUBMITTED'
  | 'VISIBLE_DOWNSTREAM'
  | 'ACCEPTED'
  | 'EVIDENCED'
  | 'FAILED'
  | 'STALE'
  | 'DUPLICATE_LINKED'

export type ReceiptRowView = {
  actionIndex: number
  status: ReceiptStatus
  resourceId: string | null
  version: number | null
  activityId: string | null
  error: string | null
}

export type ReceiptPaneProps = {
  receipts: ReceiptRowView[]
  currentOwner: string
  nextSafeAction?: string
}

const CHAIN = ['SUBMITTED', 'VISIBLE_DOWNSTREAM', 'ACCEPTED', 'EVIDENCED'] as const

const ORDER: Record<(typeof CHAIN)[number], number> = {
  SUBMITTED: 0,
  VISIBLE_DOWNSTREAM: 1,
  ACCEPTED: 2,
  EVIDENCED: 3,
}

function isReached(status: ReceiptStatus, step: (typeof CHAIN)[number]): boolean {
  if (!(status in ORDER)) return false
  return ORDER[step] <= ORDER[status as (typeof CHAIN)[number]]
}

function failureIcon(status: ReceiptStatus): string {
  if (status === 'STALE') return '!'
  if (status === 'DUPLICATE_LINKED') return '='
  return '×'
}

export function ReceiptPane({ receipts, currentOwner, nextSafeAction }: ReceiptPaneProps) {
  const owner = currentOwner.trim() || 'unknown — owner missing from snapshot'

  return (
    <section className={styles.panel} aria-labelledby="receipt-heading">
      <h2 id="receipt-heading">Receipt</h2>
      <p>Current accountable owner: {owner}</p>
      {nextSafeAction ? <p>Next safe action: {nextSafeAction}</p> : null}
      <ul className={styles.list} aria-label="Action receipts">
        {receipts.map((receipt) => {
          const failed = receipt.status === 'FAILED' || receipt.status === 'STALE' || receipt.status === 'DUPLICATE_LINKED'
          const missingActivity =
            (receipt.status === 'VISIBLE_DOWNSTREAM' || receipt.status === 'ACCEPTED') && !receipt.activityId
          return (
            <li key={receipt.actionIndex} className={styles.row} aria-label={`Action ${receipt.actionIndex} receipt`}>
              <p>
                Action {receipt.actionIndex}
                {receipt.resourceId ? ` · ${receipt.resourceId}` : ''}
                {receipt.version != null ? ` v${receipt.version}` : ''}
              </p>
              <ol className={styles.chain}>
                {CHAIN.map((step) => {
                  const reached = isReached(receipt.status, step)
                  return (
                    <li key={step}>
                      <span
                        className={reached ? styles.reached : styles.pending}
                        data-reached={reached ? 'true' : 'false'}
                      >
                        {step}
                      </span>
                    </li>
                  )
                })}
              </ol>
              {failed ? (
                <p className={styles.fail}>
                  <StateBadge label={receipt.status} icon={failureIcon(receipt.status)} tone="bad" />
                  {receipt.error ? ` ${receipt.error}` : ''}
                </p>
              ) : null}
              {missingActivity ? <p className={styles.fail}>Activity evidence unavailable</p> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
