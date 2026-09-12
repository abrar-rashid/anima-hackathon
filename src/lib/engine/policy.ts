import type { EvidenceKind, PolicyClass, Priority, Severity } from "@/lib/types";

/**
 * Approved escalation policy. Versioned, citable, and the ONLY source of
 * "when does delay become unsafe". Nothing in the engine hard-codes a timeout.
 *
 * Each rule answers three questions for an obligation class:
 *   accept_within_h  - how long may it sit unaccepted before that is an exception
 *   complete_within_h - the clinical deadline
 *   unsafe_after_h   - the point at which delay itself becomes a safety incident
 */
export const POLICY_VERSION = "CC-P1 v1.3";

export interface PolicyRule {
  class: PolicyClass;
  label: string;
  accept_within_h: number;
  complete_within_h: number;
  unsafe_after_h: number;
  requires_evidence: EvidenceKind[];
  /** Escalate to whom, by role, when the primary owner does not act. */
  escalate_to_role: string;
  /** Human-readable basis. Shown in the right panel so a clinician can audit us. */
  basis: string;
  ref: string;
  severity_when_unsafe: Severity;
}

export const POLICY: Record<PolicyClass, PolicyRule> = {
  discharge_summary_transmission: {
    class: "discharge_summary_transmission",
    label: "Discharge summary transmitted to GP",
    accept_within_h: 24,
    complete_within_h: 24,
    unsafe_after_h: 72,
    requires_evidence: ["document_sent"],
    escalate_to_role: "Discharge coordinator",
    basis: "Electronic discharge summary to the registered practice within 24 hours of discharge.",
    ref: "NHS 10 Year Plan pp.41-42 (digitally coordinated discharge)",
    severity_when_unsafe: "high",
  },
  discharge_summary_filing: {
    class: "discharge_summary_filing",
    label: "Discharge summary reviewed and filed by GP",
    accept_within_h: 24,
    complete_within_h: 72,
    unsafe_after_h: 120,
    requires_evidence: ["document_filed"],
    escalate_to_role: "Duty GP",
    basis: "Receiving practice must review and file, extracting actions onto the practice task list.",
    ref: "NHS 10 Year Plan pp.47-48 (Single Patient Record)",
    severity_when_unsafe: "high",
  },
  microbiology_result_action: {
    class: "microbiology_result_action",
    label: "Positive microbiology result acknowledged by an authorised clinician",
    accept_within_h: 4,
    complete_within_h: 12,
    unsafe_after_h: 24,
    requires_evidence: ["result_acknowledged"],
    escalate_to_role: "On-call medical registrar",
    basis:
      "A positive culture released after discharge must be acknowledged by a clinician authorised to act on it within 4 hours, and reconciled against the discharge prescription within 12.",
    ref: "NHS 10 Year Plan p.55 (scheduling, tracking and managing against the plan)",
    severity_when_unsafe: "critical",
  },
  renal_recheck: {
    class: "renal_recheck",
    label: "Renal function rechecked after discharge",
    accept_within_h: 72,
    complete_within_h: 168,
    unsafe_after_h: 240,
    requires_evidence: ["result_acknowledged"],
    escalate_to_role: "Duty GP",
    basis: "Requested post-discharge bloods must be booked and resulted within the requested interval.",
    ref: "NHS 10 Year Plan p.55 (workflow escalation)",
    severity_when_unsafe: "high",
  },
  medicines_reconciliation: {
    class: "medicines_reconciliation",
    label: "Discharge medicines reconciled by community pharmacy",
    accept_within_h: 24,
    complete_within_h: 72,
    unsafe_after_h: 96,
    requires_evidence: ["medication_reconciled", "medication_dispensed"],
    escalate_to_role: "PCN clinical pharmacist",
    basis:
      "Discharge Medicines Service referral must be accepted within 24 hours and reconciliation completed within 72, comparing pre-admission, discharge and repeat lists.",
    ref: "NHS 10 Year Plan pp.41-42 (integrated intermediate care)",
    severity_when_unsafe: "critical",
  },
  cancer_pathway_referral: {
    class: "cancer_pathway_referral",
    label: "Incidental finding referred onto a follow-up pathway",
    accept_within_h: 72,
    complete_within_h: 168,
    unsafe_after_h: 336,
    requires_evidence: ["referral_accepted"],
    escalate_to_role: "Practice lead GP",
    basis: "An incidental finding flagged to primary care must be placed on a named pathway with an accepting service.",
    ref: "NHS 10 Year Plan p.55 (tracking against the plan)",
    severity_when_unsafe: "high",
  },
  community_nursing_visit: {
    class: "community_nursing_visit",
    label: "Community nursing visit accepted and performed",
    accept_within_h: 12,
    complete_within_h: 48,
    unsafe_after_h: 72,
    requires_evidence: ["referral_accepted", "visit_performed"],
    escalate_to_role: "Neighbourhood team coordinator",
    basis: "Post-discharge community referral must be accepted by a named service and the visit evidenced.",
    ref: "NHS 10 Year Plan p.33 (cross-setting neighbourhood teams)",
    severity_when_unsafe: "high",
  },
  post_discharge_contact: {
    class: "post_discharge_contact",
    label: "Post-discharge patient contact completed",
    accept_within_h: 24,
    complete_within_h: 72,
    unsafe_after_h: 96,
    requires_evidence: ["patient_contact"],
    escalate_to_role: "Neighbourhood team coordinator",
    basis: "Planned follow-up contact must be evidenced by a two-way exchange with the patient or their carer.",
    ref: "NHS 10 Year Plan sickness-to-prevention (failed follow-up detection)",
    severity_when_unsafe: "high",
  },
  medication_review: {
    class: "medication_review",
    label: "Held medication reviewed for restart",
    accept_within_h: 72,
    complete_within_h: 240,
    unsafe_after_h: 336,
    requires_evidence: ["medication_reconciled"],
    escalate_to_role: "Duty GP",
    basis: "Medication held on discharge requires a documented restart decision by the accountable prescriber.",
    ref: "NHS 10 Year Plan pp.47-48 (Single Patient Record)",
    severity_when_unsafe: "moderate",
  },
};

/** Priority compresses the policy window. Emergency halves it, standard relaxes it. */
const PRIORITY_FACTOR: Record<Priority, number> = {
  emergency: 0.5,
  urgent: 1,
  standard: 1.5,
};

export function policyWindow(cls: PolicyClass, priority: Priority) {
  const rule = POLICY[cls];
  const f = PRIORITY_FACTOR[priority];
  return {
    rule,
    accept_within_h: rule.accept_within_h * f,
    complete_within_h: rule.complete_within_h * f,
    unsafe_after_h: rule.unsafe_after_h * f,
  };
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  info: 3,
};
