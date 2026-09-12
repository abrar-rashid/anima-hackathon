'use client'

import { useId } from 'react'
import { formatStepDuration } from './step-intervals'
import type { BloodWorkflow } from './blood-workflow'
import styles from './blood-workflow-timeline.module.css'

const LEGEND: Array<{ tone: BloodWorkflow['steps'][number]['tone']; label: string }> = [
  { tone: 'doctors', label: 'Doctors' },
  { tone: 'clinical', label: 'Clinical staff' },
  { tone: 'laboratory', label: 'Laboratory' },
  { tone: 'nurses', label: 'Nurses' },
]

function formatClock(time: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(time))
}

function Timeline({ workflow }: { workflow: BloodWorkflow }) {
  const last = workflow.steps[workflow.steps.length - 1]
  const first = workflow.steps[0]
  return (
    <article className={styles.workflow} aria-label={workflow.panelName}>
      <header className={styles.workflowHead}>
        <h3 className={styles.workflowTitle}>{workflow.panelName}</h3>
        <p className={styles.workflowMeta}>
          {(workflow.panels?.length ?? 0) > 0 ? workflow.panels.join(' · ') : workflow.resourceId}
          {workflow.laboratory ? ` · ${workflow.laboratory}` : ''}
        </p>
        {(workflow.analytes?.length ?? 0) > 0 ? (
          <p className={styles.analytes}>{workflow.analytes.join(' · ')}</p>
        ) : null}
        {first && last && workflow.steps.length > 1 ? (
          <p className={styles.spanLabel}>
            Time to result · {formatStepDuration(workflow.totalElapsedMs)}
          </p>
        ) : null}
      </header>

      <ol className={styles.spine}>
        {workflow.steps.map((step, index) => {
          const gap = workflow.gaps[index]
          return (
            <li key={step.id} className={styles.col}>
              <div className={styles.stepBlock}>
                <p className={styles.stepLabel}>{step.label}</p>
                <p className={styles.stepTime} title={step.field}>
                  {formatClock(step.time)}
                </p>
              </div>
              <div className={styles.nodeRow}>
                <span className={styles.dot} data-tone={step.tone} aria-hidden="true" />
                {gap ? <span className={styles.line} aria-hidden="true" /> : null}
              </div>
              {gap ? (
                <p className={styles.delta}>
                  <span className={styles.deltaMark}>Δ{index + 1}</span>
                  <strong>{formatStepDuration(gap.elapsedMs)}</strong>
                  <span className={styles.deltaName}>{gap.label}</span>
                </p>
              ) : (
                <p className={styles.delta} />
              )}
            </li>
          )
        })}
      </ol>
    </article>
  )
}

export function BloodWorkflowTimeline({
  workflows,
  heading = 'Blood test workflow',
  compact = false,
  note,
}: {
  workflows: BloodWorkflow[]
  heading?: string
  compact?: boolean
  note?: string
}) {
  const headingId = useId()
  return (
    <section className={styles.panel} data-compact={compact || undefined} aria-labelledby={headingId}>
      <header className={styles.head}>
        <h2 className={styles.title} id={headingId}>
          {heading}
        </h2>
        {workflows.length === 0 ? (
          <p className={styles.empty}>
            {/diagnostic pathway/i.test(heading)
              ? 'No timestamped diagnostic pathway records were present for this selection.'
              : 'No synthetic blood-result records with timestamps were present for this selection.'}
          </p>
        ) : (
          <p className={styles.lede}>
            {note ??
              'Panels and analytes that share a timestamp are one blood-test step. Gaps are measured differences, not estimates. Steps that were not timestamped are omitted.'}
          </p>
        )}
        {workflows.length > 0 ? (
          <ul className={styles.legend} aria-label="Actor colours from provenance">
            {LEGEND.map((item) => (
              <li key={item.tone}>
                <span className={styles.dot} data-tone={item.tone} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        ) : null}
      </header>
      {workflows.length > 0 ? (
        <div className={styles.list}>
          {workflows.map((workflow, index) => (
            <Timeline
              key={`${workflow.origin ?? 'track'}:${workflow.resourceId || workflow.panelName}:${index}`}
              workflow={workflow}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
