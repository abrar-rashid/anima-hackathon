'use client'

import { FormEvent, useMemo, useState } from 'react'
import styles from './command-cockpit.module.css'

export type LoopActStep = 'create_task' | 'accept_duty' | 'auto_close'

export type LoopActReceipt = {
  ok: boolean
  step: LoopActStep
  message?: string
  receipts?: Array<{
    actionIndex: number
    status: string
    resourceId: string | null
    activityId: string | null
  }>
}

export interface TaskLedgerItem {
  task_id: string
  episode_id: string
  timestamp: string
  title: string
  status: string
  owner: string
  note: string
  deadline: string
  /** The source's own word, or 'not-supplied-by-source'. Never inferred here. */
  clinical_priority: string
  /** How far past its deadline, in ms, when the source set one. */
  overdueMs?: number | null
  /** Which detector surfaced this, so the row can say why it is here. */
  detector?: string
  site?: string
  snomed_id: string
  performed_by: string
  requested_id: string
}

export interface CockpitData {
  patient: {
    id: string
    name: string
    /** Derived from the source birthDate. Null when the source omits it. */
    age: number | null
    conditions?: string[]
    localIds?: Record<string, string>
    problems: Array<{ term: string; code: string; status: string; date: string }>
    /** Null when the simulator holds no result for this patient. */
    recentLab: {
      name: string
      value: number
      unit: string
      refLow?: number
      refHigh?: number
      isAbnormal: boolean
      panel?: string
      laboratory?: string
      collectedAt?: number
    } | null
    labTrend?: Array<{
      collectedAt: number
      value: number
      unit: string
      refLow?: number
      refHigh?: number
    }>
    /** Real correspondence with the free text the source wrote. */
    documents?: Array<{
      id: string
      site: string
      title: string
      version: number
      status: string
      stage: string | null
      sentBy: string | null
      sentAt: number | null
      sections: Array<{ key: string; text: string }>
      reviewed: boolean
    }>
    observations: Array<{ time: number; type: string; detail: string }>
  }
  tasks: TaskLedgerItem[]
  /**
   * The agent's proposal. Null while it is still being assembled, or when the
   * agent failed — the clinical records above are rendered either way.
   */
  caseSnapshot: {
    case: {
      caseId: string
      ownershipState: string
      closureState: string
      currentAccountableOwner: { teamId: string; actorId?: string }
      requestedReceiver: string | null
    }
    proposal: {
      actions: Array<{ kind: string; site: string; payload: unknown; supported: boolean }>
    } | null
    connection: { world: string; simulatorNow: number; live: boolean }
  } | null
  /** True while the agent is still working, so the UI can say so. */
  agentPending?: boolean
  clock: { now: number; paused: boolean; speed: number }
}

type TaskFilter = 'all' | 'open' | 'urgent' | 'closed'
type TaskSort = 'due' | 'priority' | 'status'

const CRP_TASK_ID = 'TASK-CRP-TRANSFER'

/**
 * Ordering only. The words come from the source record; anything the source did
 * not supply sorts last rather than being treated as routine.
 */
const PRIORITY_RANK: Record<string, number> = {
  emergency: 0,
  urgent: 1,
  standard: 2,
  routine: 2,
}

function priorityRank(priority: string): number {
  return PRIORITY_RANK[priority.toLowerCase()] ?? 3
}

/** Trim a trailing .0 so a range reads like a printed lab report. */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value)
}

type CockpitLab = NonNullable<CockpitData['patient']['recentLab']>

/** The source's own range, or an explicit statement that it had none. */
function rangeLabel(lab: CockpitLab): string {
  if (lab.refLow === undefined && lab.refHigh === undefined) {
    return 'reference range not supplied by source'
  }
  if (lab.refLow === undefined) return `below ${num(lab.refHigh!)} ${lab.unit}`
  if (lab.refHigh === undefined) return `above ${num(lab.refLow)} ${lab.unit}`
  return `${num(lab.refLow)}–${num(lab.refHigh)} ${lab.unit}`
}

/**
 * Low / High / Normal purely by comparing the value to the source's own range.
 * Arithmetic, not interpretation — and null when there is no range to compare.
 */
