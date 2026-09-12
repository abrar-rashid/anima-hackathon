'use client'

import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  evidenceText,
  formatDeadline,
  percent,
  priorityTone,
  siteLabel,
} from './format'
import { BloodWorkflowTimeline } from './BloodWorkflowTimeline'
import {
  patientBloodWorkflow,
  workflowForResource,
  workflowsForPatient,
  type BloodWorkflow,
} from './blood-workflow'
import { StepIntervalTrack } from './StepIntervalTrack'
import type { WardlineStepChain } from './step-intervals'
import type { WardlineMedlatency, WardlinePatient, WardlineStats, WardlineTask } from './types'
import styles from './task-board.module.css'

type WorkflowOrigin = 'blood-result' | 'retrospective-seed' | 'medlatency'

const BLOOD_RESULT_NOTE =
  'Panels and analytes that share a timestamp are one blood-test step. Gaps are measured differences, not estimates. Steps that were not timestamped are omitted.'

const RETROSPECTIVE_NOTE =
  'Stage times are labelled retrospective synthetic events. Gaps are measured differences between those authored times, not live laboratory or PACS clocks.'

const MEDLATENCY_NOTE =
  'Stages come from the local MedLatency presentation. Fixture replays are authored interpretations, not live model output.'

type PriorityFilter = 'all' | 'emergency' | 'urgent' | 'standard'

const FILTERS: Array<{ id: PriorityFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'standard', label: 'Standard' },
]

const WRITE_GATE = 'Human approval required — writes stay on the case workspace.'

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function pickDefault(tasks: WardlineTask[]): WardlineTask | null {
  return tasks.find((task) => task.patientId === 'SIM-000006') ?? tasks[0] ?? null
}

function patientNameOf(task: WardlineTask, patients: WardlinePatient[]): string {
  if (task.patientName) return task.patientName
  if (!task.patientId) return ''
  return patients.find((patient) => patient.id === task.patientId)?.name ?? ''
}

function matchesSearch(task: WardlineTask, query: string, patients: WardlinePatient[]): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const fields = [task.title, task.id, task.patientId, task.owner, patientNameOf(task, patients)]
  return fields.some((field) => field?.toLowerCase().includes(needle))
}

function matchesFilter(task: WardlineTask, filter: PriorityFilter): boolean {
  if (filter === 'all') return true
  return priorityTone(task.priority) === filter
}

function statusLabel(status: string): string {
  return status.replace(/-/g, ' ')
}

function workflowOrigin(workflow: BloodWorkflow): WorkflowOrigin | undefined {
  if (!('origin' in workflow)) return undefined
  const origin = (workflow as BloodWorkflow & { origin?: unknown }).origin
  if (origin === 'blood-result' || origin === 'retrospective-seed' || origin === 'medlatency') {
    return origin
  }
  return undefined
}

function trackText(workflow: BloodWorkflow): string {
  const panels = Array.isArray(workflow.panels) ? workflow.panels.join(' ') : ''
  return `${workflow.panelName} ${workflow.title} ${workflow.panelId ?? ''} ${panels}`
}

function isBloodTrack(workflow: BloodWorkflow): boolean {
  return /fbc|blood|u&e|crp|full blood/i.test(trackText(workflow))
}

function isCtTrack(workflow: BloodWorkflow): boolean {
  return /\bct\b/i.test(trackText(workflow))
}

function selectedDiagnosticWorkflows(
  workflows: BloodWorkflow[],
  selected: WardlineTask | null,
): BloodWorkflow[] {
  if (!selected) return []
  if (selected.patientId) return workflowsForPatient(workflows, selected.patientId)
  const byResource = workflowForResource(workflows, selected.citations[0]?.resourceId)
  if (byResource) return [byResource]
  const byPatient = patientBloodWorkflow(workflows, selected.patientId)
  return byPatient ? [byPatient] : []
}

function pathwayHeading(workflows: BloodWorkflow[]): string {
  const blood = workflows.some(isBloodTrack)
  const ct = workflows.some(isCtTrack)
  if (blood && ct) return 'Diagnostic pathway latency'
  return workflows[0]?.panelName || 'Diagnostic pathway'
}

