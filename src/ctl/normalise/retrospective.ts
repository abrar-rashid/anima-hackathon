import type { SimResource } from '@/ctl/contracts'

export const RETROSPECTIVE_MARKER = 'MEDLATENCY SYNTHETIC RETROSPECTIVE EVENT v1'
const STAGES = new Set(['requested', 'ordered', 'phlebotomy_booked', 'collected', 'dispatched',
  'received', 'analysed', 'validated', 'result_available', 'reviewed', 'communicated', 'closed',
  'awaiting_vetting', 'approved', 'booked', 'safety_checked', 'scan_completed', 'images_available',
  'report_available', 'follow_up_assigned'])

export interface RetrospectiveEvent {
  time: number
  stage: string
  role: string
  completed: boolean
  investigation: string
  requestResourceId: string
}

/** Decode only the explicit seed envelope; ordinary prose is never a timestamp source. */
export function retrospectiveEvent(resource: Pick<SimResource, 'data' | 'patientId'>): RetrospectiveEvent | null {
  const text = resource.data.text
  if (typeof text !== 'string' || !text.startsWith(`${RETROSPECTIVE_MARKER}\n`)) return null
  try {
    const meta = JSON.parse(text.split('\n')[1]!)
    if (!meta || typeof meta !== 'object' || Array.isArray(meta) ||
        !resource.patientId || meta.patient_id !== resource.patientId ||
        meta.evidence_kind !== 'retrospective-narrative' || !STAGES.has(meta.stage) ||
        !['completed', 'open'].includes(meta.pathway_state) ||
        typeof meta.investigation !== 'string' || !meta.investigation.startsWith('ML-SEED-') ||
        typeof meta.request_resource_id !== 'string' ||
        typeof meta.clinical_event_at !== 'string' ||
        !/(Z|[+-]\d\d:\d\d)$/.test(meta.clinical_event_at)) return null
    const time = Date.parse(meta.clinical_event_at)
    if (!Number.isFinite(time)) return null
    return {
      time,
      stage: meta.stage,
      role: typeof meta.responsible_role === 'string' ? meta.responsible_role : 'Not supplied',
      completed: meta.pathway_state === 'completed',
      investigation: meta.investigation,
      requestResourceId: meta.request_resource_id,
    }
  } catch { return null }
}
