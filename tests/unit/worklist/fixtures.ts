import type { Finding, ScanWindow, SimPatient, SiteDescriptor } from '@/ctl/contracts'
import type { WorklistPayload } from '@/components/worklist/types'
import type { Sourced } from '@/ctl/contracts'

/**
 * Hand-authored values shaped exactly like the real captured fixtures in
 * tests/fixtures/live/ (patients-page1.json, v-gp.json, catalogue.json), so
 * the honesty test exercises real-looking IDs, names and site labels rather
 * than arbitrary strings.
 */

export const NOW = 1789286400000

export const PATIENT_AMIRA: SimPatient = {
  id: 'SIM-000001',
  name: 'Amira Khan',
  birthDate: '1952-05-12',
  conditions: ['Heart failure', 'CKD'],
  goals: ['Understand the next step', 'Avoid unnecessary travel'],
  needs: ['Home visit', 'Carer involvement'],
  localIds: { gp: 'RIV-0', hospital: 'NBG-10000' },
  synthetic: true,
}

export const SITES_FIXTURE: SiteDescriptor[] = [
  { id: 'gp', name: 'GP Records', subtitle: 'Riverside Practice · primary care', kind: 'clinical' },
  { id: 'pharmacy', name: 'Pharmacy', subtitle: 'High Street Pharmacy', kind: 'clinical' },
]

export const FINDING_TASK: Finding = {
  id: 'overdue-task:r-2:2',
  detector: 'overdue-task',
  summary: 'Arrange post-discharge monitoring',
  patientId: 'SIM-000001',
  site: 'gp',
  owner: 'gp',
  priority: 'urgent',
  status: 'accepted',
  dueAt: NOW - 3 * 60 * 60 * 1000 - 20 * 60 * 1000,
  createdAt: NOW - 24 * 60 * 60 * 1000,
  breach: 'breached',
  overdueMs: 3 * 60 * 60 * 1000 + 20 * 60 * 1000,
  citations: [{ resourceId: 'r-2', version: 2, site: 'gp' }],
}

export function makeWindow(overrides: Partial<ScanWindow> = {}): ScanWindow {
  return {
    scanned: 412,
    total: 375868,
    sites: ['gp', 'hospital', 'community', 'pharmacy', 'diagnostics', 'referrals', 'wearables'],
    now: NOW,
    failedSites: [],
    ...overrides,
  }
}

export function makeWorklist(overrides: Partial<WorklistPayload> = {}): Sourced<WorklistPayload> {
  return {
    data: {
      findings: [FINDING_TASK],
      rates: [],
      window: makeWindow(),
      patients: { [PATIENT_AMIRA.id]: PATIENT_AMIRA },
      sites: SITES_FIXTURE,
      ...overrides,
    },
    fetchedAt: NOW,
    stale: false,
  }
}

/** Strings the old single-case build hardcoded. Must never appear again. */
export const FORBIDDEN_LEGACY_STRINGS = [
  'St. Jude',
  "St Jude",
  '942 104 8821',
  'Dr Ada Sim',
  'High St GP Surgery',
  'High Street GP Surgery',
]