function pathwayNote(workflows: BloodWorkflow[]): string {
  const origins = workflows.map(workflowOrigin)
  if (origins.includes('retrospective-seed')) return RETROSPECTIVE_NOTE
  if (origins.includes('medlatency')) return MEDLATENCY_NOTE
  return BLOOD_RESULT_NOTE
}

function SearchIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className={styles.icon} aria-hidden="true">
      <circle cx="6.75" cy="6.75" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.2 10.2 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className={styles.icon} aria-hidden="true">
      <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5.2V8l2 1.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className={styles.icon} aria-hidden="true">
      <path
        d="M3.6 8.2 6.4 11l6-6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function TaskBoard(props: {
  tasks: WardlineTask[]
  stats: WardlineStats
  now: number
  patients: WardlinePatient[]
  chains?: WardlineStepChain[]
  bloodWorkflows?: BloodWorkflow[]
  medlatency?: WardlineMedlatency
}): JSX.Element {
  const { tasks, stats, now, patients, chains = [], bloodWorkflows = [], medlatency } = props
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PriorityFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(() => pickDefault(tasks)?.id ?? null)

  const visible = useMemo(
    () => tasks.filter((task) => matchesFilter(task, filter) && matchesSearch(task, query, patients)),
    [tasks, filter, query, patients],
  )

  useEffect(() => {
    if (selectedId && visible.some((task) => task.id === selectedId)) return
    setSelectedId(pickDefault(visible)?.id ?? null)
  }, [visible, selectedId])

  const selected = visible.find((task) => task.id === selectedId) ?? null
  const selectedTone = selected ? priorityTone(selected.priority) : 'none'
  const selectedCitation = selected?.citations[0]
  const selectedQuote = selectedCitation?.quote?.trim()
  const selectedWorkflows = selectedDiagnosticWorkflows(bloodWorkflows, selected)
  const coverage = percent(stats.evidenced, stats.total)
  const analysisModes = medlatency?.analysisModes.filter(Boolean) ?? []

  return (
    <section className={styles.board} aria-label="Clinical taskboard">
      {medlatency ? (
        <div className={styles.notice} data-reachable={medlatency.reachable || undefined} role="status">
          <p className={styles.noticeRow}>
            <span className={styles.noticeDot} aria-hidden="true" />
            <span>{medlatency.reachable ? 'MedLatency reachable' : 'MedLatency offline'}</span>
            {analysisModes.length > 0 ? (
              <span className={styles.noticeModes}>{analysisModes.join(' · ')}</span>
            ) : null}
          </p>
          {medlatency.note ? <p className={styles.noticeNote}>{medlatency.note}</p> : null}
        </div>
      ) : null}
      <ul className={styles.stats} aria-label="Taskboard counters">
        <li>
          <p className={styles.statLabel}>Active tasks</p>
          <p className={styles.statValue}>{stats.active}</p>
          <p className={styles.statCaption}>Across all sources</p>
        </li>
        <li className={styles.statEmergency}>
          <p className={styles.statLabel}>Emergency</p>
          <p className={cx(styles.statValue, styles.statValueEmergency)}>{stats.emergency}</p>
          <p className={styles.statCaption}>Immediate review</p>
        </li>
        <li>
          <p className={styles.statLabel}>Completed</p>
          <p className={styles.statValue}>{stats.completed}</p>
          <p className={styles.statCaption}>This team world</p>
        </li>
        <li>
          <p className={styles.statLabel}>Evidence coverage</p>
          <p className={styles.statValue}>{coverage}</p>
          <p className={styles.statCaption}>Source-linked tasks</p>
        </li>
      </ul>

      <div className={styles.workspace}>
        <div className={styles.listPane}>
          <div className={styles.toolbar}>
            <label className={styles.search}>
              <span className={styles.srOnly}>Search tasks</span>
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search task, patient, owner…"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className={styles.chips} role="radiogroup" aria-label="Filter by source priority">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={filter === item.id}
                  className={cx(styles.chip, filter === item.id && styles.chipActive)}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.listHead}>
            <p>{visible.length} tasks</p>
            <p>Deadline</p>
          </div>

          {visible.length === 0 ? (
            <div className={styles.empty} role="status">
              <p className={styles.emptyTitle}>No matching tasks</p>
              <p className={styles.emptyBody}>Try another filter or search.</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {visible.map((task) => {
                const tone = priorityTone(task.priority)
                const active = task.id === selectedId
                const deadline = formatDeadline(task.dueAt, now)
                const overdue = task.dueAt !== null && task.dueAt < now
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      className={cx(styles.row, active && styles.rowSelected)}
                      aria-selected={active}
                      onClick={() => setSelectedId(task.id)}
                    >
                      <span className={styles.rail} data-tone={tone} aria-hidden="true" />
                      <span className={styles.rowBody}>
                        <span className={styles.meta}>
                          {task.patientId ?? 'No patient'} · {siteLabel(task.site)}
                        </span>
                        <span className={styles.rowTitle}>{task.title}</span>
                        <span className={styles.rowStatus}>
                          <span className={styles.statusDot} aria-hidden="true" />
                          {statusLabel(task.status)} · {task.owner ?? 'Unassigned'}
                        </span>
                      </span>
                      <span className={cx(styles.deadline, overdue && styles.deadlineOverdue)}>
                        <ClockIcon />
                        {deadline}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <aside className={styles.detail} aria-label="Task detail">
          {selected ? (
            <>
              <div className={styles.detailHead}>
                <div className={styles.badges}>
                  <span className={styles.badge} data-tone={selectedTone}>
                    {selected.priority ?? 'No priority'}
                  </span>
                  {selectedCitation ? <span className={styles.version}>v{selectedCitation.version}</span> : null}
                </div>
                <p className={styles.taskId}>{selected.id}</p>
              </div>
              <h2 className={styles.detailTitle}>{selected.title}</h2>
              <p className={styles.detailBody}>{selectedQuote || evidenceText(selected)}</p>
              <p id="wardline-write-gate" className={styles.srOnly}>
                {WRITE_GATE}
              </p>
              <div className={styles.actions}>
                <span title={WRITE_GATE}>
                  <button type="button" className={styles.wait} disabled aria-describedby="wardline-write-gate">
                    Mark waiting
                  </button>
                </span>
                <span title={WRITE_GATE}>
                  <button type="button" className={styles.complete} disabled aria-describedby="wardline-write-gate">
                    <CheckIcon />
                    Complete
                  </button>
                </span>
              </div>
              <section className={styles.evidence} aria-labelledby="wardline-source-evidence">
                <div className={styles.evidenceHead}>
                  <h3 id="wardline-source-evidence">Source evidence</h3>
                  <p>{selected.citations.length}</p>
                </div>
                {selected.citations.length === 0 ? (
                  <p className={styles.evidenceEmpty}>No source citations are attached to this task.</p>
                ) : (
                  <ul className={styles.citations}>
                    {selected.citations.map((citation) => (
                      <li key={`${citation.site}-${citation.resourceId}-${citation.version}`}>
                        <p className={styles.citationMeta}>
                          {siteLabel(citation.site)} · {citation.resourceId} · v{citation.version}
                        </p>
                        {citation.quote ? <blockquote className={styles.quote}>{citation.quote}</blockquote> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {selectedWorkflows.length > 0 ? (
                <BloodWorkflowTimeline
                  workflows={selectedWorkflows}
                  heading={pathwayHeading(selectedWorkflows)}
                  note={pathwayNote(selectedWorkflows)}
                  compact
                />
              ) : chains.length > 0 ? (
                <StepIntervalTrack
                  chains={chains}
                  compact
                  focusResourceId={selectedCitation?.resourceId}
                  title="Waits on this record"
                />
              ) : null}
            </>
          ) : (
            <p className={styles.detailEmpty}>Select a task to inspect its source evidence.</p>
          )}
        </aside>
      </div>
    </section>
  )
}
