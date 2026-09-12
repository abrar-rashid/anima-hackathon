import type { JSX } from 'react'
import { percent } from './format'
import type { WardlinePayload, WardlineSourceCard } from './types'
import styles from './sources.module.css'

const FOOTER = 'Simulation environment · Not approved for real patient data or autonomous clinical use'

function sourceMark(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? ''
  if (first.length === 0) return '?'
  if (first.length <= 2) return first.toUpperCase()
  return first.slice(0, 1).toUpperCase()
}

function failedSitesLabel(failedSites: WardlinePayload['scan']['failedSites']): string {
  return failedSites.length > 0 ? failedSites.join(', ') : 'none'
}

function SourceCard({ source }: { source: WardlineSourceCard }): JSX.Element {
  return (
    <article className={styles.card} aria-labelledby={`wardline-source-${source.id}`}>
      <header className={styles.cardHead}>
        <div className={styles.identity}>
          <span className={styles.mark} aria-hidden="true">
            {sourceMark(source.name)}
          </span>
          <div className={styles.naming}>
            <p className={styles.eyebrow}>AUTHENTICATED SOURCE</p>
            <h2 className={styles.title} id={`wardline-source-${source.id}`}>
              {source.name}
            </h2>
          </div>
        </div>
        <span className={styles.live}>
          <span className={styles.liveDot} aria-hidden="true" />
          Live
        </span>
      </header>

      <dl className={styles.figures}>
        <div className={styles.figure}>
          <dt>Linked tasks</dt>
          <dd>{source.linkedTasks}</dd>
        </div>
        <div className={styles.figure}>
          <dt>Urgent</dt>
          <dd>{source.urgentTasks}</dd>
        </div>
        <div className={styles.figure}>
          <dt>Evidence coverage</dt>
          <dd>{percent(source.evidencedTasks, source.linkedTasks)}</dd>
        </div>
      </dl>

      <div className={styles.projections}>
        <p className={styles.projLabel}>Record projections in use</p>
        {source.projections.length === 0 ? (
          <p className={styles.projEmpty}>No projections in this scan window.</p>
        ) : (
          <ul className={styles.chips}>
            {source.projections.map((projection) => (
              <li key={projection} className={styles.chip}>
                {projection}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

export function ConnectedSources(props: {
  sources: WardlineSourceCard[]
  scan: WardlinePayload['scan']
}): JSX.Element {
  return (
    <section className={styles.page} aria-label="Connected sources">
      {props.sources.length === 0 ? (
        <div className={styles.empty} role="status">
          <p className={styles.emptyLead}>No authenticated sources in this scan window.</p>
          <p className={styles.emptyBody}>
            Scanned {props.scan.scanned} of {props.scan.total}. Failed sites:{' '}
            {failedSitesLabel(props.scan.failedSites)}.
          </p>
        </div>
      ) : (
        <ul className={styles.grid}>
          {props.sources.map((source) => (
            <li key={source.id}>
              <SourceCard source={source} />
            </li>
          ))}
        </ul>
      )}
      <p className={styles.footer}>{FOOTER}</p>
    </section>
  )
}
