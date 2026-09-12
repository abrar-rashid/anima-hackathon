import type {
  EhrBundle,
  Obligation,
  PolicyClass,
  Priority,
  SourceRef,
} from "@/lib/types";
import { policyWindow } from "./policy";
import { addHours } from "./clock";

/**
 * Turning fragmented records into obligations happens two ways, and we do BOTH,
 * because each catches what the other misses.
 *
 *   A. FREE TEXT  -> matched against a bank of known clinical task types.
 *                    "please repeat U&E in 7 days" becomes a renal_recheck.
 *   B. STRUCTURED -> inferred from INCOMPLETE actions. An order with no result.
 *                    A result with no acknowledgement. A referral with no
 *                    acceptance. A held drug with no restart decision.
 *                    Nobody wrote these down. They are the dangerous ones.
 */

export interface TaskPattern {
  id: string;
  policy_class: PolicyClass;
  priority: Priority;
  snomed: { code: string; term: string };
  /** Any match fires the pattern. Deliberately narrow to avoid false positives. */
  patterns: RegExp[];
  title: string;
  owner_lane: Obligation["lane"];
  closure_rule: string;
  /** Offset from the anchoring event, in hours. */
  due_offset_h?: number;
}

/** The task bank. Extend this and the whole product gets smarter. */
export const TASK_BANK: TaskPattern[] = [
  {
    id: "TB-CHASE-CULTURE",
    policy_class: "microbiology_result_action",
    priority: "urgent",
    snomed: { code: "117015009", term: "Blood culture (procedure)" },
    patterns: [
      /chase (the )?blood culture/i,
      /cultures? .{0,40}(still )?pending/i,
      /if the organism is resistant/i,
    ],
    title: "Chase and act on the pending blood culture result",
    owner_lane: "hospital",
    closure_rule:
      "A clinician authorised to act on results has acknowledged the culture and reconciled it against the discharge antibiotic.",
  },
  {
    id: "TB-RENAL-RECHECK",
    policy_class: "renal_recheck",
    priority: "urgent",
    snomed: { code: "1019491000000100", term: "Urea and electrolytes measurement" },
    patterns: [/repeat u&e/i, /repeat (the )?(bloods|renal)/i, /recheck .{0,20}(u&e|renal|creatinine)/i],
    title: "Repeat U&E within 7 days and review apixaban dose",
    owner_lane: "gp",
    closure_rule: "A repeat U&E has been resulted AND a prescriber has recorded an apixaban dose decision.",
    due_offset_h: 168,
  },
  {
    id: "TB-RESTART-MED",
    policy_class: "medication_review",
    priority: "standard",
    snomed: { code: "182836005", term: "Review of medication" },
    patterns: [/has been held/i, /review whether to restart/i, /held on discharge/i],
    title: "Record a restart decision for the held ramipril",
    owner_lane: "gp",
    closure_rule: "The accountable prescriber has documented restart or permanent discontinuation.",
    due_offset_h: 240,
  },
  {
    id: "TB-NODULE-CT",
    policy_class: "cancer_pathway_referral",
    priority: "urgent",
    snomed: { code: "427558009", term: "Computed tomography of thorax" },
    patterns: [/nodule/i, /ct thorax/i, /bts guidance/i],
    title: "Refer for CT thorax for the incidental 8mm nodule",
    owner_lane: "gp",
    closure_rule: "A named imaging service has ACCEPTED the referral and an appointment exists.",
    due_offset_h: 168,
  },
  {
    id: "TB-COMMUNITY-VISIT",
    policy_class: "community_nursing_visit",
    priority: "urgent",
    snomed: { code: "413467001", term: "Community nursing care" },
    patterns: [/community nursing to review/i, /district nurse/i, /review at home within/i],
    title: "Community nursing home review within 48 hours",
    owner_lane: "community",
    closure_rule: "A named community nurse has accepted the referral and a visit has been evidenced.",
    due_offset_h: 48,
  },
  {
    id: "TB-PHONE-FOLLOWUP",
    policy_class: "post_discharge_contact",
    priority: "urgent",
    snomed: { code: "185317003", term: "Telephone encounter" },
    patterns: [/telephone follow ?up/i, /phone (the patient|follow)/i, /follow up in \d+ hours/i],
    title: "Telephone follow-up at 72 hours to check breathlessness and apixaban adherence",
    owner_lane: "home",
    closure_rule: "A two-way contact with the patient or carer is recorded, with her answers captured.",
    due_offset_h: 72,
  },
  {
    id: "TB-MED-REC",
    policy_class: "medicines_reconciliation",
    priority: "urgent",
    snomed: { code: "370789001", term: "Medication reconciliation" },
    patterns: [/discharge medication/i, /medicines reconciliation/i, /discharge medicines service/i],
    title: "Reconcile discharge medicines against the GP repeat list",
    owner_lane: "pharmacy",
    closure_rule:
      "A pharmacist has compared pre-admission, discharge and repeat lists and recorded the reconciled list.",
    due_offset_h: 72,
  },
];

export interface ExtractedTask {
  pattern_id: string;
  title: string;
  policy_class: PolicyClass;
  priority: Priority;
  snomed: { code: string; term: string };
  owner_lane: Obligation["lane"];
  closure_rule: string;
  due_offset_h?: number;
  /** The literal sentence we matched, for provenance. Never paraphrased. */
  evidence_text: string;
  source: SourceRef;
  method: "free_text" | "structured_gap";
}

