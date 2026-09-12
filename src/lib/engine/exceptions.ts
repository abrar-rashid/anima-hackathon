import type {
  Actor,
  BoundaryDwell,
  Exception,
  ExceptionKind,
  EvidenceKind,
  Obligation,
  PolicyClass,
  SafestNextStep,
  Severity,
} from "@/lib/types";
import { LANE_LABEL } from "@/lib/types";
import { POLICY, POLICY_VERSION, SEVERITY_ORDER, policyWindow } from "./policy";
import { addHours, fmtClock, fmtDuration, hoursBetween } from "./clock";

/** Which authorisation an obligation class actually requires to be actioned. */
const REQUIRED_AUTH: Record<PolicyClass, string> = {
  discharge_summary_transmission: "route_documents",
  discharge_summary_filing: "act_on_results",
  microbiology_result_action: "act_on_results",
  renal_recheck: "act_on_results",
  medicines_reconciliation: "medicines_reconciliation",
  cancer_pathway_referral: "refer",
  community_nursing_visit: "referral_routing",
  post_discharge_contact: "patient_contact",
  medication_review: "prescribe",
};

const OPEN_STATUSES = new Set(["unowned", "sent", "received", "accepted", "in_progress"]);

/**
 * MEASURE 3: how long has this waited at each boundary it has crossed, and at
 * the one it is stuck on right now. Dwell at an OPEN boundary is measured to
 * `now`, which is what makes the rail move when the clock advances.
 */
function boundaryDwell(o: Obligation, now: string): BoundaryDwell[] {
  const out: BoundaryDwell[] = [];
  const sent = o.transitions.find((t) => t.kind === "sent");
  const received = o.transitions.find((t) => t.kind === "received");
  const accepted = o.transitions.find((t) => t.kind === "accepted");
  const completed = o.transitions.find((t) => t.kind === "completed");

  if (sent && received) {
    out.push({
      boundary: "in transit",
      from_lane: sent.from_lane,
      to_lane: sent.to_lane,
      hours: hoursBetween(sent.at, received.at),
      open: false,
    });
  } else if (sent && !received) {
    out.push({
      boundary: "in transit, never received",
      from_lane: sent.from_lane,
      to_lane: sent.to_lane,
      hours: hoursBetween(sent.at, now),
      open: true,
    });
  }

  const landedAt = received?.at ?? (o.origin_lane === o.lane ? o.created_at : null);
  if (landedAt) {
    out.push({
      boundary: `awaiting acceptance in ${LANE_LABEL[o.lane]}`,
      from_lane: o.lane,
      to_lane: o.lane,
      hours: hoursBetween(landedAt, accepted?.at ?? now),
      open: !accepted,
    });
  }

  if (accepted) {
    out.push({
      boundary: `being worked in ${LANE_LABEL[o.lane]}`,
      from_lane: o.lane,
      to_lane: o.lane,
      hours: hoursBetween(accepted.at, completed?.at ?? now),
      open: !completed,
    });
  }

  // Never routed at all: the boundary it should have crossed does not exist yet.
  if (!sent && !received && o.origin_lane !== o.lane) {
    out.push({
      boundary: "never routed",
      from_lane: o.origin_lane,
      to_lane: o.lane,
      hours: hoursBetween(o.created_at, now),
      open: true,
    });
  }

  return out;
}

function heldEvidence(o: Obligation): EvidenceKind[] {
  return Array.from(new Set(o.evidence.map((e) => e.kind)));
}

function missingEvidence(o: Obligation): EvidenceKind[] {
  const held = new Set(heldEvidence(o));
  return o.requires_evidence.filter((k) => !held.has(k));
}

