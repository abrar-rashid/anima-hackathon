import type { Evidence, Lane, Obligation } from "@/lib/types";
import { LANE_LABEL } from "@/lib/types";
import { addHours, fmtClock, fmtDuration, hoursBetween } from "@/lib/engine/clock";
import { evaluateObligation } from "@/lib/engine/exceptions";
import { POLICY_VERSION } from "@/lib/engine/policy";
import { actorMap } from "@/lib/engine/rail";
import { append, getState, type InboxItem, type State } from "./state";

function obl(state: State, id: string): Obligation {
  const o = state.obligations.find((x) => x.id === id);
  if (!o) throw new Error(`Unknown obligation ${id}`);
  return o;
}

/** Advance the simulator clock. Everything downstream recomputes from `now`. */
export function advanceClock(hours: number) {
  const state = getState();
  const before = state.now;
  state.now = addHours(state.now, hours);

  const actors = actorMap(state.bundle.actors);
  const newlyBreached = state.obligations.filter((o) => {
    const wasE = evaluateObligation(o, before, actors);
    const nowE = evaluateObligation(o, state.now, actors);
    if (!nowE) return false;
    const was = wasE?.kinds ?? [];
    return nowE.kinds.some((k) => !was.includes(k));
  });

  append(state, {
    obligation_id: null,
    actor: "Simulator",
    actor_kind: "system",
    event: `Clock advanced ${fmtDuration(hours)}`,
    detail:
      `${fmtClock(before)} -> ${fmtClock(state.now)}. ` +
      (newlyBreached.length
        ? `${newlyBreached.length} obligation(s) crossed a policy threshold: ${newlyBreached.map((o) => o.id).join(", ")}.`
        : "No new policy thresholds crossed."),
    trace: [
      { step: "clock.advance", input: `${hours}h`, output: state.now, ms: 1 },
      { step: "exceptions.reevaluate", input: `${state.obligations.length} obligations`, output: `${newlyBreached.length} changed`, ms: 9 },
    ],
  });

  return { now: state.now, newly_breached: newlyBreached.map((o) => o.id) };
}

/**
 * The one clinician button. Approving an escalation ROUTES work to a named,
 * available, authorised person and drops it into their real workplace queue.
 * It never changes treatment.
 */
export function approveEscalation(obligationId: string, editedMessage?: string) {
  const state = getState();
  const o = obl(state, obligationId);
  const actors = actorMap(state.bundle.actors);
  const exc = evaluateObligation(o, state.now, actors);
  if (!exc) throw new Error("No live exception on this obligation");

  const step = exc.safest_next_step;
  const target = step.target_actor_id ? actors.get(step.target_actor_id) : null;
  const message = editedMessage ?? step.message;

  if (step.action === "request_access") {
    return requestAccess(obligationId, message);
  }

  if (!target) throw new Error("No routable target");

  // Route it: the obligation now has an owner, and it has crossed the boundary.
  o.owner_id = target.id;
  o.status = "accepted";
  o.transitions.push(
    {
      at: state.now,
      kind: "sent",
      from_lane: o.origin_lane,
      to_lane: target.lane,
      actor_id: "ACT-AGENT",
      note: "Routed by CareClosure after clinician approval.",
    },
    {
      at: state.now,
      kind: "received",
      from_lane: o.origin_lane,
      to_lane: target.lane,
      actor_id: target.id,
    },
    {
      at: state.now,
      kind: "accepted",
      from_lane: null,
      to_lane: target.lane,
      actor_id: target.id,
      note: `Accepted by ${target.name}.`,
    },
  );

  const item: InboxItem = {
    id: `MSG-${state.seq + 1}`,
    lane: target.lane,
    to_actor_id: target.id,
    from: "CareClosure (approved by Dr Priya Nandakumar)",
    subject: o.title,
    body: message,
    obligation_id: o.id,
    arrived_at: state.now,
    priority: o.priority,
    action_required: o.closure_rule,
    acted: false,
  };
  state.inbox.push(item);

  append(state, {
    obligation_id: o.id,
    actor: "Dr Priya Nandakumar",
    actor_kind: "clinician",
    event: "Escalation approved",
    detail:
      `Approved routing of "${o.title}" to ${target.name} (${target.role}, ${target.org}). ` +
      `Delivered to the ${LANE_LABEL[target.lane]} queue at ${fmtClock(state.now)}.` +
      (editedMessage ? " Message edited by the clinician before sending." : ""),
    evidence_ref: item.id,
    trace: [
      { step: "policy.lookup", input: o.policy_class, output: POLICY_VERSION, ms: 2 },
      {
        step: "route.select",
        input: `required auth for ${o.policy_class}`,
        output: `${target.name} available=${target.available} authorised=${exc.next_actor_authorised}`,
        ms: 5,
      },
      { step: "human.approve", input: "clinician button", output: editedMessage ? "approved with edit" : "approved as proposed", ms: 0 },
      { step: "deliver.queue", input: `${LANE_LABEL[target.lane]} queue`, output: item.id, ms: 7 },
    ],
  });

  return { ok: true, message_id: item.id, target: target.name, lane: target.lane };
}

