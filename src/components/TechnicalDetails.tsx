import styles from './case-workspace.module.css'

export type TechnicalDetailsProps = {
  caseId: string
  resultId: string
  resultVersion: number
  activityLinks?: { activityId: string; label?: string }[]
  payload?: unknown
  stages?: string[]
}

export function TechnicalDetails({
  caseId,
  resultId,
  resultVersion,
  activityLinks = [],
  payload,
  stages = [],
}: TechnicalDetailsProps) {
  return (
    <details className={styles.panel}>
      <summary>Technical details</summary>
      <dl className={styles.meta}>
        <div>
          <dt>Case</dt>
          <dd>{caseId}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>
            <span>{resultId}</span> v{resultVersion}
          </dd>
        </div>
      </dl>
      {stages.length > 0 ? (
        <p>Stages: {stages.join(' → ')}</p>
      ) : null}
      {activityLinks.length > 0 ? (
        <ul>
          {activityLinks.map((link) => (
            <li key={link.activityId}>
              {link.label ? `${link.label}: ` : ''}
              <span>{link.activityId}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {payload !== undefined ? <pre>{JSON.stringify(payload, null, 2)}</pre> : null}
    </details>
  )
}