/** MEASURE 5: what information is missing, in words a clinician can act on. */
function missingInformation(o: Obligation, actors: Map<string, Actor>): string[] {
  const out: string[] = [];
  for (const k of missingEvidence(o)) {
    switch (k) {
      case "result_acknowledged":
        out.push("No clinician acknowledgement is recorded against the result");
        break;
      case "medication_reconciled":
        out.push("No reconciled medicines list exists in any of the three systems");
        break;
      case "medication_dispensed":
        out.push("No dispensing record found");
        break;
      case "referral_accepted":
        out.push("No accepting service or named clinician");
        break;
      case "visit_performed":
        out.push("No visit record returned by the receiving system");
        break;
      case "patient_contact":
        out.push("No contact attempt recorded in any system");
        break;
      case "document_filed":
        out.push("Document not filed to the patient record");
        break;
      case "document_sent":
        out.push("No transmission receipt");
        break;
    }
  }
  if (!o.owner_id) out.push("No named owner in any participating system");
  if (o.opaque) out.push(`${LANE_LABEL[o.lane]} record system does not expose status to us`);
  for (const site of o.blind_to ?? []) {
    out.push(`The ${site} service cannot see this record at all, and it needs to`);
  }
  if (o.depends_on?.length) {
    out.push(`Blocked by an upstream obligation that has not closed (${o.depends_on.join(", ")})`);
  }
  const next = o.next_owner_id ? actors.get(o.next_owner_id) : null;
  if (next && next.available === false) {
    out.push(`Proposed next owner ${next.name} is not rostered on`);
  }
  return out;
}

/** MEASURE 7 + the one clinician button. Routes, chases, verifies. Never treats. */
function safestNextStep(
  o: Obligation,
  kinds: ExceptionKind[],
  actors: Map<string, Actor>,
): SafestNextStep {
  const rule = POLICY[o.policy_class];
  const next = o.next_owner_id ? actors.get(o.next_owner_id) : null;
  const BOUNDARY =
    "CareClosure routes, chases and verifies. It does not choose or change treatment. The clinical decision stays with the named clinician.";

  if (kinds.includes("UNABLE_TO_VERIFY")) {
    return {
      action: "request_access",
      label: "Request confirmation from the neighbourhood team",
      target_actor_id: o.next_owner_id,
      message:
        `Status confirmation requested for ${o.title.toLowerCase()} (${o.episode_id}). ` +
        `Referral was transmitted ${fmtClock(o.transitions[0]?.at ?? o.created_at)} to a system that does not return acceptance status. ` +
        `Please confirm whether the referral was accepted and whether a visit has taken place.`,
      rationale:
        "We can prove the referral left. We cannot prove it arrived, was accepted or was performed. Raising an overdue alert here would be a false alert, so we ask the one service that can answer instead.",
      policy_ref: `${POLICY_VERSION} / ${rule.ref}`,
      clinical_boundary: BOUNDARY,
    };
  }

  if (o.lane === "home" && o.requires_evidence.includes("patient_contact")) {
    return {
      action: "call_patient",
      label: "Place the follow-up call now",
      target_actor_id: "ACT-AGENT",
      message:
        `Structured follow-up call to ${"the patient"} covering breathlessness, apixaban adherence and red-flag symptoms. ` +
        `Her answers are written back to the record as the closure evidence. Any red flag routes straight to the duty GP.`,
      rationale:
        "The contact was requested in free text with no service, no owner and no attempt recorded. It is now past its policy window and she lives alone. An attempted, evidenced contact is the only thing that closes this.",
      policy_ref: `${POLICY_VERSION} / ${rule.ref}`,
      clinical_boundary:
        "The call gathers and records information. It does not give advice, change medication or triage. Red flags escalate to a clinician.",
    };
  }

  if (kinds.includes("VISIBILITY_GAP")) {
    const blindSites = o.blind_to ?? [];
    return {
      action: "route_to_clinician",
      label: next ? `Share with ${blindSites.join(" + ")} and route to ${next.name}` : "Share with the services that need it",
      target_actor_id: o.next_owner_id,
      message:
        `${o.title} (${o.episode_id}). This record is owned by the ${LANE_LABEL[o.lane]} service and is not in the permitted view of: ${blindSites.join(", ")}. ` +
        `Those services are making decisions about this patient without it. Sharing requested, with the record attached. ` +
        `Required to close: ${o.closure_rule}`,
      rationale:
        `The information is not missing, it is partitioned. ${blindSites.join(" and ")} ${blindSites.length > 1 ? "are" : "is"} accountable for a decision that depends on it and cannot read it. ` +
        rule.basis,
      policy_ref: `${POLICY_VERSION} / ${rule.ref}`,
      clinical_boundary: BOUNDARY,
    };
  }

  if (kinds.includes("MISSING_OWNER") || kinds.includes("ROUTE_BROKEN")) {
    return {
      action: "route_to_clinician",
      label: next ? `Route to ${next.name}` : "Assign an owner",
      target_actor_id: o.next_owner_id,
      message:
        `${o.title} (${o.episode_id}). This obligation has had no owner since ${fmtClock(o.created_at)}. ` +
        `Sources attached. Required to close: ${o.closure_rule}`,
      rationale: next
        ? `${next.name} is rostered on and holds the ${REQUIRED_AUTH[o.policy_class].replace(/_/g, " ")} authorisation this needs. ${rule.basis}`
        : rule.basis,
      policy_ref: `${POLICY_VERSION} / ${rule.ref}`,
      clinical_boundary: BOUNDARY,
    };
  }

  if (kinds.includes("INSUFFICIENT_EVIDENCE")) {
    return {
      action: "route_to_clinician",
      label: next ? `Route to ${next.name} for the missing step` : "Request the missing evidence",
      target_actor_id: o.next_owner_id,
      message:
        `${o.title} (${o.episode_id}) is marked complete but the evidence that closes it is absent. ` +
        `Held: ${heldEvidence(o).join(", ") || "none"}. Required: ${o.requires_evidence.join(", ")}.`,
      rationale:
        "A completion flag is not closure. The record shows the supply happened but the step that makes the supply safe was never performed by anyone.",
      policy_ref: `${POLICY_VERSION} / ${rule.ref}`,
      clinical_boundary: BOUNDARY,
    };
  }

  return {
    action: "chase_owner",
    label: next ? `Chase ${next.name}` : `Chase ${rule.escalate_to_role}`,
    target_actor_id: o.next_owner_id,
    message: `${o.title} (${o.episode_id}) is past its policy window. Required to close: ${o.closure_rule}`,
    rationale: rule.basis,
    policy_ref: `${POLICY_VERSION} / ${rule.ref}`,
    clinical_boundary: BOUNDARY,
  };
}