function sentences(body: string): string[] {
  return body
    .split(/\n\s*[-*]\s+|\n{2,}|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 20);
}

/** A. Free-text extraction against the task bank. Deterministic, auditable. */
export function extractFromFreeText(bundle: EhrBundle): ExtractedTask[] {
  const out: ExtractedTask[] = [];
  const seen = new Set<string>();

  for (const doc of bundle.documents) {
    for (const sentence of sentences(doc.body)) {
      for (const tb of TASK_BANK) {
        if (seen.has(tb.id)) continue;
        if (!tb.patterns.some((p) => p.test(sentence))) continue;
        seen.add(tb.id);
        out.push({
          pattern_id: tb.id,
          title: tb.title,
          policy_class: tb.policy_class,
          priority: tb.priority,
          snomed: tb.snomed,
          owner_lane: tb.owner_lane,
          closure_rule: tb.closure_rule,
          due_offset_h: tb.due_offset_h,
          evidence_text: sentence,
          method: "free_text",
          source: {
            system: doc.system,
            record_id: doc.id,
            record_type: doc.type,
            at: doc.authored_at,
            excerpt: sentence,
          },
        });
      }
    }
  }
  return out;
}

/**
 * B. Structured gap inference. Nobody wrote these tasks down anywhere.
 * They exist only as the ABSENCE of a record, which is why they get missed.
 */
export function extractFromStructuredGaps(bundle: EhrBundle): ExtractedTask[] {
  const out: ExtractedTask[] = [];

  // A released result that no clinician has acknowledged.
  for (const obs of bundle.observations) {
    if (!obs.released_at || obs.acknowledged_at) continue;
    const critical = obs.flag === "critical";
    out.push({
      pattern_id: "GAP-UNACK-RESULT",
      title: `Acknowledge unactioned ${obs.name.toLowerCase()} result`,
      policy_class: "microbiology_result_action",
      priority: critical ? "emergency" : "urgent",
      snomed: { code: obs.code, term: obs.name },
      owner_lane: "hospital",
      closure_rule:
        "A clinician authorised to act on results has opened the result and recorded a decision against it.",
      evidence_text: `${obs.name} released ${obs.released_at} with no acknowledgement recorded.`,
      method: "structured_gap",
      source: {
        system: obs.system,
        record_id: obs.id,
        record_type: "Pathology result",
        at: obs.released_at,
        excerpt: obs.value,
      },
    });
  }

  // An order that was requested but never collected or resulted.
  for (const ord of bundle.orders) {
    if (ord.status !== "requested") continue;
    out.push({
      pattern_id: "GAP-UNCOLLECTED-ORDER",
      title: `No sample collected for "${ord.name}"`,
      policy_class: "renal_recheck",
      priority: "urgent",
      snomed: { code: ord.code, term: ord.name },
      owner_lane: "gp",
      closure_rule: "A sample has been collected and a result released against this order.",
      evidence_text: `Order raised ${ord.requested_at} and still at status "requested" with no sample.`,
      method: "structured_gap",
      source: {
        system: ord.system,
        record_id: ord.id,
        record_type: "Order",
        at: ord.requested_at,
        excerpt: ord.name,
      },
    });
  }

  // A referral that was never sent at all: the handoff does not exist.
  for (const ref of bundle.referrals) {
    if (ref.sent_at) continue;
    out.push({
      pattern_id: "GAP-UNSENT-REFERRAL",
      title: `${ref.to_org} was never sent the ${ref.system} referral`,
      policy_class: "medicines_reconciliation",
      priority: "urgent",
      snomed: { code: "370789001", term: "Medication reconciliation" },
      owner_lane: ref.to_lane,
      closure_rule: "The receiving service has accepted the referral and completed the work with evidence.",
      evidence_text: `Referral record exists in ${ref.system} with no transmission timestamp.`,
      method: "structured_gap",
      source: {
        system: ref.system,
        record_id: ref.id,
        record_type: "Referral",
        at: bundle.discharge_at,
        excerpt: ref.reason,
      },
    });
  }

  // A drug held with no restart decision.
  for (const med of bundle.medications) {
    if (med.status !== "held") continue;
    out.push({
      pattern_id: "GAP-HELD-MED",
      title: `No restart decision recorded for held ${med.name}`,
      policy_class: "medication_review",
      priority: "standard",
      snomed: { code: "182836005", term: "Review of medication" },
      owner_lane: "gp",
      closure_rule: "A prescriber has documented restart or permanent discontinuation.",
      evidence_text: `${med.name} status "held" since discharge with no subsequent prescriber decision.`,
      method: "structured_gap",
      source: {
        system: med.system,
        record_id: med.id,
        record_type: "Medication",
        at: bundle.discharge_at,
        excerpt: med.note ?? med.dose,
      },
    });
  }

  return out;
}

export function dueAt(
  anchorIso: string,
  policy_class: PolicyClass,
  priority: Priority,
  offsetOverride?: number,
): string {
  const win = policyWindow(policy_class, priority);
  return addHours(anchorIso, offsetOverride ?? win.complete_within_h);
}
