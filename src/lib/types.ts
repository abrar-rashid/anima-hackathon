// CareClosure domain model.
// Core idea: care failures live at BOUNDARIES between organisations, not inside them.
// So we model lanes (organisational state) AND handoffs (boundary state) as first-class.

export type Lane = "hospital" | "gp" | "pharmacy" | "community" | "home";

export const LANES: Lane[] = ["hospital", "gp", "pharmacy", "community", "home"];

export const LANE_LABEL: Record<Lane, string> = {
  hospital: "Hospital",
  gp: "GP",
  pharmacy: "Pharmacy",
  community: "Community",
  home: "Home",
};

export type Priority = "emergency" | "urgent" | "standard";

/** Lifecycle of a single obligation. Ordered from least to most progressed. */
export type ObligationStatus =
  | "unowned" // exists, nobody is accountable
  | "sent" // dispatched across a boundary, not yet received
  | "received" // landed in a system, not yet accepted by a human
  | "accepted" // a named person took it on
  | "in_progress"
  | "completed"
  | "not_shared"; // we are not permitted to see the state

/** What the rail paints. Derived, never stored. */
export type NodeState =
  | "closed" // completed with sufficient evidence  -> solid teal
  | "waiting" // live, inside policy time            -> pulsing amber
  | "breached" // expected, overdue or unowned        -> dashed red
  | "unverifiable"; // data not available to us        -> grey

export type EvidenceKind =
  | "document_sent"
  | "document_filed"
  | "result_acknowledged"
  | "medication_reconciled"
  | "medication_dispensed"
  | "visit_performed"
  | "patient_contact"
  | "referral_accepted";

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  document_sent: "Document transmitted",
  document_filed: "Document filed to record",
  result_acknowledged: "Result acknowledged by a clinician",
  medication_reconciled: "Medicines reconciled",
  medication_dispensed: "Medication dispensed",
  visit_performed: "Visit performed",
  patient_contact: "Patient contacted and responded",
  referral_accepted: "Referral accepted by receiving service",
};

export interface Actor {
  id: string;
  name: string;
  role: string;
  org: string;
  lane: Lane;
  /** Rostered on right now? Drives "is the next person available". */
  available?: boolean;
  /** Holds the authorisation this obligation needs? */
  authorised_for?: string[];
}

export interface SourceRef {
  system: string; // which source system the fact came from
  record_id: string;
  record_type: string;
  at: string; // ISO
  excerpt?: string; // verbatim free text, for provenance
}

export interface Evidence {
  kind: EvidenceKind;
  at: string;
  actor_id: string;
  record_id: string;
  note?: string;
}

export interface Transition {
  at: string;
  kind: "created" | "sent" | "received" | "accepted" | "completed" | "rejected";
  from_lane: Lane | null;
  to_lane: Lane | null;
  actor_id: string | null;
  note?: string;
}

export interface Obligation {
  id: string;
  episode_id: string;
  /** Lane accountable for DOING the work. */
  lane: Lane;
  /** Lane the work originated from. lane !== origin_lane means it crossed a boundary. */
  origin_lane: Lane;
  title: string;
  detail: string;
  snomed: { code: string; term: string };
  priority: Priority;
  created_at: string;
  /** Policy-derived. Recomputed by the engine, seeded here for clarity. */
  due_at: string;
  owner_id: string | null;
  next_owner_id: string | null;
  status: ObligationStatus;
  requires_evidence: EvidenceKind[];
  evidence: Evidence[];
  transitions: Transition[];
  source: SourceRef[];
  /** Plain-English statement of what proves the loop closed. Shown to clinicians. */
  closure_rule: string;
  /** Continuity route if the primary owner cannot act. */
  alternate_route?: string;
  /** Obligations that cannot safely proceed until this one closes. */
  blocks?: string[];
  depends_on?: string[];
  /** True when the source system will not share state with US. Honest unknown. */
  opaque?: boolean;
  /**
   * Sites that must be able to read this record to act safely, but cannot.
   * Different from `opaque`: we can see it, they cannot. That is provable,
   * so it is a breach rather than an unknown.
   */
  blind_to?: string[];
  /** Policy class key, indexes into POLICY. */
  policy_class: PolicyClass;
}

export type PolicyClass =
  | "discharge_summary_transmission"
  | "discharge_summary_filing"
  | "microbiology_result_action"
  | "renal_recheck"
  | "medicines_reconciliation"
  | "cancer_pathway_referral"
  | "community_nursing_visit"
  | "post_discharge_contact"
  | "medication_review";

export type ExceptionKind =
  | "MISSING_OWNER"
  | "UNACCEPTED_WORK"
  | "OVERDUE"
  | "INSUFFICIENT_EVIDENCE"
  | "ROUTE_BROKEN"
  | "AUTHORISATION_GAP"
  | "VISIBILITY_GAP"
  | "UNABLE_TO_VERIFY";

export const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  MISSING_OWNER: "No owner",
  UNACCEPTED_WORK: "Not accepted",
  OVERDUE: "Overdue",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  ROUTE_BROKEN: "Handoff never routed",
  AUTHORISATION_GAP: "Authorisation gap",
  VISIBILITY_GAP: "Cannot be seen by who needs it",
  UNABLE_TO_VERIFY: "Unable to verify",
};

