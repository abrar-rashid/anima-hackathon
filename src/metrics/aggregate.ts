import { elapsedMinutesOf, type LatencyObservation } from '@/metrics/censoring'
import type { CaseMetrics } from '@/metrics/compute'
import {
  SMALL_N_THRESHOLD,
  STEP_TO_LATENCY,
  WORKFLOW_STEPS,
  type ClosureOutcome,
  type Denominator,
  type LatencyMetricName,
  type StateTrack,
  type WorkflowStep,
} from '@/metrics/definitions'

export interface DistributionAggregate {
  median: number | null
  highPercentile: number | null
  percentileRank: 90
  completedN: number
  openN: number
  missingN: number
  tooSmallToGeneralise: boolean
  smallNThreshold: number
  denominator: Denominator
}

export interface CountAggregate {
  value: number
  denominator: Denominator
}

export interface StalledByStep {
  step: WorkflowStep
  open: number
  overdue: number
  neverClosed: number
  medianElapsedMinutes: number | null
  tooSmallToGeneralise: boolean
  denominator: Denominator
}

export interface TimeInStateAggregate {
  track: StateTrack
  state: string
  medianMinutes: number | null
  highPercentile: number | null
  completedN: number
  openN: number
  tooSmallToGeneralise: boolean
  denominator: Denominator
}

export interface PopulationMetrics {
  latencies: Record<LatencyMetricName, DistributionAggregate>
  counts: {
    timeouts: CountAggregate
    exceptions: CountAggregate
    manualChases: CountAggregate
    duplicateAlerts: CountAggregate
    reopens: CountAggregate
  }
  closure: {
    closed: CountAggregate
    open: CountAggregate
    overdue: CountAggregate
    neverClosed: CountAggregate
  }
  stalledByStep: readonly StalledByStep[]
  timeInState: readonly TimeInStateAggregate[]
  smallN: {
    tooSmallToGeneralise: boolean
    threshold: number
    denominator: Denominator
  }
}

const LATENCY_NAMES: readonly LatencyMetricName[] = [
  'accepted_owner_latency',
  'orderer_unaccepted',
  'time_to_clinical_review',
  'time_to_plan_recorded',
  'time_to_patient_contact',
  'time_to_action_evidence',
  'time_to_outcome_evidence',
  'time_to_closed',
]

function populationDenominator(cases: readonly CaseMetrics[]): Denominator {
  return {
    cases: cases.length,
    events: cases.reduce((sum, row) => sum + row.eventCount, 0),
    traces: cases.length,
  }
}

function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0] ?? null
  const index = (sorted.length - 1) * q
  const low = Math.floor(index)
  const high = Math.ceil(index)
  const lower = sorted[low]
  const upper = sorted[high]
  if (lower === undefined || upper === undefined) return null
  if (low === high) return lower
  return lower * (1 - (index - low)) + upper * (index - low)
}

function median(values: readonly number[]): number | null {
  return quantile([...values].sort((a, b) => a - b), 0.5)
}

function highPercentile(values: readonly number[]): number | null {
  return quantile([...values].sort((a, b) => a - b), 0.9)
}

function distribute(
  observations: readonly LatencyObservation[],
  denominator: Denominator,
): DistributionAggregate {
  const completed: number[] = []
  let openN = 0
  let missingN = 0
  for (const observation of observations) {
    if (observation.status === 'completed') completed.push(observation.minutes)
    else if (observation.status === 'open') openN += 1
    else missingN += 1
  }
  return {
    median: median(completed),
    highPercentile: highPercentile(completed),
    percentileRank: 90,
    completedN: completed.length,
    openN,
    missingN,
    tooSmallToGeneralise: completed.length < SMALL_N_THRESHOLD,
    smallNThreshold: SMALL_N_THRESHOLD,
    denominator,
  }
}

function countAgg(value: number, denominator: Denominator): CountAggregate {
  return { value, denominator }
}

export function aggregateCaseMetrics(cases: readonly CaseMetrics[]): PopulationMetrics {
  const denominator = populationDenominator(cases)

  const latencies = Object.fromEntries(
    LATENCY_NAMES.map((name) => [name, distribute(cases.map((row) => row.latencies[name]), denominator)]),
  ) as Record<LatencyMetricName, DistributionAggregate>

  const closureCount = (outcome: ClosureOutcome): number =>
    cases.filter((row) => row.closure.outcome === outcome).length

  const stalledByStep: StalledByStep[] = WORKFLOW_STEPS.map((step) => {
    const members = cases.filter((row) => row.stalledStep === step)
    const elapsed = members
      .map((row) => elapsedMinutesOf(row.latencies[STEP_TO_LATENCY[step]]))
      .filter((value): value is number => value !== null)
    const byOutcome = (outcome: ClosureOutcome): number =>
      members.filter((row) => row.closure.outcome === outcome).length
    return {
      step,
      open: byOutcome('open'),
      overdue: byOutcome('overdue'),
      neverClosed: byOutcome('never_closed'),
      medianElapsedMinutes: median(elapsed),
      tooSmallToGeneralise: members.length < SMALL_N_THRESHOLD,
      denominator,
    }
  })

  const dwellKey = (track: StateTrack, state: string): string => `${track}:${state}`
  const dwellGroups = new Map<string, { track: StateTrack; state: string; completed: number[]; openN: number }>()
  for (const row of cases) {
    for (const dwell of row.timeInState) {
      const key = dwellKey(dwell.track, dwell.state)
      const group = dwellGroups.get(key) ?? { track: dwell.track, state: dwell.state, completed: [], openN: 0 }
      if (dwell.censored) group.openN += 1
      else group.completed.push(dwell.minutes)
      dwellGroups.set(key, group)
    }
  }

  const timeInState: TimeInStateAggregate[] = [...dwellGroups.values()]
    .sort((a, b) => a.track.localeCompare(b.track) || a.state.localeCompare(b.state))
    .map((group) => ({
      track: group.track,
      state: group.state,
      medianMinutes: median(group.completed),
      highPercentile: highPercentile(group.completed),
      completedN: group.completed.length,
      openN: group.openN,
      tooSmallToGeneralise: group.completed.length < SMALL_N_THRESHOLD,
      denominator,
    }))

  return {
    latencies,
    counts: {
      timeouts: countAgg(
        cases.reduce((sum, row) => sum + row.counts.timeouts, 0),
        denominator,
      ),
      exceptions: countAgg(
        cases.reduce((sum, row) => sum + row.counts.exceptions, 0),
        denominator,
      ),
      manualChases: countAgg(
        cases.reduce((sum, row) => sum + row.counts.manualChases, 0),
        denominator,
      ),
      duplicateAlerts: countAgg(
        cases.reduce((sum, row) => sum + row.counts.duplicateAlerts, 0),
        denominator,
      ),
      reopens: countAgg(
        cases.reduce((sum, row) => sum + row.counts.reopens, 0),
        denominator,
      ),
    },
    closure: {
      closed: countAgg(closureCount('closed'), denominator),
      open: countAgg(closureCount('open'), denominator),
      overdue: countAgg(closureCount('overdue'), denominator),
      neverClosed: countAgg(closureCount('never_closed'), denominator),
    },
    stalledByStep,
    timeInState,
    smallN: {
      tooSmallToGeneralise: cases.length < SMALL_N_THRESHOLD,
      threshold: SMALL_N_THRESHOLD,
      denominator,
    },
  }
}

export function tooSmallToGeneralise(n: number, threshold = SMALL_N_THRESHOLD): boolean {
  return n < threshold
}