function expectedText(o: Obligation): string {
  const w = policyWindow(o.policy_class, o.priority);
  return (
    `${POLICY[o.policy_class].label}. ` +
    `Accepted by a named owner within ${fmtDuration(w.accept_within_h)} of arriving, ` +
    `completed within ${fmtDuration(w.complete_within_h)}, ` +
    `evidenced by: ${o.requires_evidence.join(" + ")}.`
  );
}

function foundText(o: Obligation, dwell: BoundaryDwell[], actors: Map<string, Actor>, now: string): string {
  const open = dwell.find((d) => d.open);
  const owner = o.owner_id ? actors.get(o.owner_id) : null;
  const bits: string[] = [];

  if (o.opaque) {
    bits.push(
      `Referral transmitted and receipt-free. ${LANE_LABEL[o.lane]} runs a separate record system that returns neither acceptance nor visit status.`,
    );
  } else if ((o.blind_to ?? []).length > 0) {
    bits.push(
      `The record exists and we can read it. The ${(o.blind_to ?? []).join(" and ")} service${(o.blind_to ?? []).length > 1 ? "s" : ""} cannot: it is not in their permitted view, so they are acting without it.`,
    );
  } else if (!o.owner_id) {
    bits.push(
      `No owner in any participating system since ${fmtClock(o.created_at)} (${fmtDuration(hoursBetween(o.created_at, now))}).`,
    );
  } else if (o.status === "completed") {
    bits.push(`Marked complete by ${owner?.name ?? "the owning system"}.`);
  } else {
    bits.push(`Owned by ${owner?.name ?? "unknown"}, status "${o.status}".`);
  }

  if (open) bits.push(`Sitting at "${open.boundary}" for ${fmtDuration(open.hours)}.`);

  const missing = missingEvidence(o);
  if (missing.length) bits.push(`Missing closure evidence: ${missing.join(", ")}.`);

  return bits.join(" ");
}

