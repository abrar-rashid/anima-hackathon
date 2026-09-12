import type { EhrBundle, Obligation } from "@/lib/types";
import { extractFromFreeText, extractFromStructuredGaps, dueAt } from "./extract";

/**
 * The obligation chain for an episode.
 *
 * Built from the extraction output, but stated explicitly so that every
 * obligation carries a real owner, a real transition history and real
 * provenance into the source systems. `origin_lane !== lane` means the
 * obligation has to cross an organisational boundary - and that is where
 * the failures are.
 */
export function buildObligations(bundle: EhrBundle): Obligation[] {
  const freeText = extractFromFreeText(bundle);
  const gaps = extractFromStructuredGaps(bundle);
  const byPattern = (id: string) => freeText.find((t) => t.pattern_id === id);
  const gapFor = (recordId: string) => gaps.find((g) => g.source.record_id === recordId);

  const D = bundle.discharge_at;
  const src = (patternId: string) => {
    const t = byPattern(patternId);
    return t ? [t.source] : [];
  };

  const obligations: Obligation[] = [
    // ---------------------------------------------------------------- HOSPITAL
    {
      id: "OBL-EDS-SEND",
      episode_id: bundle.episode_id,
      lane: "hospital",
      origin_lane: "hospital",
      title: "Transmit the electronic discharge summary to the registered practice",
      detail:
        "The discharge summary must reach the GP practice that holds the patient's record, by an electronic channel that returns a delivery receipt.",
      snomed: { code: "373942005", term: "Discharge summary" },
      priority: "urgent",
      policy_class: "discharge_summary_transmission",
      created_at: D,
      due_at: dueAt(D, "discharge_summary_transmission", "urgent"),
      owner_id: "ACT-OMONDI",
      next_owner_id: "ACT-NANDAKUMAR",
      status: "completed",
      requires_evidence: ["document_sent"],
      evidence: [
        {
          kind: "document_sent",
          at: "2026-09-08T17:02:00Z",
          actor_id: "ACT-OMONDI",
          record_id: "DOC-EDS-0844",
          note: "Delivered via GP Connect / MESH, receipt returned by Bromley-by-Bow Health Centre.",
        },
      ],
      transitions: [
        { at: D, kind: "created", from_lane: null, to_lane: "hospital", actor_id: "ACT-REILLY" },
        {
          at: "2026-09-08T17:02:00Z",
          kind: "completed",
          from_lane: "hospital",
          to_lane: "gp",
          actor_id: "ACT-OMONDI",
          note: "Sent 22 minutes after discharge.",
        },
      ],
      source: [
        {
          system: "Barts Health EPR (Cerner Millennium)",
          record_id: "DOC-EDS-0844",
          record_type: "eDischarge summary",
          at: D,
          excerpt: "Prepared by Dr T Reilly, Medical Registrar, 08/09/2026 16:40",
        },
      ],
      closure_rule: "A delivery receipt exists from the registered practice.",
    },

    // ---------------------------------------------------------- HOSPITAL -> GP
    {
      id: "OBL-EDS-FILE",
      episode_id: bundle.episode_id,
      lane: "gp",
      origin_lane: "hospital",
      title: "Review the discharge summary and file it to the patient record",
      detail:
        "The receiving practice must review the summary and file it, so that its requested actions become visible on the practice task list.",
      snomed: { code: "373942005", term: "Discharge summary" },
      priority: "urgent",
      policy_class: "discharge_summary_filing",
      created_at: "2026-09-08T17:02:00Z",
      due_at: dueAt("2026-09-08T17:02:00Z", "discharge_summary_filing", "urgent"),
      owner_id: "ACT-NANDAKUMAR",
      next_owner_id: null,
      status: "completed",
      requires_evidence: ["document_filed"],
      evidence: [
        {
          kind: "document_filed",
          at: "2026-09-09T08:14:00Z",
          actor_id: "ACT-NANDAKUMAR",
          record_id: "DOC-GPNOTE-1",
          note: "Filed to record with a consultation note.",
        },
      ],
      transitions: [
        { at: "2026-09-08T17:02:00Z", kind: "sent", from_lane: "hospital", to_lane: "gp", actor_id: "ACT-OMONDI" },
        { at: "2026-09-08T17:04:00Z", kind: "received", from_lane: "hospital", to_lane: "gp", actor_id: null, note: "Landed in the practice document queue." },
        { at: "2026-09-09T08:14:00Z", kind: "accepted", from_lane: null, to_lane: "gp", actor_id: "ACT-NANDAKUMAR" },
        { at: "2026-09-09T08:14:00Z", kind: "completed", from_lane: null, to_lane: "gp", actor_id: "ACT-NANDAKUMAR" },
      ],
      source: [
        {
          system: "EMIS Web (Bromley-by-Bow)",
          record_id: "DOC-GPNOTE-1",
          record_type: "Consultation note",
          at: "2026-09-09T08:14:00Z",
          excerpt:
            "Skim read. Have not had a chance to action the individual requests, will need a med review slot.",
        },
      ],
      closure_rule: "The document is filed and its requested actions are itemised on the practice task list.",
    },

    {
      // ==================== THE CRITICAL ONE ====================
      // A positive, resistant culture released AFTER discharge, to the inbox of
      // a clinician who has rotated off. It has never crossed to anyone who
      // holds the patient. This is a boundary failure, not an org failure.
      id: "OBL-CULTURE-ACK",
      episode_id: bundle.episode_id,
      lane: "gp",
      origin_lane: "hospital",
      title: "Acknowledge the positive blood culture and reconcile it against the discharge antibiotic",
      detail:
        "Blood culture BC-4471, taken on admission before antibiotics, was released after the patient went home. It is positive for Streptococcus pneumoniae reported RESISTANT to amoxicillin, which is the antibiotic she was discharged on. No clinician has opened it.",
      snomed: { code: "117015009", term: "Blood culture (procedure)" },
      priority: "emergency",
      policy_class: "microbiology_result_action",
      created_at: "2026-09-10T06:00:00Z",
      due_at: dueAt("2026-09-10T06:00:00Z", "microbiology_result_action", "emergency"),
      owner_id: null, // <- nobody. The requester rotated post.
      next_owner_id: "ACT-ONCALL-REG",
      status: "unowned",
      requires_evidence: ["result_acknowledged"],
      evidence: [],
      transitions: [
        {
          at: "2026-09-03T03:05:00Z",
          kind: "created",
          from_lane: null,
          to_lane: "hospital",
          actor_id: "ACT-REILLY",
          note: "Blood culture requested, sample BC-4471.",
        },
        {
          at: "2026-09-10T06:00:00Z",
          kind: "created",
          from_lane: null,
          to_lane: "hospital",
          actor_id: null,
          note: "Result released to the requesting clinician's inbox. Requester rotated post on 09/09. No onward route configured.",
        },
      ],
      source: [
        {
          system: "Barts Health Microbiology (Winpath)",
          record_id: "OBS-BC-4471",
          record_type: "Microbiology result",
          at: "2026-09-10T06:00:00Z",
          excerpt:
            "POSITIVE - Streptococcus pneumoniae. PENICILLIN RESISTANT (MIC 4 mg/L). Amoxicillin: RESISTANT. Levofloxacin: SENSITIVE.",
        },
        ...src("TB-CHASE-CULTURE"),
        ...(gapFor("OBS-BC-4471") ? [gapFor("OBS-BC-4471")!.source] : []),
      ],
      closure_rule:
        "A clinician authorised to act on results has opened the culture AND recorded a decision against the current antibiotic.",
      alternate_route:
        "If the on-call medical registrar does not acknowledge within the policy window, route to the duty GP at Bromley-by-Bow, who holds the patient and is authorised to act.",
    },

    // ---------------------------------------------------------------------- GP
    {
      id: "OBL-UE-REPEAT",
      episode_id: bundle.episode_id,
      lane: "gp",
      origin_lane: "hospital",
      title: "Repeat U&E within 7 days and record an apixaban dose decision",
      detail:
        "Creatinine rose from 92 to 148 (eGFR 32) during admission. The discharge summary requests a repeat at 7 days, with the anticoagulant dose to be reviewed against the result.",
      snomed: { code: "1019491000000100", term: "Urea and electrolytes measurement" },
      priority: "urgent",
      policy_class: "renal_recheck",
      created_at: "2026-09-09T08:14:00Z",
      due_at: dueAt(D, "renal_recheck", "urgent", 168),
      owner_id: "ACT-NANDAKUMAR",
      next_owner_id: "ACT-ADEYEMI",
      status: "received",
      requires_evidence: ["result_acknowledged"],
      evidence: [],
      transitions: [
        { at: "2026-09-08T17:04:00Z", kind: "received", from_lane: "hospital", to_lane: "gp", actor_id: null },
      ],
      source: [
        ...src("TB-RENAL-RECHECK"),
        {
          system: "Barts Health Pathology (Winpath)",
          record_id: "OBS-CREAT-DISCH",
          record_type: "Pathology result",
          at: "2026-09-08T10:02:00Z",
          excerpt: "Creatinine 148 umol/L (baseline 92). eGFR 32. AKI stage 1.",
        },
        ...(gapFor("ORD-UE-REPEAT") ? [gapFor("ORD-UE-REPEAT")!.source] : []),
      ],
      closure_rule:
        "A repeat U&E has been resulted AND a prescriber has recorded an apixaban dose decision against it.",
      blocks: ["OBL-RAMIPRIL-REVIEW"],
    },

    {
      id: "OBL-NODULE-CT",
      episode_id: bundle.episode_id,
      lane: "gp",
      origin_lane: "hospital",
      title: "Refer for CT thorax for the incidental 8mm pulmonary nodule",
      detail:
        "The chest X-ray report was addended two days before discharge with an 8mm right lower lobe nodule, distinct from the consolidation. The addendum itself was never acknowledged by the reporting clinician.",
      snomed: { code: "427558009", term: "Computed tomography of thorax" },
      priority: "urgent",
      policy_class: "cancer_pathway_referral",
      created_at: "2026-09-09T08:14:00Z",
      due_at: dueAt(D, "cancer_pathway_referral", "urgent", 168),
      // On her task list, but never accepted by anyone. At t=0 this is still
      // inside the acceptance window, so the rail must NOT cry wolf yet.
      owner_id: "ACT-NANDAKUMAR",
      next_owner_id: "ACT-ADEYEMI",
      status: "received",
      requires_evidence: ["referral_accepted"],
      evidence: [],
      transitions: [
        { at: "2026-09-08T17:04:00Z", kind: "received", from_lane: "hospital", to_lane: "gp", actor_id: null },
      ],
      source: [
        ...src("TB-NODULE-CT"),
        {
          system: "Barts Health PACS / Radiology",
          record_id: "DOC-CXR-ADDENDUM",
          record_type: "Radiology report addendum",
          at: "2026-09-07T14:20:00Z",
          excerpt:
            "8mm well-defined nodule in the right lower lobe... Recommend CT thorax per BTS pulmonary nodule guidance. This addendum has NOT been acknowledged.",
        },
      ],
      closure_rule: "A named imaging service has ACCEPTED the referral and an appointment exists.",
      alternate_route: "Route to the practice lead GP for allocation if unassigned past the acceptance window.",
    },

    {
      id: "OBL-RAMIPRIL-REVIEW",
      episode_id: bundle.episode_id,
      lane: "gp",
      origin_lane: "hospital",
      title: "Record a restart decision for the held ramipril",
      detail:
        "Ramipril was held on discharge because of the AKI. The restart decision was delegated to the GP and depends on the repeat renal function.",
      snomed: { code: "182836005", term: "Review of medication" },
      priority: "standard",
      policy_class: "medication_review",
      created_at: "2026-09-09T08:14:00Z",
      due_at: dueAt(D, "medication_review", "standard", 240),
      owner_id: "ACT-NANDAKUMAR",
      next_owner_id: null,
      status: "received",
      requires_evidence: ["medication_reconciled"],
      evidence: [],
      transitions: [
        { at: "2026-09-08T17:04:00Z", kind: "received", from_lane: "hospital", to_lane: "gp", actor_id: null },
      ],
      source: [
        ...src("TB-RESTART-MED"),
        ...(gapFor("MED-RAMI") ? [gapFor("MED-RAMI")!.source] : []),
      ],
      closure_rule: "A prescriber has documented restart or permanent discontinuation.",
      depends_on: ["OBL-UE-REPEAT"],
    },

    // ---------------------------------------------------------- GP -> PHARMACY
    {
      // The handoff that was never made: no DMS referral record was transmitted.
      id: "OBL-MED-REC",
      episode_id: bundle.episode_id,
      lane: "pharmacy",
      origin_lane: "gp",
      title: "Reconcile the discharge medicines against the GP repeat list",
      detail:
        "Three lists exist and none has been compared: pre-admission, discharge, and the live GP repeat template. The repeat still carries naproxen 500mg twice daily, which nothing in the discharge summary mentions, alongside a brand new anticoagulant and an unresolved AKI.",
      snomed: { code: "370789001", term: "Medication reconciliation" },
      priority: "emergency",
      policy_class: "medicines_reconciliation",
      created_at: D,
      due_at: dueAt(D, "medicines_reconciliation", "emergency", 72),
      owner_id: null,
      next_owner_id: "ACT-CHUKWU",
      status: "unowned",
      requires_evidence: ["medication_reconciled"],
      evidence: [],
      transitions: [
        {
          at: D,
          kind: "created",
          from_lane: null,
          to_lane: "gp",
          actor_id: null,
          note: "Discharge Medicines Service referral record created but never transmitted.",
        },
      ],
      source: [
        ...src("TB-MED-REC"),
        {
          system: "Discharge Medicines Service",
          record_id: "REF-DMS-1",
          record_type: "Referral",
          at: D,
          excerpt: "Referral record exists with no transmission timestamp.",
        },
        {
          system: "EMIS Web (Bromley-by-Bow)",
          record_id: "MED-NAPROXEN",
          record_type: "Medication",
          at: "2026-08-28T09:00:00Z",
          excerpt:
            "Naproxen 500mg twice daily as required. Active repeat, 56 tablets last issued 28/08/2026. Not referenced anywhere in the discharge summary.",
        },
        ...(gapFor("REF-DMS-1") ? [gapFor("REF-DMS-1")!.source] : []),
      ],
      closure_rule:
        "A pharmacist has compared all three lists and recorded a single reconciled list with any conflicts resolved by a prescriber.",
      alternate_route:
        "The PCN clinical pharmacist can complete reconciliation from the shared record without a community pharmacy referral.",
    },

    // ---------------------------------------------------------------- PHARMACY
    {
      // Marked complete by the pharmacy's own system, but the evidence that
      // proves the loop closed is the WRONG evidence. This is the finding that
      // a deadline-based tracker cannot make.
      id: "OBL-DISPENSE",
      episode_id: bundle.episode_id,
      lane: "pharmacy",
      origin_lane: "pharmacy",
      title: "Supply the discharge medication",
      detail:
        "The patient collected her discharge prescription including the new apixaban. The supply is evidenced. The reconciliation that should have preceded it is not.",
      snomed: { code: "422037009", term: "Provision of medication" },
      priority: "urgent",
      policy_class: "medicines_reconciliation",
      created_at: "2026-09-09T11:20:00Z",
      due_at: dueAt(D, "medicines_reconciliation", "urgent", 72),
      owner_id: "ACT-PATEL",
      next_owner_id: "ACT-CHUKWU",
      status: "completed",
      requires_evidence: ["medication_reconciled", "medication_dispensed"],
      evidence: [
        {
          kind: "medication_dispensed",
          at: "2026-09-09T11:20:00Z",
          actor_id: "ACT-PATEL",
          record_id: "RX-88421",
          note: "Apixaban 5mg BD, bisoprolol 2.5mg OD, amoxicillin 500mg TDS supplied to patient.",
        },
      ],
      transitions: [
        { at: "2026-09-09T11:02:00Z", kind: "received", from_lane: null, to_lane: "pharmacy", actor_id: "ACT-PATEL" },
        { at: "2026-09-09T11:04:00Z", kind: "accepted", from_lane: null, to_lane: "pharmacy", actor_id: "ACT-PATEL" },
        { at: "2026-09-09T11:20:00Z", kind: "completed", from_lane: null, to_lane: "pharmacy", actor_id: "ACT-PATEL" },
      ],
      source: [
        {
          system: "Boots PMR / NHS Spine",
          record_id: "RX-88421",
          record_type: "Dispensing record",
          at: "2026-09-09T11:20:00Z",
          excerpt: "Dispensed against FP10 token. No Discharge Medicines Service referral attached to this supply.",
        },
      ],
      closure_rule:
        "Supply alone does not close this. A reconciled medicines list must exist before or alongside the supply.",
    },

    // --------------------------------------------------------------- COMMUNITY
    {
      // We can see we SENT it. We cannot see what happened next.
      // The correct behaviour is to say so, not to raise a false alert.
      id: "OBL-COMMUNITY-VISIT",
      episode_id: bundle.episode_id,
      lane: "community",
      origin_lane: "hospital",
      title: "Community nursing home review within 48 hours of discharge",
      detail:
        "Referred because she lives alone, is mildly frail and is on her first anticoagulant. The receiving service runs a separate record system that does not return acceptance or visit status to us.",
      snomed: { code: "413467001", term: "Community nursing care" },
      priority: "urgent",
      policy_class: "community_nursing_visit",
      created_at: "2026-09-08T16:55:00Z",
      due_at: dueAt(D, "community_nursing_visit", "urgent", 48),
      owner_id: null,
      next_owner_id: "ACT-OBI",
      status: "not_shared",
      opaque: true,
      requires_evidence: ["referral_accepted", "visit_performed"],
      evidence: [],
      transitions: [
        {
          at: "2026-09-08T16:55:00Z",
          kind: "sent",
          from_lane: "hospital",
          to_lane: "community",
          actor_id: "ACT-OMONDI",
          note: "Transmitted to the community referral gateway. No acceptance receipt is returned by this interface.",
        },
      ],
      source: [
        ...src("TB-COMMUNITY-VISIT"),
        {
          system: "Barts Health EPR -> Community referral gateway",
          record_id: "REF-COMMUNITY-1",
          record_type: "Referral",
          at: "2026-09-08T16:55:00Z",
          excerpt: "Post-discharge nursing review within 48h. Lives alone, frail, new anticoagulant.",
        },
      ],
      closure_rule:
        "A named community nurse has accepted the referral AND a visit record exists. Neither field is exposed to us by the receiving system.",
      alternate_route:
        "Request confirmation through the Tower Hamlets Neighbourhood Team shared channel, which does return acceptance status.",
    },

    // -------------------------------------------------------------------- HOME
    {
      id: "OBL-HOME-CALL",
      episode_id: bundle.episode_id,
      lane: "home",
      origin_lane: "hospital",
      title: "Telephone follow-up at 72 hours: breathlessness and apixaban adherence",
      detail:
        "Requested in the discharge summary. No service was named, no owner was assigned and no contact attempt is recorded anywhere in any system.",
      snomed: { code: "185317003", term: "Telephone encounter" },
      priority: "urgent",
      policy_class: "post_discharge_contact",
      created_at: D,
      due_at: dueAt(D, "post_discharge_contact", "urgent", 72),
      owner_id: null,
      next_owner_id: "ACT-AGENT",
      status: "unowned",
      requires_evidence: ["patient_contact"],
      evidence: [],
      transitions: [
        {
          at: D,
          kind: "created",
          from_lane: null,
          to_lane: "home",
          actor_id: "ACT-REILLY",
          note: "Requested in free text only. No task, no service, no owner.",
        },
      ],
      source: [...src("TB-PHONE-FOLLOWUP")],
      closure_rule:
        "A two-way contact with the patient or her carer is recorded, with her actual answers captured against the record.",
      alternate_route:
        "If the patient cannot be reached after three attempts, escalate to the neighbourhood team for a physical welfare check.",
    },
  ];

  return obligations;
}

export function obligationById(obligations: Obligation[], id: string) {
  return obligations.find((o) => o.id === id) ?? null;
}
