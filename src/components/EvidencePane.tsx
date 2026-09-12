import styles from './case-workspace.module.css'

export type EvidenceCitation = {
  site: string
  resourceId: string
  resourceVersion: number
  observedAtSimulatorTime: number
  eventType: string
  activityId?: string
}

export type EvidenceTask = {
  id: string
  version: number
  title: string
  status: string
}

export type EvidencePaneProps = {
  analyteName: string
  value: number
  unit: string
  referenceLow: number
  referenceHigh: number
  direction: 'above' | 'below'
  ruleText: string
  resultId: string
  resultVersion: number
  visibility: string[]
  citations: EvidenceCitation[]
  missingEvidence: string[]
  conflicts: string[]
  existingTasks: EvidenceTask[]
}

export function EvidencePane(props: EvidencePaneProps) {
  const directionText =
    props.direction === 'above'
      ? 'above the reference range supplied by the source'
      : 'below the reference range supplied by the source'

  return (
    <section className={styles.panel} aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">Evidence</h2>
      <div className={styles.stack}>
        <p>
          {props.analyteName} {props.value} {props.unit} (reference {props.referenceLow}–{props.referenceHigh}),{' '}
          {directionText}.
        </p>
        <p>{props.ruleText}</p>
        <p>
          Source record <span>{props.resultId}</span> <span>v{props.resultVersion}</span>
        </p>
        <p>Visible to: {props.visibility.join(', ') || 'not listed'}</p>
        <div>
          <h3>Returned records</h3>
          {props.citations.length === 0 ? (
            <p className={styles.muted}>No citations were returned.</p>
          ) : (
            <ul className={styles.list}>
              {props.citations.map((citation) => (
                <li key={`${citation.resourceId}:${citation.resourceVersion}:${citation.eventType}`} className={styles.row}>
                  {citation.resourceId} v{citation.resourceVersion} · {citation.site} · {citation.eventType}
                  {citation.activityId ? ` · ${citation.activityId}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Missing evidence</h3>
          {props.missingEvidence.length === 0 ? (
            <p className={styles.muted}>No missing-evidence rows were supplied.</p>
          ) : (
            <ul>
              {props.missingEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
        {props.conflicts.length > 0 ? (
          <div>
            <h3>Conflicts</h3>
            <ul>
              {props.conflicts.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {props.existingTasks.length > 0 ? (
          <div>
            <h3>Existing tasks</h3>
            <ul>
              {props.existingTasks.map((task) => (
                <li key={task.id}>
                  {task.title} ({task.id} v{task.version}, {task.status})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}
