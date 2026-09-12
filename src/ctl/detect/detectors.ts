import type {
  BreachState,
  Citation,
  DetectorId,
  Finding,
  Rate,
  ScanWindow,
  SimResource,
} from '@/ctl/contracts'
import { hasAction, isTerminal, latestChange } from '@/ctl/normalise/resources'

/**
 * Finds clinical work that was written down and never finished.
 *
 * Every function here is pure: `now` is always a parameter, there is no I/O,
 * and no randomness. That is what lets the whole engine be tested offline
 * against real captured payloads, and it is why a wrong answer can be caught
 * rather than shrugged at.
 *
 * These detectors deliberately perform NO clinical reasoning. They compare
 * timestamps and read statuses. Priority is whatever the source record said —
 * we never compute, upgrade or infer it.
 */

/** Within this much of a deadline, work is "due within the hour" on screen. */
const DUE_SOON_MS = 60 * 60 * 1000

function breachOf(dueAt: number | undefined, now: number): BreachState {
  if (dueAt === undefined) return 'no-deadline'
  if (dueAt < now) return 'breached'
  if (dueAt - now <= DUE_SOON_MS) return 'due-soon'
  return 'on-time'
}

function citation(resource: SimResource, field?: string): Citation {
  return {
    resourceId: resource.id,
    version: resource.version,
    site: resource.site,
    ...(field ? { field } : {}),
  }
}

/**
 * Build a finding from a resource. Carries `priority` through verbatim so the
 * UI can show the source's own word, or say it was not recorded.
 */
function finding(
  detector: DetectorId,
  resource: SimResource,
  now: number,
  summary: string,
): Finding {
  const last = latestChange(resource)
  const breach = breachOf(resource.dueAt, now)
  return {
    id: `${detector}:${resource.id}:${resource.version}`,
    detector,
    summary,
    site: resource.site,
    status: resource.status,
    breach,
    citations: [citation(resource)],
    ...(resource.patientId ? { patientId: resource.patientId } : {}),
    ...(resource.owner ? { owner: resource.owner } : {}),
    ...(resource.priority ? { priority: resource.priority } : {}),
    ...(resource.dueAt !== undefined ? { dueAt: resource.dueAt } : {}),
    ...(resource.createdAt !== undefined ? { createdAt: resource.createdAt } : {}),
    ...(breach === 'breached' && resource.dueAt !== undefined
      ? { overdueMs: now - resource.dueAt }
      : {}),
    ...(last ? { staleMs: Math.max(0, now - last.time) } : {}),
  }
}

function dataString(resource: SimResource, key: string): string | undefined {
  const value = resource.data[key]
  return typeof value === 'string' ? value : undefined
}

/** Coarse, human interval. Never milliseconds or fractional hours on screen. */
export function humanInterval(ms: number): string {
  const abs = Math.abs(ms)
  const minutes = Math.round(abs / 60000)
  if (minutes < 60) return `${Math.max(minutes, 1)} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rem = minutes % 60
    return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`
  }
  const days = Math.floor(hours / 24)
  if (days < 14) return days === 1 ? '1 day' : `${days} days`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? '1 week' : `${weeks} weeks`
}

