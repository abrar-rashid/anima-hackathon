'use client'

import Link from 'next/link'
import styles from './neighbourhood.module.css'
import { BREACH_LABEL, SOURCE_LABEL, formatCount, formatDuration, formatSimTime, withDenominator } from './format'
import type { TownModel, TownSite } from './model'

export interface SiteDrawerProps {
  site: TownSite
  model: TownModel
  onClose: () => void
}

/**
 * What one building actually holds.
 *
 * Every figure carries its denominator, every name says where it came from, and
 * a failed read is named rather than rendered as an empty site.
 */
export function SiteDrawer({ site, model, onClose }: SiteDrawerProps) {
  const heading = site.name ?? site.site

  return (
    <aside className={styles.aside} aria-label={`${heading} detail`}>
      <div className={styles.asideHead}>
        <div>
          <h2 className={styles.asideTitle}>{heading}</h2>
          <p className={styles.asideSource}>
            site id <code>{site.site}</code> · {SOURCE_LABEL[site.nameSource]}
          </p>
          {site.subtitle ? <p className={styles.asideSource}>{site.subtitle}</p> : null}
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose}>
          close
        </button>
      </div>

      {site.readFailed ? (
        <p className={`${styles.banner} ${styles.bannerAlarm}`}>
          This site read did not succeed{site.readError ? `: ${site.readError}` : ''}. Nothing below is
          from a live response.
        </p>
      ) : null}

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatCount(site.scanned)}</span>
          <span className={styles.statLabel}>resources scanned</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatCount(site.total)}</span>
          <span className={styles.statLabel}>resources the site reports</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatCount(site.work.length)}</span>
          <span className={styles.statLabel}>unclosed in that window</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatCount(site.breachedCount)}</span>
          <span className={styles.statLabel}>past deadline</span>
        </div>
      </div>

      <p className={styles.note}>
        {withDenominator(site.work.length, site.scanned, 'scanned resources are unclosed')}, where
        unclosed means {model.unclosedRule}. Breach is arithmetic on the record&apos;s own{' '}
        <code>dueAt</code> against simulator time {formatSimTime(model.now)} — it is not a clinical
        judgement.
      </p>

      {site.staffing ? (
        <section>
          <h3 className={styles.cardTitle}>Staffing reported by this site</h3>
          <div className={styles.kindRow}>
            {Object.entries(site.staffing).map(([key, value]) => (
              <span key={key} className={styles.badge}>
                {key} {formatCount(value)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {site.kinds.length > 0 ? (
        <section>
          <h3 className={styles.cardTitle}>Resource kinds in the scanned window</h3>
          <div className={styles.kindRow}>
            {site.kinds.slice(0, 12).map((entry) => (
              <span key={entry.kind} className={styles.badge}>
                {entry.kind} {formatCount(entry.count)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h3 className={styles.cardTitle}>Unclosed records</h3>
        {site.work.length === 0 ? (
          <p className={styles.note}>
            No resource in the scanned window has a status in the unclosed set.
          </p>
        ) : (
          <ul className={styles.workList}>
            {site.work.map((item) => {
              const overdue = item.overdueMs === null ? null : formatDuration(item.overdueMs)
              return (
                <li key={item.resourceId} className={styles.workItem} data-breach={item.breach}>
                  <span className={styles.workTitle}>{item.title || item.kind}</span>
                  <span className={styles.workMeta}>
                    {item.kind} · {item.status} · owner {item.owner ?? 'not supplied by source'} ·
                    priority {item.priority ?? 'not supplied by source'}
                  </span>
                  <span className={styles.workMeta}>
                    {BREACH_LABEL[item.breach]}
                    {item.dueAt !== null ? ` · due ${formatSimTime(item.dueAt)}` : ''}
                    {overdue ? ` · ${overdue} past due` : ''}
                  </span>
                  <span className={styles.workMeta}>
                    <code>
                      {item.resourceId} v{item.version}
                    </code>
                    {item.patientId ? (
                      <>
                        {' · '}
                        <Link href={`/patient/${item.patientId}`}>{item.patientId}</Link>
                      </>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className={styles.cardTitle}>Patients referenced here</h3>
        {site.patients.length === 0 ? (
          <p className={styles.note}>
            No resource in the scanned window carries a <code>patientId</code>.
          </p>
        ) : (
          <ul className={styles.patientList}>
            {site.patients.map((patient) => (
              <li key={patient.patientId}>
                <Link className={styles.patientLink} href={`/patient/${patient.patientId}`}>
                  <span>{patient.name ?? patient.patientId}</span>
                  {patient.name ? <span className={styles.tickerTime}>{patient.patientId}</span> : null}
                  <span className={styles.patientCount}>
                    {formatCount(patient.resourceCount)} resources
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.note}>
          Names appear only for patients returned by the directory page this view read. The rest show
          their real id.
        </p>
      </section>
    </aside>
  )
}
