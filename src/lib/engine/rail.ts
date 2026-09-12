import type {
  Actor,
  EhrBundle,
  Exception,
  Handoff,
  Lane,
  NodeState,
  Obligation,
  Rail,
  RailNode,
} from "@/lib/types";
import { LANES, LANE_LABEL } from "@/lib/types";
import { evaluateAll } from "./exceptions";
import { fmtDuration } from "./clock";
import { SEVERITY_ORDER } from "./policy";

/**
 * The Recovery Rail.
 *
 * NODES are organisations. EDGES are handoffs between them.
 *
 * That split is the whole thesis: an obligation that never crossed a boundary
 * is drawn ON the boundary, not inside an organisation, because no organisation
 * failed - the join between them did. A plain five-step progress bar cannot
 * express that, and it is where almost all of the harm actually happens.
 */

const LANE_ORG_FALLBACK: Record<Lane, string> = {
  hospital: "Royal London Hospital, Barts Health",
  gp: "Bromley-by-Bow Health Centre",
  pharmacy: "Boots Whitechapel Rd / Tower Hamlets PCN",
  community: "Tower Hamlets Community Health Services",
  home: "Patient's home, Bow E3",
};

const IN_FLIGHT = new Set(["unowned", "sent"]);

/** Org label per lane, taken from whoever actually appears in the record. */
function laneOrgs(actors: Actor[]): Record<Lane, string> {
  const out = { ...LANE_ORG_FALLBACK };
  for (const lane of LANES) {
    const counts = new Map<string, number>();
    for (const a of actors) {
      if (a.lane !== lane || !a.org) continue;
      // The agent is ours, not an organisation in the patient's pathway.
      if (a.id === "ACT-AGENT" || a.org === "CareClosure") continue;
      counts.set(a.org, (counts.get(a.org) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
    if (best) out[lane] = best[0];
  }
  return out;
}

function adjacent(a: Lane, b: Lane): boolean {
  return LANES.indexOf(b) - LANES.indexOf(a) === 1;
}

/**
 * An obligation belongs to a HANDOFF when it was supposed to cross a direct
 * boundary and has not landed. Otherwise it belongs to the NODE that is
 * accountable for it.
 */
export function placeObligation(o: Obligation): { kind: "handoff"; from: Lane; to: Lane } | { kind: "node"; lane: Lane } {
  if (o.origin_lane !== o.lane && adjacent(o.origin_lane, o.lane) && IN_FLIGHT.has(o.status)) {
    return { kind: "handoff", from: o.origin_lane, to: o.lane };
  }
  return { kind: "node", lane: o.lane };
}

/** Worst state wins. A node is only teal when everything in it is genuinely closed. */
function worstState(states: NodeState[]): NodeState {
  if (states.includes("breached")) return "breached";
  if (states.includes("waiting")) return "waiting";
  if (states.includes("unverifiable")) return "unverifiable";
  return states.length ? "closed" : "closed";
}

function stateFor(o: Obligation, exc: Exception | undefined): NodeState {
  if (!exc) return o.status === "completed" ? "closed" : "waiting";
  if (exc.kinds.length === 1 && exc.kinds[0] === "UNABLE_TO_VERIFY") return "unverifiable";
  if (exc.severity === "critical" || exc.severity === "high") return "breached";
  return "waiting";
}

export function buildRail(bundle: EhrBundle, obligations: Obligation[], now: string): Rail {
  const exceptions = evaluateAll(obligations, now, bundle.actors);
  const excById = new Map(exceptions.map((e) => [e.obligation_id, e]));

  const nodeBuckets = new Map<Lane, Obligation[]>(LANES.map((l) => [l, []]));
  const handoffBuckets = new Map<string, Obligation[]>();

  for (const o of obligations) {
    const place = placeObligation(o);
    if (place.kind === "node") {
      nodeBuckets.get(place.lane)!.push(o);
    } else {
      const key = `${place.from}->${place.to}`;
      if (!handoffBuckets.has(key)) handoffBuckets.set(key, []);
      handoffBuckets.get(key)!.push(o);
    }
  }

  const orgs = laneOrgs(bundle.actors);

  const nodes: RailNode[] = LANES.map((lane) => {
    const items = nodeBuckets.get(lane)!;
    const states = items.map((o) => stateFor(o, excById.get(o.id)));
    const closed = items.filter((o) => o.status === "completed" && !excById.get(o.id)).length;
    // A lane with no obligations is not a closed loop, it is an untested one.
    // Painting it teal would claim success we have not evidenced.
    const state: NodeState = items.length === 0 ? "unverifiable" : worstState(states);

    const worstExc = items
      .map((o) => excById.get(o.id))
      .filter((e): e is Exception => !!e)
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0];

    let headline: string;
    if (items.length === 0) headline = "Nothing routed here this episode";
    else if (state === "closed") headline = `${closed} of ${items.length} closed with evidence`;
    else if (state === "unverifiable") headline = "Status not shared by this service";
    else if (worstExc) {
      headline = worstExc.kinds
        .filter((k) => k !== "AUTHORISATION_GAP")
        .slice(0, 2)
        .map((k) => k.toLowerCase().replace(/_/g, " "))
        .join(" · ");
    } else headline = `${items.length} in progress`;

    return {
      lane,
      label: LANE_LABEL[lane],
      org: orgs[lane],
      state,
      obligation_ids: items.map((o) => o.id),
      closed,
      total: items.length,
      headline,
    };
  });

  const handoffs: Handoff[] = [];
  for (let i = 0; i < LANES.length - 1; i++) {
    const from = LANES[i];
    const to = LANES[i + 1];
    const key = `${from}->${to}`;
    const items = handoffBuckets.get(key) ?? [];

    if (items.length === 0) {
      // No obligation had to cross here. Neutral, not green: we are not
      // claiming success for a boundary that was never exercised.
      handoffs.push({
        id: key,
        from_lane: from,
        to_lane: to,
        state: "closed",
        obligation_ids: [],
        dwell_hours: null,
        label: "",
      });
      continue;
    }

    const excs = items.map((o) => excById.get(o.id)).filter((e): e is Exception => !!e);
    const dwell = Math.max(
      0,
      ...excs.map((e) => Math.max(0, ...e.boundary_dwell.filter((d) => d.open).map((d) => d.hours), 0)),
    );
    const worst = excs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0];
    const state: NodeState = worst
      ? worst.kinds.includes("UNABLE_TO_VERIFY")
        ? "unverifiable"
        : worst.severity === "critical" || worst.severity === "high"
          ? "breached"
          : "waiting"
      : "closed";

    handoffs.push({
      id: key,
      from_lane: from,
      to_lane: to,
      state,
      obligation_ids: items.map((o) => o.id),
      dwell_hours: dwell || null,
      label:
        state === "breached"
          ? `never routed · ${fmtDuration(dwell)}`
          : `in transit · ${fmtDuration(dwell)}`,
    });
  }

  const closable = obligations.length;
  const trulyClosed = obligations.filter((o) => o.status === "completed" && !excById.get(o.id)).length;

  return {
    episode_id: bundle.episode_id,
    patient: bundle.patient,
    now,
    nodes,
    handoffs,
    exceptions,
    closure_percent: closable === 0 ? 100 : Math.round((trulyClosed / closable) * 100),
  };
}

export function actorMap(actors: Actor[]) {
  return new Map(actors.map((a) => [a.id, a]));
}