function lateness(resource: SimResource, now: number): string {
  if (resource.dueAt === undefined) return 'no deadline recorded'
  if (resource.dueAt < now) return `${humanInterval(now - resource.dueAt)} overdue`
  return `due in ${humanInterval(resource.dueAt - now)}`
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/** A task nobody finished before its deadline. */
export function detectOverdueTasks(resources: SimResource[], now: number): Finding[] {
  return resources
    .filter(
      (r) =>
        r.kind === 'task' &&
        !isTerminal(r.status) &&
        r.dueAt !== undefined &&
        r.dueAt < now,
    )
    .map((r) =>
      finding(
        'overdue-task',
        r,
        now,
        `${r.title || 'Task'} — ${lateness(r, now)}, still ${r.status}`,
      ),
    )
}

/**
 * A test was requested and no result has been filed since the request.
 *
 * This is the brief's "blood test with no result yet": a clinician must act
 * when it releases, and until then it is invisible work.
 *
 * The comparison is deliberately against results filed *after* the request.
 * Asking merely whether the patient has any result at all would let a long
 * history of previous bloods mask a test ordered this morning — Amira Khan has
 * 36 historical reports, and every new request for her would be missed.
 */
export function detectAwaitingResult(resources: SimResource[], now: number): Finding[] {
  const resultTimesByPatient = new Map<string, number[]>()
  for (const r of resources) {
    if (r.kind !== 'report' && r.kind !== 'result') continue
    if (!r.patientId) continue
    const at = r.createdAt ?? r.provenance.created?.time
    if (at === undefined) continue
    const list = resultTimesByPatient.get(r.patientId)
    if (list) list.push(at)
    else resultTimesByPatient.set(r.patientId, [at])
  }

  const requestedTest = (r: SimResource): boolean => {
    if (isTerminal(r.status)) return false
    if (r.kind.includes('test') || r.kind.includes('order')) return true
    // The simulator records some orders as a task carrying the request in its
    // title, so match those too.
    return r.kind === 'task' && /blood|test|sample|culture|patholog|swab/i.test(r.title)
  }

  return resources
    .filter((r) => {
      if (!requestedTest(r) || !r.patientId) return false
      const requestedAt = r.createdAt ?? r.provenance.created?.time
      if (requestedAt === undefined) return false
      const results = resultTimesByPatient.get(r.patientId) ?? []
      return !results.some((t) => t >= requestedAt)
    })
    .map((r) =>
      finding(
        'awaiting-result',
        r,
        now,
        `${r.title || 'Test'} requested — no result filed since the request`,
      ),
    )
}

/**
 * A discharge letter was sent and the receiving team never reviewed or filed
 * it. Sending is not receiving; this is the gap the product exists to close.
 */
export function detectUnprocessedHandovers(resources: SimResource[], now: number): Finding[] {
  return resources
    .filter(
      (r) =>
        (r.kind === 'discharge-summary' || r.kind === 'document') &&
        dataString(r, 'stage') === 'sent' &&
        !hasAction(r, ['review', 'file', 'process_document']),
    )
    .map((r) => {
      const sentBy = dataString(r, 'sentBy')
      // Two letters for the same patient from the same author read identically
      // without the send date, so a clinician cannot tell which is which.
      const sentAt = r.data.sentAt
      const when =
        typeof sentAt === 'number'
          ? new Date(sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : undefined
      const author = sentBy ? ` from ${sentBy}` : ''
      const dated = when ? ` sent ${when}` : ''
      return finding(
        'unprocessed-handover',
        r,
        now,
        `Discharge letter${author}${dated} has not been reviewed or filed`,
      )
    })
}

/** A referral was sent, the deadline passed, and no receiver accepted it. */
export function detectUnacceptedReferrals(resources: SimResource[], now: number): Finding[] {
  return resources
    .filter(
      (r) =>
        r.kind === 'referral' &&
        r.status === 'open' &&
        r.dueAt !== undefined &&
        r.dueAt < now &&
        !hasAction(r, ['accept']),
    )
    .map((r) =>
      finding(
        'unaccepted-referral',
        r,
        now,
        `Referral ${lateness(r, now)} and not yet accepted by the receiving service`,
      ),
    )
}

/** A prescription was raised but never dispensed or collected. */
export function detectUndispensedPrescriptions(resources: SimResource[], now: number): Finding[] {
  const open = new Set(['draft', 'open', 'approved'])
  return resources
    .filter(
      (r) =>
        r.kind === 'prescription' &&
        open.has(r.status) &&
        !hasAction(r, ['dispense', 'collect']),
    )
    .map((r) =>
      finding(
        'undispensed-prescription',
        r,
        now,
        `${r.title || 'Prescription'} raised but not dispensed or collected`,
      ),
    )
}

/** A patient asked for something and nobody has responded. */
export function detectUnansweredRequests(resources: SimResource[], now: number): Finding[] {
  const responded = ['review', 'accept', 'complete', 'reject', 'save_consultation', 'send_message']
  return resources
    .filter((r) => r.kind === 'request' && r.status === 'open' && !hasAction(r, responded))
    .map((r) =>
      finding(
        'unanswered-request',
        r,
        now,
        `${r.title || 'Patient request'} has had no response`,
      ),
    )
}

/**
 * Records that represent work somebody is expected to finish.
 *
 * Deliberately excludes readings and infrastructure. A wearable `observation`
 * or an occupied `bed` can sit past a `dueAt` without anything being wrong, and
 * including them drowned the worklist: 287 of 334 stalled findings on the real
 * corpus were routine home monitoring readings.
 */
const ACTIONABLE_KINDS = new Set([
  'task',
  'referral',
  'prescription',
  'request',
  'document',
  'discharge-summary',
  'report',
  'screening',
  'care-plan',
  'care-package',
  'mental-health-plan',
  'genomic-test',
  'message',
  'choice',
  'handover',
])

/**
 * The deadline passed and nothing has touched the record since. Distinct from
 * an overdue task: this catches any kind of actionable work that went quiet.
 */
export function detectStalledLoops(resources: SimResource[], now: number): Finding[] {
  return resources
    .filter((r) => {
      if (!ACTIONABLE_KINDS.has(r.kind)) return false
      if (isTerminal(r.status) || r.dueAt === undefined || r.dueAt >= now) return false
      const last = latestChange(r)
      return last !== undefined && last.time < r.dueAt
    })
    .map((r) =>
      finding(
        'stalled-loop',
        r,
        now,
        `${r.title || r.kind} — ${lateness(r, now)} with no activity since the deadline`,
      ),
    )
}

// ---------------------------------------------------------------------------
// Ranking and entry point
// ---------------------------------------------------------------------------

const BREACH_RANK: Record<BreachState, number> = {
  breached: 0,
  'due-soon': 1,
  'on-time': 2,
  'no-deadline': 3,
}

/** Source-supplied priority words only. Unrecorded sorts last, never first. */
function priorityRank(priority: string | undefined): number {
  switch (priority?.toLowerCase()) {
    case 'emergency':
      return 0
    case 'urgent':
      return 1
    case 'standard':
    case 'routine':
      return 2
    default:
      return 3
  }
}

export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const breach = BREACH_RANK[a.breach] - BREACH_RANK[b.breach]
    if (breach !== 0) return breach
    const priority = priorityRank(a.priority) - priorityRank(b.priority)
    if (priority !== 0) return priority
    const overdue = (b.overdueMs ?? 0) - (a.overdueMs ?? 0)
    if (overdue !== 0) return overdue
    // Stable tiebreak so repeated scans return an identical order.
    return a.id.localeCompare(b.id)
  })
}

