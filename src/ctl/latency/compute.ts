import type {
  LatencyBucket,
  LatencyReport,
  Rate,
  ScanWindow,
  SimResource,
  StepObservation,
} from '@/ctl/contracts'
import { hasAction, isTerminal } from '@/ctl/normalise/resources'

/**
 * Where the system loses time, measured rather than asserted.
 *
 * Every number here comes from timestamps the simulator already recorded in
 * each record's audit trail. We never estimate a duration, and every figure
 * travels with the number of observations behind it, because a median over
 * three cases and a median over three hundred are different claims.
 *
 * Pure: `now` is a parameter, there is no I/O.
 */

/** Each consecutive pair of audit entries is one observed transition. */
export function observeSteps(resources: SimResource[]): StepObservation[] {
  const observations: StepObservation[] = []

  for (const resource of resources) {
    const { created, changes } = resource.provenance
    // normaliseResource sorts changes oldest-first, so consecutive pairs are
    // genuine transitions rather than an artefact of payload ordering.
    const chain = created ? [created, ...changes] : changes
    for (let i = 1; i < chain.length; i += 1) {
      const from = chain[i - 1]!
      const to = chain[i]!
      const elapsedMs = to.time - from.time
      if (elapsedMs < 0) continue
      observations.push({
        fromAction: from.action,
        toAction: to.action,
        site: resource.site,
        elapsedMs,
        resourceId: resource.id,
      })
    }
  }

  return observations
}

/**
 * Nearest-rank percentile: the value at ceil(p * n) in the sorted sample, so a
 * reported p90 is always a duration that genuinely occurred.
 */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const rank = Math.max(1, Math.ceil(p * sortedAsc.length))
  return sortedAsc[Math.min(rank, sortedAsc.length) - 1]!
}

/**
 * Conventional median, averaging the two middle values on an even sample.
 * Deliberately not nearest-rank: readers expect "median" to mean the midpoint,
 * and a typical wait is the one figure people quote without checking the
 * definition.
 */
function median(sortedAsc: number[]): number {
  const n = sortedAsc.length
  if (n === 0) return 0
  const mid = Math.floor(n / 2)
  return n % 2 === 1 ? sortedAsc[mid]! : (sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2
}

/**
 * Turn a raw audit action into something a reader recognises.
 *
 * The simulator names its seeded workflow steps `seed_document_sent`,
 * `seed_document_reviewed` and so on. Those are genuine workflow transitions
 * wearing generator names, so we keep the measurement and drop the prefix
 * rather than discarding the data or printing machine identifiers on screen.
 */
export function readableAction(action: string): string {
  const cleaned = action
    .replace(/^seed_/, '')
    .replace(/^generate_/, '')
    .replace(/[_.]/g, ' ')
    .trim()
  if (cleaned.length === 0) return action
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

export function bucketByTransition(observations: StepObservation[]): LatencyBucket[] {
  const groups = new Map<string, number[]>()
  for (const o of observations) {
    const key = `${readableAction(o.fromAction)} → ${readableAction(o.toAction)}`
    const list = groups.get(key)
    if (list) list.push(o.elapsedMs)
    else groups.set(key, [o.elapsedMs])
  }

  const buckets: LatencyBucket[] = []
  for (const [label, values] of groups) {
    if (values.length === 0) continue
    const sorted = [...values].sort((a, b) => a - b)
    buckets.push({
      label,
      n: sorted.length,
      medianMs: median(sorted),
      p90Ms: percentile(sorted, 0.9),
      maxMs: sorted[sorted.length - 1]!,
    })
  }

  // Worst typical wait first: that is the bottleneck worth fixing.
  return buckets.sort((a, b) => b.medianMs - a.medianMs)
}

/**
 * How often each kind of loop is left open, as "n of m".
 *
 * A rate is only emitted when its denominator is genuinely greater than zero,
 * so the UI can never render a fraction over nothing.
 */
export function computeBreakage(resources: SimResource[], now: number): Rate[] {
  const rates: Rate[] = []

  const push = (label: string, numerator: number, denominator: number): void => {
    if (denominator > 0) rates.push({ label, numerator, denominator })
  }

  const letters = resources.filter(
    (r) => r.kind === 'discharge-summary' || r.kind === 'document',
  )
  push(
    'Discharge letters never reviewed or filed',
    letters.filter((r) => !hasAction(r, ['review', 'file', 'process_document'])).length,
    letters.length,
  )

  const referrals = resources.filter((r) => r.kind === 'referral')
  push(
    'Referrals never accepted by a receiving service',
    referrals.filter((r) => !hasAction(r, ['accept'])).length,
    referrals.length,
  )

  const prescriptions = resources.filter((r) => r.kind === 'prescription')
  push(
    'Prescriptions never dispensed or collected',
    prescriptions.filter((r) => !hasAction(r, ['dispense', 'collect'])).length,
    prescriptions.length,
  )

  const tasks = resources.filter((r) => r.kind === 'task')
  push(
    'Tasks past their deadline',
    tasks.filter((r) => !isTerminal(r.status) && r.dueAt !== undefined && r.dueAt < now).length,
    tasks.length,
  )

  const requests = resources.filter((r) => r.kind === 'request')
  push(
    'Patient requests with no response',
    requests.filter(
      (r) => r.status === 'open' && !hasAction(r, ['review', 'accept', 'complete', 'reject']),
    ).length,
    requests.length,
  )

  return rates
}

export function computeLatency(
  resources: SimResource[],
  now: number,
  window: ScanWindow,
): LatencyReport {
  return {
    steps: bucketByTransition(observeSteps(resources)),
    breakage: computeBreakage(resources, now),
    window,
  }
}