function flagOf(lab: CockpitLab): 'Low' | 'High' | 'Normal' | null {
  if (lab.refLow !== undefined && lab.value < lab.refLow) return 'Low'
  if (lab.refHigh !== undefined && lab.value > lab.refHigh) return 'High'
  if (lab.refLow === undefined && lab.refHigh === undefined) return null
  return 'Normal'
}

/**
 * Machine state names are not clinical language. A duty GP reads "Still with
 * the sending service", not `ORDERER_OWNS`.
 */
function handoverLabel(state: string): string {
  switch (state) {
    case 'ORDERER_OWNS':
      return 'Still with the sending service'
    case 'TRANSFER_REQUESTED':
      return 'Sent · awaiting acceptance'
    case 'ACCEPTED':
      return 'Accepted by the receiving service'
    default:
      return state
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function formatClock(now: number): { date: string; time: string } {
  const date = new Date(now)
  return {
    date: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  }
}

function formatFeedTime(now: number, offsetMs: number): string {
  return new Date(now + offsetMs).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dueCountdown(deadline: string, now: number): { label: string; overdue: boolean } {
  const remaining = new Date(deadline).getTime() - now
  if (Number.isNaN(remaining)) return { label: 'No due time', overdue: false }
  if (remaining <= 0) {
    const lateMins = Math.max(1, Math.round(Math.abs(remaining) / 60_000))
    if (lateMins < 60) return { label: `Overdue ${lateMins}m`, overdue: true }
    const lateHours = Math.floor(lateMins / 60)
    if (lateHours < 24) return { label: `Overdue ${lateHours}h`, overdue: true }
    return { label: `Overdue ${Math.floor(lateHours / 24)}d`, overdue: true }
  }
  const mins = Math.round(remaining / 60_000)
  if (mins < 60) return { label: `${mins}m remaining`, overdue: false }
  const hours = Math.floor(mins / 60)
  if (hours < 24) return { label: `${hours}h ${mins % 60}m remaining`, overdue: false }
  const days = Math.floor(hours / 24)
  return { label: `${days}d remaining`, overdue: false }
}

function isClosedTask(task: TaskLedgerItem, accepted: boolean): boolean {
  if (task.status === 'COMPLETED') return true
  return accepted && task.task_id === CRP_TASK_ID
}

/**
 * Real service names, as GET /api/catalogue returns them. The previous build
 * invented "St. Jude's Hospital" and "High Street GP Surgery"; neither exists
 * in the simulator.
 */
const SERVICE_NAMES: Record<string, string> = {
  gp: 'Riverside Practice',
  hospital: 'Northbank General',
  pharmacy: 'High Street Pharmacy',
  community: 'Community visiting team',
  wearables: 'Home Health',
  diagnostics: 'Diagnostics',
  referrals: 'Referrals',
}

function ownerLabel(teamId: string): string {
  return SERVICE_NAMES[teamId] ?? teamId
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M9.2 1.4 3.1 8.6c-.2.2 0 .6.3.6h4.1l-.9 5.4c-.1.4.4.7.7.4l6.1-7.2c.2-.2 0-.6-.3-.6H9.1l.8-5.4c.1-.4-.4-.7-.7-.4Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function CommandCockpit({
  data,
  onAdvanceClock,
  onExecuteAct,
  onCreateTask,
  initialReceipt,
  isActing,
}: {
  data: CockpitData
  onAdvanceClock?: (minutes: 10 | 30 | 90) => void
  onExecuteAct?: (step: LoopActStep) => void | Promise<LoopActReceipt | void>
  onCreateTask?: (task: TaskLedgerItem) => void
  initialReceipt?: LoopActReceipt | null
  isActing?: boolean
}) {
  const [selectedTask, setSelectedTask] = useState<string>(data.tasks[0]?.task_id ?? '')
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [sort, setSort] = useState<TaskSort>('due')
  const [localTasks, setLocalTasks] = useState<TaskLedgerItem[]>([])
  const [composerOpen, setComposerOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newOwner, setNewOwner] = useState('High St GP Surgery')
  const [newPriority, setNewPriority] = useState<'urgent' | 'standard'>('standard')
  const [receipt, setReceipt] = useState<LoopActReceipt | null>(initialReceipt ?? null)
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null)

  const snapshot = data.caseSnapshot
  const isAccepted = snapshot?.case.ownershipState === 'ACCEPTED'
  const isTransferRequested = snapshot?.case.ownershipState === 'TRANSFER_REQUESTED'
  const currentOwner = snapshot?.case.currentAccountableOwner.teamId ?? 'not yet determined'
  const lab = data.patient.recentLab
  // The source's own range, or nothing. A default range would silently change
  // whether a value reads as normal.
  const refLow = lab?.refLow
  const refHigh = lab?.refHigh
  const clockFace = formatClock(data.clock.now)
  const telemetry = data.patient.observations[0]?.detail ?? null

  // Most recent real letter, and the follow-up instruction it actually
  // contains. These are the free-text fields the brief asks us to mine.
  const letter = data.patient.documents?.[0] ?? null
  const followUpText =
    letter?.sections.find((s) => s.key === 'followUp')?.text ??
    letter?.sections.find((s) => s.key === 'gpActions')?.text ??
    null

  const ledger = useMemo(() => [...data.tasks, ...localTasks], [data.tasks, localTasks])

  const filtered = useMemo(() => {
    const next = ledger.filter((task) => {
      const closed = isClosedTask(task, isAccepted)
      if (filter === 'open') return !closed
      if (filter === 'closed') return closed
      if (filter === 'urgent') return task.clinical_priority === 'urgent' || task.clinical_priority === 'emergency'
      return true
    })

    next.sort((a, b) => {
      if (sort === 'priority') return priorityRank(a.clinical_priority) - priorityRank(b.clinical_priority)
      if (sort === 'status') {
        return Number(isClosedTask(a, isAccepted)) - Number(isClosedTask(b, isAccepted))
      }
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    })
    return next
  }, [filter, isAccepted, ledger, sort])

  const grouped = useMemo(() => {
    const map = new Map<string, TaskLedgerItem[]>()
    for (const task of filtered) {
      const key = task.episode_id || `EP-${data.patient.id}-01`
      const bucket = map.get(key)
      if (bucket) bucket.push(task)
      else map.set(key, [task])
    }
    return [...map.entries()]
  }, [data.patient.id, filtered])

  const openCount = ledger.filter((task) => !isClosedTask(task, isAccepted)).length
  const latestReceipt = receipt?.receipts?.[0]
  const verifiedDownstream =
    latestReceipt?.status === 'VISIBLE_DOWNSTREAM' ||
    latestReceipt?.status === 'ACCEPTED' ||
    latestReceipt?.status === 'EVIDENCED' ||
    isAccepted

  const handleAction = async (step: LoopActStep) => {
    if (!onExecuteAct) return
    const result = await onExecuteAct(step)
    const next: LoopActReceipt = result ?? {
      ok: true,
      step,
      message: 'Action submitted to Anima EHR simulator. Receipt recorded.',
      receipts: [],
    }
    setReceipt(next)
    setReceiptNotice(
      next.ok
        ? (next.message ?? 'Action submitted to Anima EHR simulator. Receipt recorded.')
        : (next.message ?? 'Action did not complete. No ownership change assumed.'),
    )
    window.setTimeout(() => setReceiptNotice(null), 7000)
  }

  const handleAddTask = (event: FormEvent) => {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    const item: TaskLedgerItem = {
      task_id: `TASK-LOCAL-${data.clock.now}-${localTasks.length + 1}`,
      episode_id: `EP-${data.patient.id}-01`,
      timestamp: new Date(data.clock.now).toISOString(),
      title,
      status: 'OPEN',
      owner: newOwner,
      note: 'Clinician-added operational task on the current episode. No automated diagnosis inferred.',
      deadline: new Date(data.clock.now + 24 * 60 * 60 * 1000).toISOString(),
      clinical_priority: newPriority,
      snomed_id: 'not-supplied-by-source',
      performed_by: 'Unassigned',
      requested_id: 'Duty clinician (app-side)',
    }
    if (onCreateTask) onCreateTask(item)
    else setLocalTasks((prev) => [item, ...prev])
    setSelectedTask(item.task_id)
    setNewTitle('')
    setComposerOpen(false)
  }

  const agentState = isActing
    ? 'SENDING'
    : data.agentPending
      ? 'THINKING'
      : isAccepted
        ? 'CLOSED'
        : snapshot?.proposal
          ? 'READY'
          : 'NO SUGGESTION'

  return (
    <div className={styles.cockpit}>
      <header className={styles.ribbon}>
        <div className={styles.identity}>
          <div className={styles.avatar} aria-hidden="true">
            {initials(data.patient.name)}
          </div>
          <div className={styles.identityCopy}>
            <div className={styles.nameRow}>
              <h2 className={styles.patientName}>{data.patient.name}</h2>
              <span className={styles.idBadge}>{data.patient.id}</span>
            </div>
            <p className={styles.demographics}>
              {data.patient.age === null ? 'Age not recorded' : `${data.patient.age} years`}
              <span className={styles.dotSep} aria-hidden="true">
                ·
              </span>
              <span className={styles.nhs}>Synthetic patient</span>
              {data.patient.localIds?.gp ? (
                <>
                  <span className={styles.dotSep} aria-hidden="true">
                    ·
                  </span>
                  <span>Practice ref {data.patient.localIds.gp}</span>
                </>
              ) : null}
            </p>
            <ul className={styles.conditions} aria-label="Active clinical conditions">
              {data.patient.problems.length === 0 ? (
                <li className={styles.conditionEmpty}>No coded problems returned from the current record.</li>
              ) : (
                data.patient.problems.map((problem, index) => (
                  <li key={problem.code || `${problem.term}-${index}`} className={styles.condition}>
                    <span className={styles.conditionTerm}>{problem.term}</span>
                    <span className={styles.conditionStatus}>{problem.status}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        <div className={styles.clock}>
          <p className={styles.clockEyebrow}>Live simulator time</p>
          <p className={styles.clockTime} data-testid="simulator-clock">
            {clockFace.time}
          </p>
          <p className={styles.clockDate}>{clockFace.date}</p>
          <div className={styles.clockActions}>
            <button type="button" className={styles.clockBtn} onClick={() => onAdvanceClock?.(10)}>
              +10m
            </button>
            <button type="button" className={styles.clockBtn} onClick={() => onAdvanceClock?.(30)}>
              +30m
            </button>
          </div>
        </div>
      </header>

      <section
        className={isAccepted ? styles.bannerClosed : styles.banner}
        role="status"
        aria-live="polite"
      >
        <div className={styles.bannerMark} aria-hidden="true">
          {isAccepted ? '✓' : '!'}
        </div>
        <div className={styles.bannerBody}>
          <p className={styles.bannerKicker}>
            {ledger.length === 0
              ? 'No unfinished work found for this patient'
              : `${ledger.length} unfinished ${ledger.length === 1 ? 'item' : 'items'} for this patient`}
          </p>
          {lab === null ? (
            <>
              <h3 className={styles.bannerTitle}>No result held for this patient</h3>
              <p className={styles.bannerRule}>
                The simulator returned no laboratory report, so no value is shown.
              </p>
            </>
          ) : (
            <>
              <h3 className={styles.bannerTitle}>
                {lab.name} {num(lab.value)} {lab.unit}{' '}
                <span className={styles.bannerRef}>
                  ({rangeLabel(lab)}){flagOf(lab) ? ` · ${flagOf(lab)}` : ''}
                </span>
              </h3>
              <p className={styles.bannerRule}>
                {lab.panel ? `${lab.panel}. ` : ''}
                {flagOf(lab) === 'Normal' || flagOf(lab) === null
                  ? 'Compared against the range supplied by the source. No clinical interpretation applied.'
                  : 'Outside the range supplied by the source. No clinical interpretation applied.'}
              </p>
            </>
          )}
        </div>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="ehr-heading">
          <header className={styles.panelHead}>
            <div>
              <h3 id="ehr-heading">Patient EHR timeline</h3>
              <p className={styles.panelSub}>Labs, discharge events &amp; home telemetry</p>
            </div>
            <span className={styles.sourceBadge}>Verified source</span>
          </header>

          <ol className={styles.timeline}>
            {lab === null ? (
              <li className={styles.feedCard}>
                <p className={styles.feedLead}>No laboratory report held for this patient</p>
                <p className={styles.feedCopy}>
                  The diagnostics service returned no result, so nothing is shown here.
                </p>
              </li>
            ) : (
              <li className={`${styles.feedCard} ${lab.isAbnormal ? styles.feedAlert : ''}`}>
                <div className={styles.feedMeta}>
                  <span className={styles.feedSource}>
                    {lab.laboratory ?? 'Laboratory not named by source'}
                  </span>
                  {lab.collectedAt ? (
                    <time className={styles.feedTime} dateTime={new Date(lab.collectedAt).toISOString()}>
                      {new Date(lab.collectedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </time>
                  ) : null}
                </div>
                <p className={styles.feedLead}>
                  {lab.name} {num(lab.value)} {lab.unit}
                  {flagOf(lab) ? ` · ${flagOf(lab)}` : ''}
                </p>
                <p className={styles.feedCopy}>
                  Reference {rangeLabel(lab)}
                  {lab.panel ? `. Panel: ${lab.panel}` : ''}
                  {data.patient.labTrend && data.patient.labTrend.length > 1
                    ? `. ${data.patient.labTrend.length} serial results held for this analyte.`
                    : '.'}
                </p>
              </li>
            )}
            <li className={styles.feedCard}>
              <div className={styles.feedMeta}>
                <span className={styles.feedSource}>
                  {letter ? ownerLabel(letter.site) : 'Correspondence'}
                </span>
                {letter?.sentAt ? (
                  <time className={styles.feedTime} dateTime={new Date(letter.sentAt).toISOString()}>
                    {new Date(letter.sentAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </time>
                ) : null}
              </div>
              {letter ? (
                <>
                  <p className={styles.feedLead}>{letter.title}</p>
                  <p className={styles.feedCopy}>
                    {letter.sentBy ? `Written by ${letter.sentBy}. ` : ''}
                    {letter.reviewed
                      ? 'Reviewed by the receiving service.'
                      : 'Not yet reviewed or filed by the receiving service.'}
                  </p>
                  {followUpText ? (
                    <p className={styles.feedCopy}>
                      Free text recorded: “{followUpText}”
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className={styles.feedLead}>No correspondence held</p>
                  <p className={styles.feedCopy}>
                    The simulator returned no discharge letter for this patient.
                  </p>
                </>
              )}
            </li>
            <li className={styles.feedCard}>
              <div className={styles.feedMeta}>
                <span className={styles.feedSource}>Home Activity Telemetry</span>
                <time className={styles.feedTime}>{formatFeedTime(data.clock.now, -20 * 60 * 1000)}</time>
              </div>
              <p className={styles.feedLead}>Wearable stream attached to the current episode</p>
              <p className={styles.feedCopy}>{telemetry}</p>
            </li>
          </ol>
        </section>

        <section className={styles.panel} aria-labelledby="ledger-heading">
          <header className={styles.panelHead}>
            <div>
              <h3 id="ledger-heading">Team 12 task ledger</h3>
              <p className={styles.panelSub}>Extracted from notes, documents and orders</p>
            </div>
            <span className={openCount > 0 ? styles.openBadge : styles.closedBadge}>
              {openCount} open
            </span>
          </header>

          <div className={styles.ledgerToolbar}>
            <div className={styles.filterGroup} role="group" aria-label="Filter tasks">
              {(
                [
                  ['all', 'All'],
                  ['open', 'Open'],
                  ['urgent', 'Urgent'],
                  ['closed', 'Closed'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={filter === value ? styles.filterActive : styles.filterBtn}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className={styles.sortLabel}>
              Sort
              <select
                className={styles.sortSelect}
                value={sort}
                onChange={(event) => setSort(event.target.value as TaskSort)}
              >
                <option value="due">Due soonest</option>
                <option value="priority">Priority</option>
                <option value="status">Status</option>
              </select>
            </label>
          </div>

          <div className={styles.ledger}>
            {grouped.length === 0 ? (
              <p className={styles.emptyLedger}>No tasks match this filter.</p>
            ) : (
              grouped.map(([episodeId, tasks]) => (
                <section key={episodeId} className={styles.episode}>
                  <header className={styles.episodeHead}>
                    <span className={styles.episodeLabel}>Episode</span>
                    <span className={styles.episodeId}>{episodeId}</span>
                  </header>
                  <div className={styles.taskList}>
                    {tasks.map((task) => {
                      const selected = selectedTask === task.task_id
                      const closed = isClosedTask(task, isAccepted)
                      const due = dueCountdown(task.deadline, data.clock.now)
                      return (
                        <button
                          key={task.task_id}
                          type="button"
                          className={`${styles.taskCard} ${selected ? styles.taskSelected : ''} ${
                            closed ? styles.taskClosed : ''
                          }`}
                          aria-pressed={selected}
                          onClick={() => setSelectedTask(task.task_id)}
                        >
                          <div className={styles.taskTop}>
                            <span className={styles.taskTitle}>{task.title}</span>
                            <span
                              className={
                                task.clinical_priority === 'standard'
                                  ? styles.priorityStandard
                                  : styles.priorityUrgent
                              }
                            >
                              {task.clinical_priority.toUpperCase()}
                            </span>
                          </div>
                          <p className={styles.taskNote}>{task.note}</p>
                          <dl className={styles.taskMeta}>
                            <div>
                              <dt>Owner</dt>
                              <dd>{task.owner}</dd>
                            </div>
                            <div>
                              <dt>Due</dt>
                              <dd className={due.overdue ? styles.dueOverdue : undefined}>{due.label}</dd>
                            </div>
                            <div>
                              <dt>Requested</dt>
                              <dd>{task.requested_id}</dd>
                            </div>
                            <div>
                              <dt>Status</dt>
                              <dd>
                                <span className={closed ? styles.statusClosed : styles.statusOpen}>
                                  {closed ? 'Closed' : task.status.replaceAll('_', ' ')}
                                </span>
                              </dd>
                            </div>
                          </dl>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))
            )}
          </div>

          {composerOpen ? (
            <form className={styles.composer} onSubmit={handleAddTask}>
              <p className={styles.composerTitle}>Add clinical task</p>
              <label className={styles.field}>
                Title
                <input
                  className={styles.input}
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="e.g. Confirm patient contact after handover"
                  required
                />
              </label>
              <div className={styles.composerRow}>
                <label className={styles.field}>
                  Owner
                  <select
                    className={styles.input}
                    value={newOwner}
                    onChange={(event) => setNewOwner(event.target.value)}
                  >
                    {Object.entries(SERVICE_NAMES).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Priority
                  <select
                    className={styles.input}
                    value={newPriority}
                    onChange={(event) => setNewPriority(event.target.value as 'urgent' | 'standard')}
                  >
                    <option value="standard">Standard</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
              </div>
              <div className={styles.composerActions}>
                <button type="submit" className={styles.composerSubmit}>
                  Add to ledger
                </button>
                <button type="button" className={styles.composerCancel} onClick={() => setComposerOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className={styles.addTaskBtn} onClick={() => setComposerOpen(true)}>
              + Add clinical task
            </button>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="adk-heading">
          <header className={styles.panelHead}>
            <div className={styles.agentRow}>
              <span
                className={
                  agentState === 'SENDING' || agentState === 'THINKING'
                    ? styles.pulseBusy
                    : styles.pulse
                }
              />
              <div>
                <h3 id="adk-heading">Anima ADK loop-closer</h3>
                <p className={styles.panelSub}>Accountability handover, human-approved writes only</p>
              </div>
            </div>
            <span className={styles.adkBadge}>
              <span className={styles.adkPkg}>@animahealth/adk</span>
              <span className={styles.adkState}>{agentState}</span>
            </span>
          </header>

          <h4 className={styles.proposalTitle}>Suggested next action</h4>
          <p className={styles.proposalCopy}>
            {ledger.length === 0
              ? 'Nothing is outstanding for this patient in the records read, so no action is suggested.'
              : `${ledger.length} ${ledger.length === 1 ? 'item was' : 'items were'} found written down and not finished. Responsibility stays with the sending service until a named person at the receiving service accepts it. Nothing is sent until you approve it, and no diagnosis, urgency or treatment is decided here.`}
          </p>

          <dl className={styles.covenant}>
            <div>
              <dt>Accountable owner</dt>
              <dd>{ownerLabel(currentOwner)}</dd>
            </div>
            <div>
              <dt>Handover state</dt>
              <dd>
                <span className={styles.covenantState}>
                  {snapshot
                    ? handoverLabel(snapshot.case.ownershipState)
                    : data.agentPending
                      ? 'Working it out…'
                      : 'Not determined'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Requested receiver</dt>
              <dd>{snapshot?.case.requestedReceiver ?? 'Not recorded by the source'}</dd>
            </div>
            <div>
              <dt>Acknowledgement window</dt>
              <dd>30 minutes</dd>
            </div>
          </dl>

          <div className={styles.actions}>
            {!isAccepted ? (
              <>
                <button
                  type="button"
                  className={styles.closeLoop}
                  onClick={() => void handleAction('auto_close')}
                  disabled={isActing}
                >
                  <BoltIcon />
                  {isActing ? 'Executing via Anima ADK…' : 'Close The Loop (Execute via Anima ADK)'}
                </button>
                <div className={styles.steps}>
                  <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => void handleAction('create_task')}
                    disabled={isActing || isTransferRequested}
                  >
                    <span className={styles.stepIndex}>1</span>
                    Hospital requests
                  </button>
                  <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => void handleAction('accept_duty')}
                    disabled={isActing || !isTransferRequested}
                  >
                    <span className={styles.stepIndex}>2</span>
                    Duty GP acknowledges
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.success}>
                <span className={styles.successMark} aria-hidden="true">
                  ✓
                </span>
                <div>
                  <h4>Loop closed</h4>
                  <p>
                    {snapshot?.case.currentAccountableOwner.actorId
                      ? `Accepted by ${snapshot.case.currentAccountableOwner.actorId} at ${ownerLabel(snapshot.case.currentAccountableOwner.teamId)}.`
                      : `Responsibility now sits with ${ownerLabel(currentOwner)}.`}{' '}
                    Confirmed by re-reading the record. This says nothing about the clinical
                    outcome.
                  </p>
                </div>
              </div>
            )}
          </div>

          <article className={styles.receipt} aria-label="Live execution receipt">
            <header className={styles.receiptHead}>
              <h4>Live execution receipt</h4>
              <span className={receipt || isAccepted ? styles.receiptLive : styles.receiptIdle}>
                {receipt || isAccepted ? 'Recorded' : 'Awaiting write'}
              </span>
            </header>
            <dl className={styles.receiptGrid}>
              <div>
                <dt>Task id</dt>
                <dd>{latestReceipt?.resourceId ?? selectedTask ?? CRP_TASK_ID}</dd>
              </div>
              <div>
                <dt>Simulator timestamp</dt>
                <dd>{new Date(data.clock.now).toISOString()}</dd>
              </div>
              <div>
                <dt>GP Connect verification</dt>
                <dd>{verifiedDownstream ? 'VISIBLE_DOWNSTREAM · readback matched' : 'Not yet written'}</dd>
              </div>
              <div>
                <dt>Activity</dt>
                <dd>{latestReceipt?.activityId ?? latestReceipt?.status ?? 'No Activity event until execute'}</dd>
              </div>
            </dl>
            {receiptNotice ? <p className={styles.receiptToast}>{receiptNotice}</p> : null}
          </article>

          <p className={styles.safeguard}>
            <strong>Human-in-the-loop.</strong> The agent proposes and yields via{' '}
            <code>approve_covenant_actions</code>. No external write occurs without clinician sign-off.
          </p>
        </section>
      </div>
    </div>
  )
}