export function runDetectors(resources: SimResource[], now: number): Finding[] {
  const all = [
    ...detectOverdueTasks(resources, now),
    ...detectAwaitingResult(resources, now),
    ...detectUnprocessedHandovers(resources, now),
    ...detectUnacceptedReferrals(resources, now),
    ...detectUndispensedPrescriptions(resources, now),
    ...detectUnansweredRequests(resources, now),
    ...detectStalledLoops(resources, now),
  ]
  // A resource can trip several detectors; keep the first, which is the more
  // specific one given the order above.
  const seen = new Set<string>()
  const deduped: Finding[] = []
  for (const item of all) {
    const key = `${item.citations[0]?.resourceId ?? item.id}:${item.detector}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }
  return rankFindings(deduped)
}

// ---------------------------------------------------------------------------
// Headline counters
// ---------------------------------------------------------------------------

/**
 * The four numbers on the worklist header. Each carries the real denominator
 * from the scan so the UI can never print a bare count.
 */
export function summariseFindings(findings: Finding[], window: ScanWindow): Rate[] {
  const countOf = (predicate: (f: Finding) => boolean): number =>
    findings.filter(predicate).length

  return [
    {
      label: 'Outstanding items',
      numerator: findings.length,
      denominator: window.scanned,
    },
    {
      label: 'Overdue',
      numerator: countOf((f) => f.breach === 'breached'),
      denominator: window.scanned,
    },
    {
      label: 'Awaiting result',
      numerator: countOf((f) => f.detector === 'awaiting-result'),
      denominator: window.scanned,
    },
    {
      label: 'Unreviewed handovers',
      numerator: countOf((f) => f.detector === 'unprocessed-handover'),
      denominator: window.scanned,
    },
  ]
}