export type Severity = "critical" | "high" | "moderate" | "info";

/** CareClosure only ever routes, chases or verifies. It never recommends treatment. */
export type ActionKind =
  | "route_to_clinician"
  | "chase_owner"
  | "assign_owner"
  | "request_access"
  | "call_patient"
  | "book_appointment";

export interface SafestNextStep {
  action: ActionKind;
  label: string;
  target_actor_id: string | null;
  message: string;
  rationale: string;
  policy_ref: string;
  /** Explicit guard rail rendered in the UI. */
  clinical_boundary: string;
}

/** The eight measures. This is the product's actual insight, not "task is overdue". */
export interface BoundaryDwell {
  boundary: string;
  from_lane: Lane | null;
  to_lane: Lane | null;
  hours: number;
  /** Still sitting here right now. */
  open: boolean;
}

export interface Exception {
  obligation_id: string;
  kinds: ExceptionKind[];
  severity: Severity;

  // 1. who owns it now
  owner_now: Actor | null;
  // 2. who must receive it next
  must_receive_next: Actor | null;
  // 3. how long it has waited at each boundary
  boundary_dwell: BoundaryDwell[];
  total_open_hours: number;
  // 4. whether the next person is available and authorised
  next_actor_available: boolean | null;
  next_actor_authorised: boolean | null;
  // 5. what information is missing
  missing_information: string[];
  // 6. when delay becomes unsafe under approved policy
  unsafe_at: string | null;
  hours_to_unsafe: number | null;
  past_unsafe: boolean;
  // 7. what alternate route preserves continuity
  alternate_route: string | null;
  // 8. what evidence proves the loop closed
  closure_evidence_required: EvidenceKind[];
  closure_evidence_held: EvidenceKind[];

  // Right-panel narrative
  expected: string;
  found: string;
  safest_next_step: SafestNextStep;
  policy_ref: string;
}

/** A handoff between two adjacent lanes. Failures live here. */
export interface Handoff {
  id: string;
  from_lane: Lane;
  to_lane: Lane;
  state: NodeState;
  /** Obligations whose accountability crosses this boundary. */
  obligation_ids: string[];
  dwell_hours: number | null;
  label: string;
}

export interface RailNode {
  lane: Lane;
  label: string;
  org: string;
  state: NodeState;
  obligation_ids: string[];
  closed: number;
  total: number;
  headline: string;
}

export interface Rail {
  episode_id: string;
  patient: Patient;
  now: string;
  nodes: RailNode[];
  handoffs: Handoff[];
  exceptions: Exception[];
  closure_percent: number;
}

export interface Patient {
  id: string;
  nhs_number: string;
  name: string;
  dob: string;
  age: number;
  sex: string;
  address: string;
  phone: string;
  language: string;
  lives_alone: boolean;
  gp_practice: string;
  flags: string[];
}

/** Append-only. Proves who acted and when. Never mutated. */
export interface LedgerEntry {
  seq: number;
  at: string; // sim time
  wall_at: string; // real time, so the trail is auditable
  episode_id: string;
  obligation_id: string | null;
  actor: string;
  actor_kind: "agent" | "clinician" | "system" | "patient";
  event: string;
  detail: string;
  evidence_ref?: string;
  /** Agent reasoning trace, shown in the drawer. */
  trace?: TraceStep[];
}

export interface TraceStep {
  step: string;
  input?: string;
  output?: string;
  ms?: number;
}

export interface EhrBundle {
  patient: Patient;
  episode_id: string;
  documents: EhrDocument[];
  observations: EhrObservation[];
  orders: EhrOrder[];
  medications: EhrMedication[];
  referrals: EhrReferral[];
  actors: Actor[];
  /** Discharge datetime, anchor for the whole chain. */
  discharge_at: string;
}

export interface EhrDocument {
  id: string;
  system: string;
  type: string;
  authored_at: string;
  author_id: string;
  title: string;
  body: string;
  sent_to?: { org: string; at: string; channel: string }[];
  filed_by?: { actor_id: string; at: string };
}

export interface EhrObservation {
  id: string;
  system: string;
  code: string;
  name: string;
  value: string;
  unit?: string;
  flag?: "normal" | "abnormal" | "critical";
  taken_at: string;
  released_at: string | null;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  note?: string;
}

export interface EhrOrder {
  id: string;
  system: string;
  code: string;
  name: string;
  requested_at: string;
  requested_by: string;
  sample_id?: string;
  status: "requested" | "collected" | "resulted" | "cancelled";
  result_observation_id?: string;
}

export interface EhrMedication {
  id: string;
  system: string;
  name: string;
  dose: string;
  route: string;
  started_at: string;
  stopped_at?: string | null;
  source: "pre_admission" | "discharge" | "gp_repeat" | "otc";
  status: "active" | "held" | "stopped";
  note?: string;
}

export interface EhrReferral {
  id: string;
  system: string;
  to_org: string;
  to_lane: Lane;
  reason: string;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  /** Receiving system does not share status with us. */
  opaque?: boolean;
}
