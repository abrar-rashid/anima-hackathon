import type { Finding, SimPatient, SimResource, SiteDescriptor } from '@/ctl/contracts'
import type { PatientLoopPayload, PatientLoopSourced } from '@/components/patient/types'

/**
 * Hand-authored values shaped like the real captured fixtures in
 * tests/fixtures/live/ (patients-page1.json, gpview.json, v-hospital.json,
 * catalogue.json), so tests exercise real-looking IDs, names, actors and
 * site labels rather than arbitrary strings.
 */

export const NOW = 1789374600000

export const PATIENT_AMIRA: SimPatient = {
  id: 'SIM-000001',
  name: 'Amira Khan',
  birthDate: '1952-05-12',
  conditions: ['Heart failure', 'CKD'],
  goals: ['Understand the next step', 'Avoid unnecessary travel', 'Stay at home'],
  needs: ['Home visit', 'Carer involvement'],
  localIds: { gp: 'RIV-0', legacy: 'WH-90000', hospital: 'NBG-10000' },
  synthetic: true,
}

export const SITES_FIXTURE: SiteDescriptor[] = [
  { id: 'gp', name: 'Riverside Practice', subtitle: 'primary care', color: '#163a8a' },
  { id: 'hospital', name: 'Northbank General', subtitle: 'acute care', color: '#9b1d32' },
]

export const TASK_RESOURCE: SimResource = {
  id: 'r-2',
  kind: 'task',
  title: 'Arrange post-discharge monitoring',
  status: 'accepted',
  priority: 'urgent',
  owner: 'gp',
  patientId: 'SIM-000001',
  createdAt: NOW - 24 * 60 * 60 * 1000,
  dueAt: NOW - 3 * 60 * 60 * 1000 - 20 * 60 * 1000,
  version: 2,
  visibleTo: ['gp'],
  data: {},
  site: 'gp',
  provenance: {
    created: {
      time: NOW - 24 * 60 * 60 * 1000,
      actor: { kind: 'simulation', name: 'Synthetic GP history' },
      action: 'generate_history',
      source: 'gp',
      version: 1,
    },
    changes: [
      {
        time: NOW - 12 * 60 * 60 * 1000,
        actor: { kind: 'team', name: 'team12' },
        action: 'accept',
        source: 'gp',
        version: 2,
      },
    ],
  },
}

export const DISCHARGE_SUMMARY: SimResource = {
  id: 'discharge-summary-example',
  kind: 'discharge-summary',
  title: 'Discharge summary · monitoring handover',
  status: 'sent',
  priority: 'routine',
  owner: 'hospital',
  patientId: 'SIM-000001',
  createdAt: NOW - 30 * 60 * 60 * 1000,
  version: 1,
  visibleTo: ['hospital', 'gp'],
  data: {
    stage: 'sent',
    sentAt: NOW - 30 * 60 * 60 * 1000,
    sentBy: 'Dr Morgan Bell',
    sections: {
      course: 'Observation and discharge planning completed in this fictional scenario.',
      reason: 'Synthetic admission for a monitoring review.',
      results: 'No outstanding investigations recorded in this example.',
      followUp: 'Follow-up arrangements require confirmation by the receiving team.',
      diagnoses: 'See the existing simulated problem list; no new diagnosis recorded.',
      gpActions: 'Review this handover and record its processing outcome in the simulation.',
      medicationChanges: 'No changes recorded in this example letter.',
    },
  },
  site: 'hospital',
  provenance: {
    created: {
      time: NOW - 30 * 60 * 60 * 1000,
      actor: { kind: 'simulation', name: 'Dr Morgan Bell' },
      action: 'seed',
      source: 'hospital',
      version: 1,
    },
    changes: [],
  },
}

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

export function makeObservation(id: string, timeOffsetMs: number): SimResource {
  return {
    id,
    kind: 'observation',
    title: `Routine observation ${id}`,
    status: 'filed',
    patientId: 'SIM-000001',
    version: 1,
    visibleTo: ['hospital'],
    data: {},
    site: 'hospital',
    provenance: {
      created: {
        time: NOW - timeOffsetMs,
        actor: { kind: 'simulation', name: 'Ward monitor' },
        action: 'seed',
        source: 'hospital',
        version: 1,
      },
      changes: [],
    },
  }
}

export function makePayload(overrides: Partial<PatientLoopPayload> = {}): PatientLoopPayload {
  return {
    patientId: PATIENT_AMIRA.id,
    now: NOW,
    patient: PATIENT_AMIRA,
    window: { scanned: 2, total: 300, sites: ['gp', 'hospital'], now: NOW, failedSites: [] },
    resources: [TASK_RESOURCE, DISCHARGE_SUMMARY],
    timeline: [],
    tasks: [TASK_RESOURCE],
    findings: [FINDING_TASK],
    extraction: { tasks: [], reason: null, spansRead: 7, resourcesRead: 1 },
    documents: [DISCHARGE_SUMMARY],
    proposal: { proposal: null, finding: FINDING_TASK, reason: 'No proposal built for this fixture.' },
    sites: SITES_FIXTURE,
    ...overrides,
  }
}

export function makeSourced(overrides: Partial<PatientLoopPayload> = {}): PatientLoopSourced {
  return { data: makePayload(overrides), fetchedAt: NOW, stale: false }
}

/** Strings the old single-case build hardcoded. Must never appear again. */
export const FORBIDDEN_LEGACY_STRINGS = [
  'St. Jude',
  'St Jude',
  '942 104 8821',
  '942 104',
  'Dr Ada Sim',
  'High St GP Surgery',
  'High Street GP Surgery',
]

/** Shapes seen in real NHS-number-like strings; none may ever render. */
export const NHS_NUMBER_PATTERN = /\b\d{3}\s?\d{3}\s?\d{4}\b/
