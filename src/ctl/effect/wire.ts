import { z } from 'zod'
import { SITES, type DetectorId, type HardStop, type Site } from '@/ctl/contracts'
import { DETECTOR_ACTIONS } from './mapping'

/**
 * Request validation for the CTL routes.
 *
 * A route may not trust a client-supplied proposal: the same body that carries
 * the payload also carries `hardStops` and `supported`, and a caller could send
 * both empty. So these schemas only guarantee shape, and the execute route
 * re-derives both verdicts server-side before writing.
 */

const SITE_VALUES = SITES as readonly Site[] as [Site, ...Site[]]
const DETECTOR_VALUES = Object.keys(DETECTOR_ACTIONS) as [DetectorId, ...DetectorId[]]

const HARD_STOP_VALUES = [
  'patient-mismatch',
  'destination-mismatch',
  'missing-staff-identity',
  'source-absent',
  'source-not-current',
  'unsupported-action',
  'missing-required-field',
  'idempotency-conflict',
  'stale-source-version',
  'requires-clinical-interpretation',
] as const satisfies readonly HardStop[]

export const SiteWire = z.enum(SITE_VALUES)
export const HardStopWire = z.enum(HARD_STOP_VALUES)

export const CitationWire = z.object({
  resourceId: z.string().min(1),
  version: z.number().int(),
  site: SiteWire,
  field: z.string().optional(),
  quote: z.string().optional(),
})

export const FindingWire = z.object({
  id: z.string().min(1),
  detector: z.enum(DETECTOR_VALUES),
  summary: z.string(),
  patientId: z.string().optional(),
  site: SiteWire,
  owner: z.string().optional(),
  priority: z.string().optional(),
  status: z.string(),
  dueAt: z.number().optional(),
  createdAt: z.number().optional(),
  breach: z.enum(['breached', 'due-soon', 'on-time', 'no-deadline']),
  overdueMs: z.number().optional(),
  staleMs: z.number().optional(),
  citations: z.array(CitationWire),
})

export const ProposalWire = z.object({
  actionType: z.string().min(1),
  site: SiteWire,
  payload: z.record(z.unknown()),
  sourceVersions: z.array(z.object({ id: z.string().min(1), version: z.number().int() })),
  idempotencyKey: z.string().min(1),
  rationale: z.string(),
  citations: z.array(CitationWire),
  hardStops: z.array(HardStopWire),
  supported: z.boolean(),
})

/**
 * App-side identity of the human approving. Simulator attribution is
 * team-level and an `Action` carries no staff field, so this is never written
 * into a record as though the source recorded it. Supplying it turns the
 * `missing-staff-identity` stop on for that request.
 */
export const StaffWire = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
})

export const ProposeRequest = z.object({ finding: FindingWire, staff: StaffWire.optional() })
export const ExecuteRequest = z.object({ proposal: ProposalWire, staff: StaffWire.optional() })
export const ExtractRequest = z.object({ patientId: z.string().min(1) })