export function evaluateObligation(
  o: Obligation,
  now: string,
  actors: Map<string, Actor>,
): Exception | null {
  const w = policyWindow(o.policy_class, o.priority);
  const rule = POLICY[o.policy_class];
  const dwell = boundaryDwell(o, now);
  const kinds: ExceptionKind[] = [];

  const isOpen = OPEN_STATUSES.has(o.status);
  const received = o.transitions.find((t) => t.kind === "received");
  const accepted = o.transitions.find((t) => t.kind === "accepted");
  const missing = missingEvidence(o);

  const blind = o.blind_to ?? [];

  // Data WE are not permitted to see is not a breach. Say so honestly.
  if (o.status === "not_shared" || o.opaque) {
    kinds.push("UNABLE_TO_VERIFY");
  } else {
    // A record that exists, that we can read, but that the service which must
    // act on it cannot read. Provable, and therefore a breach.
    if (blind.length > 0) kinds.push("VISIBILITY_GAP");

    if (!o.owner_id && isOpen) kinds.push("MISSING_OWNER");

    if (o.origin_lane !== o.lane && (o.status === "unowned" || o.status === "sent") && !received) {
      kinds.push("ROUTE_BROKEN");
    }

    const landedAt = received?.at ?? (o.origin_lane === o.lane ? o.created_at : null);
    if (isOpen && landedAt && !accepted && hoursBetween(landedAt, now) > w.accept_within_h) {
      kinds.push("UNACCEPTED_WORK");
    }

    if (isOpen && hoursBetween(o.due_at, now) > 0) kinds.push("OVERDUE");

    if (o.status === "completed" && missing.length > 0) kinds.push("INSUFFICIENT_EVIDENCE");

    const nextActor = o.next_owner_id ? actors.get(o.next_owner_id) : null;
    const needed = REQUIRED_AUTH[o.policy_class];
    if (isOpen && nextActor && !(nextActor.authorised_for ?? []).includes(needed)) {
      kinds.push("AUTHORISATION_GAP");
    }
  }

  if (kinds.length === 0) return null;

  // MEASURE 6: when does delay become unsafe, under the approved policy.
  const unsafeAnchor = received?.at ?? o.created_at;
  const unsafe_at = o.opaque ? null : addHours(unsafeAnchor, w.unsafe_after_h);
  const hours_to_unsafe = unsafe_at ? hoursBetween(now, unsafe_at) : null;
  const past_unsafe = hours_to_unsafe !== null && hours_to_unsafe <= 0;

  let severity: Severity;
  if (kinds.includes("UNABLE_TO_VERIFY") && kinds.length === 1) {
    severity = "info";
  } else if (past_unsafe) {
    severity = rule.severity_when_unsafe;
  } else if (kinds.includes("VISIBILITY_GAP")) {
    severity = o.priority === "emergency" ? "critical" : "high";
  } else if (kinds.includes("MISSING_OWNER") || kinds.includes("ROUTE_BROKEN") || kinds.includes("INSUFFICIENT_EVIDENCE")) {
    severity = o.priority === "emergency" ? "critical" : "high";
  } else {
    severity = "moderate";
  }

  const nextActor = o.next_owner_id ? actors.get(o.next_owner_id) ?? null : null;
  const openHours = dwell.filter((d) => d.open).reduce((a, b) => a + b.hours, 0);

  return {
    obligation_id: o.id,
    kinds,
    severity,
    owner_now: o.owner_id ? actors.get(o.owner_id) ?? null : null,
    must_receive_next: nextActor,
    boundary_dwell: dwell,
    total_open_hours: openHours,
    next_actor_available: nextActor ? nextActor.available ?? null : null,
    next_actor_authorised: nextActor
      ? (nextActor.authorised_for ?? []).includes(REQUIRED_AUTH[o.policy_class])
      : null,
    missing_information: missingInformation(o, actors),
    unsafe_at,
    hours_to_unsafe,
    past_unsafe,
    alternate_route: o.alternate_route ?? null,
    closure_evidence_required: o.requires_evidence,
    closure_evidence_held: heldEvidence(o),
    expected: expectedText(o),
    found: foundText(o, dwell, actors, now),
    safest_next_step: safestNextStep(o, kinds, actors),
    policy_ref: `${POLICY_VERSION} / ${rule.ref}`,
  };
}

export function evaluateAll(
  obligations: Obligation[],
  now: string,
  actors: Actor[],
): Exception[] {
  const map = new Map(actors.map((a) => [a.id, a]));
  return obligations
    .map((o) => evaluateObligation(o, now, map))
    .filter((e): e is Exception => e !== null)
    .sort((a, b) => {
      const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (s !== 0) return s;
      return (a.hours_to_unsafe ?? 1e9) - (b.hours_to_unsafe ?? 1e9);
    });
}