export function rejectEscalation(obligationId: string, reason: string) {
  const state = getState();
  const o = obl(state, obligationId);
  append(state, {
    obligation_id: o.id,
    actor: "Dr Priya Nandakumar",
    actor_kind: "clinician",
    event: "Escalation rejected",
    detail: `Clinician declined the proposed routing for "${o.title}". Reason: ${reason}. Obligation remains open and tracked.`,
    trace: [{ step: "human.reject", input: reason, output: "obligation left open", ms: 0 }],
  });
  return { ok: true };
}

/**
 * The honest-unknown path. We do not know the community status, so we ask the
 * one service that does instead of raising a false alert. What comes back is
 * often worse than the alert would have been.
 */
export function requestAccess(obligationId: string, message?: string) {
  const state = getState();
  const o = obl(state, obligationId);

  o.opaque = false;
  o.status = "unowned"; // the truth, now that we can see it
  o.transitions.push({
    at: state.now,
    kind: "received",
    from_lane: "hospital",
    to_lane: o.lane,
    actor_id: null,
    note:
      "Neighbourhood team confirmed: the referral was received by the community gateway on 08/09 but was never accepted by a named nurse. No visit has taken place. There is no owner.",
  });
  o.next_owner_id = "ACT-OBI";

  const item: InboxItem = {
    id: `MSG-${state.seq + 1}`,
    lane: "community",
    to_actor_id: "ACT-OBI",
    from: "CareClosure (approved by Dr Priya Nandakumar)",
    subject: `Status confirmation: ${o.title}`,
    body: message ?? "Please confirm acceptance and visit status for this post-discharge referral.",
    obligation_id: o.id,
    arrived_at: state.now,
    priority: o.priority,
    action_required: "Confirm acceptance status and assign a named community nurse.",
    acted: false,
  };
  state.inbox.push(item);

  append(state, {
    obligation_id: o.id,
    actor: "Nneka Obi",
    actor_kind: "clinician",
    event: "Visibility resolved",
    detail:
      "Tower Hamlets Neighbourhood Team confirmed the referral was received on 08/09 but never accepted, and no visit has taken place. " +
      "State moves from Unable to verify to a confirmed breach with a named next owner. No false alert was raised while the status was genuinely unknown.",
    evidence_ref: item.id,
    trace: [
      { step: "access.request", input: "neighbourhood shared channel", output: "status returned", ms: 240 },
      { step: "state.transition", input: "unverifiable", output: "unowned (confirmed)", ms: 2 },
    ],
  });

  return { ok: true, message_id: item.id };
}

/** Close an obligation with real evidence. Used by the voice call. */
export function closeWithEvidence(obligationId: string, evidence: Evidence, detail: string, actorLabel: string) {
  const state = getState();
  const o = obl(state, obligationId);
  o.evidence.push(evidence);
  o.owner_id = evidence.actor_id;
  o.status = "completed";
  o.transitions.push({
    at: state.now,
    kind: "completed",
    from_lane: null,
    to_lane: o.lane,
    actor_id: evidence.actor_id,
    note: detail,
  });
  append(state, {
    obligation_id: o.id,
    actor: actorLabel,
    actor_kind: "agent",
    event: "Loop closed with evidence",
    detail,
    evidence_ref: evidence.record_id,
    trace: [
      { step: "evidence.attach", input: evidence.kind, output: evidence.record_id, ms: 4 },
      { step: "closure.verify", input: o.closure_rule, output: "satisfied", ms: 3 },
    ],
  });
  return { ok: true };
}

/** Mark a workplace item as acted on, from inside the receiving workplace. */
export function actOnInboxItem(messageId: string, note: string, actorId: string) {
  const state = getState();
  const item = state.inbox.find((i) => i.id === messageId);
  if (!item) throw new Error("Unknown message");
  item.acted = true;
  const actor = state.bundle.actors.find((a) => a.id === actorId);
  const o = obl(state, item.obligation_id);

  const kind = o.requires_evidence[0];
  o.evidence.push({
    kind,
    at: state.now,
    actor_id: actorId,
    record_id: `EV-${state.seq + 1}`,
    note,
  });
  const stillMissing = o.requires_evidence.filter(
    (k) => !o.evidence.some((e) => e.kind === k),
  );
  if (stillMissing.length === 0) {
    o.status = "completed";
    o.transitions.push({
      at: state.now,
      kind: "completed",
      from_lane: null,
      to_lane: o.lane,
      actor_id: actorId,
    });
  }

  append(state, {
    obligation_id: o.id,
    actor: actor?.name ?? actorId,
    actor_kind: "clinician",
    event: stillMissing.length ? "Action recorded, evidence still incomplete" : "Obligation completed with evidence",
    detail: `${actor?.name ?? actorId} (${actor?.org ?? ""}) acted in their own workplace: ${note}`,
    evidence_ref: `EV-${state.seq}`,
    trace: [
      { step: "workplace.action", input: messageId, output: kind, ms: 0 },
      {
        step: "closure.verify",
        input: o.closure_rule,
        output: stillMissing.length ? `still missing: ${stillMissing.join(", ")}` : "satisfied",
        ms: 3,
      },
    ],
  });

  return { ok: true, completed: stillMissing.length === 0 };
}

export function dwellSummary(obligationId: string) {
  const state = getState();
  const o = obl(state, obligationId);
  return hoursBetween(o.created_at, state.now);
}

export function laneOf(actorId: string): Lane | null {
  const state = getState();
  return state.bundle.actors.find((a) => a.id === actorId)?.lane ?? null;
}
