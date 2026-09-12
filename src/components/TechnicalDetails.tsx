import styles from './case-workspace.module.css'

export type TechnicalDetailsProps = {
  caseId: string
  resultId: string
  resultVersion: number
  activityLinks?: { activityId: string; label?: string }[]
  activityActor?: string
  activityTime?: number
  payload?: unknown
  stages?: string[]
}

export function TechnicalDetails({
  caseId,
  resultId,
  resultVersion,
  activityLinks = [],
  activityActor,
  activityTime,
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
        {activityActor ? (
          <div>
            <dt>Activity actor</dt>
            <dd>{activityActor}</dd>
          </div>
        ) : null}
        {activityTime != null ? (
          <div>
            <dt>Activity time</dt>
            <dd>{activityTime}</dd>
          </div>
        ) : null}
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
