import { PATCH_ALLOWED_FIELDS } from '@/domain/patch-grammar'
import styles from './protocol-lab.module.css'

export type ProtocolDiffFields = {
  receiverMode: string
  ackDeadlineMinutes: number
  fallbackTeamId: string
  exceptionRoute: string
  dedupeWindowMinutes: number
}

export function ProtocolDiff({
  baseline,
  candidate,
}: {
  baseline: ProtocolDiffFields
  candidate: ProtocolDiffFields
}) {
  const rows = PATCH_ALLOWED_FIELDS.filter((field) => baseline[field] !== candidate[field])

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption>Changed protocol fields</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Baseline</th>
            <th scope="col">Candidate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((field) => (
            <tr key={field}>
              <th scope="row">{field}</th>
              <td>{String(baseline[field])}</td>
              <td>{String(candidate[field])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
