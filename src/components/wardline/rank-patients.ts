import type { Finding, SimPatient } from '@/ctl/contracts'
import type { WardlinePatient } from './types'

/**
 * Pinned demo identities, highest operational interest first.
 * Eleanor Chen leads because the analogue-to-digital and sickness-to-prevention
 * scenarios hang on her records. Pins are demo-control order, not a clinical rank.
 */
export const FEATURED_PATIENT_IDS = [
  'SIM-000006', // Eleanor Chen
  'SIM-000001', // Amira Khan
  'SIM-000002',
  'SIM-000003',
  'SIM-000004',
  'SIM-000005',
  'SIM-000007',
] as const

export function pinRankOf(patientId: string): number | null {
  const index = FEATURED_PATIENT_IDS.indexOf(patientId as (typeof FEATURED_PATIENT_IDS)[number])
  return index === -1 ? null : index
}

/**
 * How complete the directory row is, plus how much unfinished work cites it.
 * Conditions/needs/goals are counted as source-supplied fields, not interpreted.
 */
export function operationalWeight(patient: SimPatient, linkedTaskCount: number): number {
  const richness =
    patient.conditions.length +
    patient.needs.length +
    patient.goals.length +
    Object.keys(patient.localIds).length
  return linkedTaskCount * 100 + richness
}

export function countLinkedTasks(patientId: string, findings: readonly Finding[]): number {
  return findings.filter((finding) => finding.patientId === patientId).length
}

/**
 * Featured pins first (Eleanor Chen at the top), then more linked tasks,
 * then richer directory rows, then stable SIM id.
 */
export function rankPatients(
  patients: readonly SimPatient[],
  findings: readonly Finding[],
): WardlinePatient[] {
  const seen = new Set<string>()
  const unique: SimPatient[] = []
  for (const patient of patients) {
    if (seen.has(patient.id)) continue
    seen.add(patient.id)
    unique.push(patient)
  }

  return unique
    .map((patient) => {
      const linkedTaskCount = countLinkedTasks(patient.id, findings)
      return {
        ...patient,
        linkedTaskCount,
        pinRank: pinRankOf(patient.id),
        operationalWeight: operationalWeight(patient, linkedTaskCount),
      }
    })
    .sort((a, b) => {
      const pinA = a.pinRank ?? Number.POSITIVE_INFINITY
      const pinB = b.pinRank ?? Number.POSITIVE_INFINITY
      if (pinA !== pinB) return pinA - pinB
      if (b.linkedTaskCount !== a.linkedTaskCount) return b.linkedTaskCount - a.linkedTaskCount
      if (b.operationalWeight !== a.operationalWeight) return b.operationalWeight - a.operationalWeight
      return a.id.localeCompare(b.id)
    })
}
