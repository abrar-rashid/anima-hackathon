import type { SourceClassification, TeamId } from '@/domain/types'

export const ELIGIBILITY_RULE_TEXT =
  'An analyte value lies outside the reference range supplied by the source laboratory (referenceLow..referenceHigh). No urgency, diagnosis or treatment is inferred.'

export interface BloodReportRecord {
  id: string
  version: number
  patientId: string
  visibleTo: string[]
  owner: string
  status: string
  collectedAt: number
  analytes: {
    id: string
    name: string
    unit: string
    value: number
    referenceLow: number
    referenceHigh: number
  }[]
}

function isOutOfRange(analyte: BloodReportRecord['analytes'][number]): boolean {
  return analyte.value < analyte.referenceLow || analyte.value > analyte.referenceHigh
}

export function classify(report: BloodReportRecord): SourceClassification | null {
  const analyte = report.analytes.find(isOutOfRange)
  if (!analyte) return null
  return {
    rule: 'source-reference-range',
    ruleText: ELIGIBILITY_RULE_TEXT,
    analyteId: analyte.id,
    analyteName: analyte.name,
    value: analyte.value,
    unit: analyte.unit,
    referenceLow: analyte.referenceLow,
    referenceHigh: analyte.referenceHigh,
    direction: analyte.value < analyte.referenceLow ? 'below' : 'above',
  }
}

function isWithdrawnOrCancelled(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return normalized === 'withdrawn' || normalized === 'cancelled' || normalized === 'canceled'
}

function hasCrossSettingVisibility(visibleTo: string[]): boolean {
  const sites = new Set(visibleTo)
  const shared = (sites.has('gp') ? 1 : 0) + (sites.has('hospital') ? 1 : 0)
  return shared >= 2
}

function isEligible(
  report: BloodReportRecord,
  existingCompleteCaseResultIds: string[],
): boolean {
  if (existingCompleteCaseResultIds.includes(report.id)) return false
  if (isWithdrawnOrCancelled(report.status)) return false
  if (!hasCrossSettingVisibility(report.visibleTo)) return false
  return classify(report) !== null
}

function preferByRecencyThenId(a: BloodReportRecord, b: BloodReportRecord): number {
  if (a.collectedAt !== b.collectedAt) return b.collectedAt - a.collectedAt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function selectEligible(
  reports: BloodReportRecord[],
  opts: { preferPatientId?: string; existingCompleteCaseResultIds?: string[] },
): { report: BloodReportRecord; classification: SourceClassification } | null {
  const complete = opts.existingCompleteCaseResultIds ?? []
  const eligible = reports.filter((report) => isEligible(report, complete))
  if (eligible.length === 0) return null

  const preferred = opts.preferPatientId
    ? eligible.filter((report) => report.patientId === opts.preferPatientId)
    : []
  const pool = preferred.length > 0 ? preferred : eligible
  const chosen = [...pool].sort(preferByRecencyThenId)[0]
  if (!chosen) return null
  const classification = classify(chosen)
  if (!classification) return null
  return { report: chosen, classification }
}

export function deriveOrderingTeam(i: {
  visibleTo: string[]
  hasHospitalDischargeSummary: boolean
}): { orderingTeamId: TeamId; requestedReceiver: TeamId; ruleText: string } {
  if (i.hasHospitalDischargeSummary) {
    return {
      orderingTeamId: 'hospital',
      requestedReceiver: 'gp',
      ruleText:
        'Hospital orders and GP receives when a hospital discharge summary is present; otherwise GP orders and hospital receives.',
    }
  }
  return {
    orderingTeamId: 'gp',
    requestedReceiver: 'hospital',
    ruleText:
      'Hospital orders and GP receives when a hospital discharge summary is present; otherwise GP orders and hospital receives.',
  }
}
