import type {
  Actor,
  EhrBundle,
  EhrDocument,
  EhrObservation,
  EhrOrder,
  EhrReferral,
  Lane,
  Obligation,
  PolicyClass,
  Priority,
  SourceRef,
} from "@/lib/types";
import { LANE_LABEL } from "@/lib/types";
import type { AnimaBundle, AnimaResource } from "./anima-types";
import { policyWindow } from "@/lib/engine/policy";
import { addHours } from "@/lib/engine/clock";

/**
 * Maps the Anima simulator export (schema anima.patient.timeline.v1) onto the
 * same obligation model the hand-built episode uses. Nothing downstream knows
 * the difference.
 *
 * Two fields in the simulator data carry almost all of the signal:
 *
 *   owner       - which site is accountable for the record  -> the rail lane
 *   visible_to  - which sites are permitted to SEE it       -> provable blindness
 *
 * Every workflow in the export carries clinical_task_status: "not_inferred".
 * The simulator holds the records and deliberately does not turn them into
 * obligations. That inference is exactly what this file does.
 */

const SITE_TO_LANE: Record<string, Lane> = {
  hospital: "hospital",
  beds: "hospital",
  diagnostics: "hospital",
  gp: "gp",
  referrals: "gp",
  pharmacy: "pharmacy",
  community: "community",
  social: "community",
  wearables: "home",
  patient: "home",
};

function laneOf(site: string | undefined): Lane {
  return (site && SITE_TO_LANE[site]) || "gp";
}

/** Some exported resources carry no provenance at all, so never dereference it. */
function prov(r: AnimaResource) {
  const p = r.provenance ?? { changes: [] };
  return { created: p.created ?? null, changes: p.changes ?? [] };
}

/** Statuses that mean work is still outstanding somewhere. */
const OPEN_SIM_STATUS = new Set(["waiting", "open", "sent", "take", "booked", "active", "pending"]);

/** How each kind of outstanding simulator record is governed. */
interface Rule {
  policy_class: PolicyClass;
  priority: Priority;
  lane?: Lane;
  origin?: Lane;
  snomed: { code: string; term: string };
  title: (r: AnimaResource) => string;
  detail: (r: AnimaResource, ctx: Ctx) => string;
  closure_rule: string;
  requires: Obligation["requires_evidence"];
  alternate?: string;
  /** Sites that must be able to see this for care to be safe. */
  needs_visibility_from: string[];
}

interface Ctx {
  patientName: string;
  /** Derived from the record: does she use digital channels at all? */
  digitalCapable: boolean;
  admissionActive: boolean;
}

const RULES: Record<string, Rule> = {
  "hospital-attendance": {
    policy_class: "discharge_summary_transmission",
    priority: "urgent",
    lane: "hospital",
    origin: "hospital",
    snomed: { code: "32485007", term: "Hospital admission" },
    title: (r) => `Notify primary care and the community team of the current admission (${r.title})`,
    detail: (r, c) =>
      `${c.patientName} is currently an inpatient: ${String((r.data as { location?: string }).location ?? "unknown location")}, ` +
      `presenting complaint "${String((r.data as { presentingComplaint?: string }).presentingComplaint ?? r.title)}". ` +
      `The simulator marks this record visible only to ${(r.visible_to ?? []).join(", ")}. No other service can see that she is in hospital.`,
    closure_rule:
      "The GP practice and the community team can both see the admission, and each has acknowledged it.",
    requires: ["document_sent", "document_filed"],
    needs_visibility_from: ["gp", "community"],
    alternate: "Push an admission notification through the shared neighbourhood channel, which all five services subscribe to.",
  },
  "discharge-summary": {
    policy_class: "discharge_summary_filing",
    priority: "urgent",
    lane: "gp",
    origin: "hospital",
    snomed: { code: "373942005", term: "Discharge summary" },
    title: () => "Action the GP tasks in the clinic discharge correspondence",
    detail: (r) => {
      const gpActions = r.text_fields.find((t) => t.path.endsWith("gpActions"))?.text;
      const assignee = String((r.data as { assignee?: string }).assignee ?? "unassigned");
      return (
        `Letter is at stage "${r.source_status_current}", assigned to "${assignee}" rather than to a named clinician. ` +
        (gpActions ? `It asks primary care to: ${gpActions}` : "")
      );
    },
    closure_rule:
      "Each requested GP action is itemised against a named owner and the document is filed as actioned, not merely received.",
    requires: ["document_filed"],
    needs_visibility_from: ["gp"],
    alternate: "Assign to the duty GP if the practice document team has not picked it up within the acceptance window.",
  },
  appointment: {
    policy_class: "post_discharge_contact",
    priority: "urgent",
    lane: "gp",
    origin: "gp",
    snomed: { code: "185389009", term: "Follow-up visit" },
    title: (r) => `Confirm the outcome of the booked ${r.title.toLowerCase()}`,
    detail: (r, c) =>
      `Appointment with ${String((r.data as { clinician?: string }).clinician ?? "a clinician")} was booked for its due time and the record still reads "${r.source_status_current}". ` +
      `No attendance, non-attendance or cancellation outcome has been written back. ` +
      (c.admissionActive
        ? `She has been an inpatient since before the appointment time, so she cannot have attended - but the practice record cannot see the admission.`
        : ""),
    closure_rule: "An attendance outcome exists against the appointment, or it has been rebooked with a new date.",
    requires: ["patient_contact"],
    needs_visibility_from: ["gp"],
    alternate: "Rebook by telephone, which is her recorded contact preference, and flag the reason for non-attendance.",
  },
  "care-plan": {
    policy_class: "community_nursing_visit",
    priority: "emergency",
    lane: "community",
    origin: "community",
    snomed: { code: "734163000", term: "Care plan" },
    title: (r) => r.title,
    detail: (r) => {
      const d = r.data as { carerAvailable?: boolean; homeAccessConfirmed?: boolean };
      return (
        `Care plan is past its due time with carer availability = ${String(d.carerAvailable)} and home access confirmed = ${String(d.homeAccessConfirmed)}. ` +
        `Visible only to ${(r.visible_to ?? []).join(", ")}: the hospital planning her discharge cannot see that there is no support and no way in.`
      );
    },
    closure_rule:
      "A carer is allocated AND home access is confirmed AND the hospital discharge team can see both.",
    requires: ["referral_accepted", "visit_performed"],
    needs_visibility_from: ["hospital", "gp"],
    alternate: "Escalate to the neighbourhood team coordinator, who can commission an interim visit while funding is pending.",
  },
  "care-package": {
    policy_class: "community_nursing_visit",
    priority: "urgent",
    lane: "community",
    origin: "community",
    snomed: { code: "734163000", term: "Care plan" },
    title: (r) => r.title,
    detail: (r) => {
      const d = r.data as { fundingDecision?: string; keySafe?: boolean; visitsPerDay?: number };
      return (
        `${d.visitsPerDay ?? "?"} visits per day requested. Funding decision is "${d.fundingDecision}" and key safe = ${String(d.keySafe)}, past the due time. ` +
        `Visible only to ${(r.visible_to ?? []).join(", ")}.`
      );
    },
    closure_rule: "A funding decision is recorded and an allocated provider has accepted the package.",
    requires: ["referral_accepted"],
    needs_visibility_from: ["hospital", "gp"],
    alternate: "Request an interim bridging package under delegated authority while the funding decision is outstanding.",
  },
  "telephone-call": {
    policy_class: "post_discharge_contact",
    priority: "urgent",
    lane: "home",
    origin: "gp",
    snomed: { code: "185317003", term: "Telephone encounter" },
    title: (r) => `Complete the queued patient call: ${r.title.toLowerCase()}`,
    detail: (r, c) => {
      const d = r.data as { state?: { kind?: string; queuedAt?: number }; reason?: string; phone?: string };
      return (
        `A call to ${c.patientName} on ${d.phone ?? "her recorded number"} has been sitting at state "${d.state?.kind}" since it was queued. ` +
        `No attempt is recorded. Telephone is her recorded contact preference, so this is the channel that actually reaches her.`
      );
    },
    closure_rule: "A two-way contact with the patient is recorded, with her answers captured against the record.",
    requires: ["patient_contact"],
    needs_visibility_from: ["gp"],
    alternate: "If she cannot be reached after three attempts, escalate to the community team for a welfare check.",
  },
  conversation: {
    policy_class: "post_discharge_contact",
    priority: "urgent",
    lane: "gp",
    origin: "gp",
    snomed: { code: "185317003", term: "Telephone encounter" },
    title: (r) => `Confirm the patient actually received: ${r.title.toLowerCase()}`,
    detail: (r, c) => {
      const entries = (r.data as { entries?: { body?: string; channel?: string }[] }).entries ?? [];
      const first = entries[0];
      return (
        `Sent by ${String((r.data as { assignee?: string }).assignee ?? "the practice")} over ${first?.channel ?? "an unknown channel"}: "${first?.body ?? r.title}". ` +
        `Delivery is recorded, but the record for ${c.patientName} states she uses a landline and does not use the patient app. ` +
        `A delivery receipt on a channel she does not use is not evidence that she got the message.`
      );
    },
    closure_rule:
      "The patient has responded, or the request has been repeated on a channel she actually uses and that contact is evidenced.",
    requires: ["patient_contact"],
    needs_visibility_from: ["gp"],
    alternate: "Repeat by telephone to her landline, which is her recorded preference.",
  },
  device: {
    policy_class: "renal_recheck",
    priority: "standard",
    lane: "home",
    origin: "home",
    snomed: { code: "706767009", term: "Patient monitoring" },
    title: (r) => `Route home monitoring from the ${r.title.toLowerCase()} to the clinicians managing her`,
    detail: (r) =>
      `The watch is streaming and its readings are visible only to ${(r.visible_to ?? []).join(", ")}. ` +
      `Neither the GP nor the hospital can see any of it, so a deterioration at home cannot reach anyone who can act.`,
    closure_rule: "Home monitoring is visible to the GP and the hospital team, with a named clinician accountable for reviewing it.",
    requires: ["result_acknowledged"],
    needs_visibility_from: ["gp", "hospital"],
    alternate: "Share a summary view through the neighbourhood record rather than the full stream.",
  },
};

function pri(p: string): Priority {
  if (p === "urgent" || p === "emergency") return p;
  return "standard";
}

export function animaToBundle(b: AnimaBundle): EhrBundle {
  const simNow = b.extraction.simulation_clock_start.now;
  const born = new Date(b.patient.birthDate);
  const age = Math.floor((simNow - born.getTime()) / (365.25 * 24 * 3600_000));

  const documents: EhrDocument[] = [];
  const observations: EhrObservation[] = [];
  const orders: EhrOrder[] = [];
  const referrals: EhrReferral[] = [];

  for (const r of b.resources) {
    const at = r.created_at?.iso_utc ?? new Date(simNow).toISOString();
    const system = `Anima sim · ${r.owner} site`;

    if ((r.text_fields ?? []).length > 0) {
      documents.push({
        id: r.resource_id,
        system,
        type: r.source_kind,
        authored_at: at,
        author_id: prov(r).created?.actor?.name ?? "simulation",
        title: r.title,
        body: (r.text_fields ?? []).map((t) => `[${t.path}]\n${t.text}`).join("\n\n"),
      });
    }

    if (r.source_kind === "report" || r.source_kind === "observation") {
      const data = r.data as {
        analytes?: { name: string; value: number; unit?: string; referenceLow?: number; referenceHigh?: number }[];
        value?: number;
        unit?: string;
      };
      const a = data.analytes?.[0];
      const value = a ? a.value : data.value;
      const abnormal =
        a && a.referenceHigh != null && typeof a.value === "number"
          ? a.value > a.referenceHigh || (a.referenceLow != null && a.value < a.referenceLow)
          : false;
      observations.push({
        id: r.resource_id,
        system,
        code: r.resource_id,
        name: a?.name ?? r.title,
        value: value != null ? String(value) : r.source_status_current,
        unit: a?.unit ?? data.unit,
        flag: abnormal ? "abnormal" : "normal",
        taken_at: at,
        released_at: at,
        acknowledged_by: null,
        acknowledged_at: null,
        note: `Visible to: ${(r.visible_to ?? []).join(", ")}`,
      });
    }

    if (r.source_kind === "appointment" || r.category === "appointment_or_visit") {
      orders.push({
        id: r.resource_id,
        system,
        code: r.resource_id,
        name: r.title,
        requested_at: at,
        requested_by: prov(r).created?.actor?.name ?? "simulation",
        status: r.source_status_current === "completed" ? "resulted" : "requested",
      });
    }

    if (r.source_kind === "care-package" || r.source_kind === "care-plan") {
      referrals.push({
        id: r.resource_id,
        system,
        to_org: r.owner,
        to_lane: laneOf(r.owner),
        reason: r.title,
        sent_at: at,
        accepted_at: null,
        accepted_by: null,
        opaque: !(r.visible_to ?? []).includes("hospital"),
      });
    }
  }

  // Actors: every named person in provenance, attributed to the site they acted at.
  const actorMap = new Map<string, Actor>();
  const addActor = (name: string, site: string, role: string) => {
    const id = `ANI-${name.replace(/[^A-Za-z]/g, "").toUpperCase()}`;
    if (!actorMap.has(id)) {
      actorMap.set(id, {
        id,
        name,
        role,
        org: `${site} site (${b.extraction.world})`,
        lane: laneOf(site),
        available: true,
        authorised_for: ["act_on_results", "prescribe", "refer", "route_documents", "medicines_reconciliation", "referral_routing", "patient_contact"],
      });
    }
  };
  for (const r of b.resources) {
    const { created: c, changes } = prov(r);
    if (c?.actor?.name) addActor(c.actor.name, c.source ?? r.owner, "Clinician");
    for (const ch of changes) {
      if (ch.actor?.name) addActor(ch.actor.name, ch.source ?? r.owner, "Clinician");
    }
    const assignee = (r.data as { assignee?: string }).assignee;
    if (typeof assignee === "string" && assignee) addActor(assignee, r.owner, "Assigned team");
    const clinician = (r.data as { clinician?: string }).clinician;
    if (typeof clinician === "string" && clinician) addActor(clinician, r.owner, "Clinician");
  }
  // One coordinator per lane, so there is always a routable, authorised target.
  for (const [site, lane] of Object.entries(SITE_TO_LANE)) {
    if (["beds", "referrals", "social", "patient", "diagnostics"].includes(site)) continue;
    actorMap.set(`ANI-COORD-${lane.toUpperCase()}`, {
      id: `ANI-COORD-${lane.toUpperCase()}`,
      name: `${LANE_LABEL[lane]} coordinator`,
      role: "Neighbourhood coordinator",
      org: `${site} site (${b.extraction.world})`,
      lane,
      available: true,
      authorised_for: ["act_on_results", "prescribe", "refer", "route_documents", "medicines_reconciliation", "referral_routing", "patient_contact"],
    });
  }
  actorMap.set("ACT-AGENT", {
    id: "ACT-AGENT",
    name: "CareClosure Agent",
    role: "Automated follow-up",
    org: "CareClosure",
    lane: "home",
    available: true,
    authorised_for: ["patient_contact"],
  });

  const admission = b.resources.find((r) => r.source_kind === "hospital-attendance");

  return {
    episode_id: `${b.patient_id}-${b.extraction.team}`,
    discharge_at:
      admission?.created_at?.iso_utc ??
      b.resources.find((r) => r.source_kind === "discharge-summary")?.created_at?.iso_utc ??
      new Date(simNow).toISOString(),
    patient: {
      id: b.patient.id,
      nhs_number: b.patient.localIds?.gp ?? b.patient_id,
      name: b.patient.name,
      dob: b.patient.birthDate,
      age,
      sex: "Female",
      address: "Address held in the GP site record",
      phone:
        (b.resources.find((r) => r.source_kind === "telephone-call")?.data as { phone?: string })?.phone ??
        "07700 900005",
      language: "English",
      lives_alone: false,
      gp_practice: "GP site",
      flags: [
        ...(b.patient.conditions ?? []),
        ...(b.patient.needs ?? []),
        ...(b.patient.goals ?? []).map((g) => `Goal: ${g}`),
        "Landline only, does not use the patient app",
      ],
    },
    documents,
    observations,
    orders,
    medications: [],
    referrals,
    actors: Array.from(actorMap.values()),
  };
}

/** Turn the simulator's un-inferred records into obligations. */
export function animaObligations(b: AnimaBundle, bundle: EhrBundle): Obligation[] {
  const simNow = b.extraction.simulation_clock_start.now;
  const nowIso = new Date(simNow).toISOString();
  const ctx: Ctx = {
    patientName: b.patient.name.split(" ")[0],
    digitalCapable: false,
    admissionActive: b.resources.some(
      (r) => r.source_kind === "hospital-attendance" && OPEN_SIM_STATUS.has(r.source_status_current),
    ),
  };

  const out: Obligation[] = [];

  for (const r of b.resources) {
    const rule = RULES[r.source_kind];
    if (!rule) continue;
    if (!OPEN_SIM_STATUS.has(r.source_status_current) && r.source_kind !== "discharge-summary") continue;

    const lane = rule.lane ?? laneOf(r.owner);
    const origin = rule.origin ?? laneOf(r.owner);
    const priority = rule.priority ?? pri(r.priority);
    const created = r.created_at?.iso_utc ?? nowIso;
    const win = policyWindow(rule.policy_class, priority);
    const due = r.due_at?.iso_utc ?? addHours(created, win.complete_within_h);

    // The invisibility test: does every site that needs to see this actually see it?
    const vis = r.visible_to ?? [];
    const blind = rule.needs_visibility_from.filter((s) => !vis.includes(s));

    const source: SourceRef[] = [
      {
        system: `Anima simulator · ${r.owner} site · ${b.extraction.world}`,
        record_id: r.resource_id,
        record_type: `${r.source_kind} (${r.source_status_current})`,
        at: created,
        excerpt:
          (r.text_fields ?? []).find((t) => t.path.endsWith("gpActions"))?.text ??
          (r.text_fields ?? [])[0]?.text ??
          `visible_to: [${vis.join(", ")}] · owner: ${r.owner} · workflow ${r.workflow_id} reports clinical_task_status "not_inferred"`,
      },
      ...(r.text_fields ?? []).slice(0, 3).map((t) => ({
        system: `Anima simulator · ${r.owner} site`,
        record_id: `${r.resource_id}${t.path}`,
        record_type: "Free text",
        at: created,
        excerpt: t.text,
      })),
    ];

    const pv = prov(r);
    const lastChange = pv.changes[pv.changes.length - 1] ?? pv.created;
    const ownerActorName = (r.data as { assignee?: string; clinician?: string }).assignee ?? null;
    const ownerActor = ownerActorName
      ? bundle.actors.find((a) => a.name === ownerActorName)
      : undefined;
    // An "assignee" that names a team rather than a person is not an owner.
    const namedOwner = ownerActor && !/team|secretary|reception/i.test(ownerActor.name) ? ownerActor.id : null;

    out.push({
      id: `OBL-${r.resource_id}`,
      episode_id: bundle.episode_id,
      lane,
      origin_lane: origin,
      title: rule.title(r),
      detail: rule.detail(r, ctx),
      snomed: rule.snomed,
      priority,
      policy_class: rule.policy_class,
      created_at: created,
      due_at: due,
      owner_id: namedOwner,
      next_owner_id: `ANI-COORD-${lane.toUpperCase()}`,
      status: namedOwner ? "received" : "unowned",
      // We can read this record. `blind` is who cannot, and needs to.
      blind_to: blind.length > 0 ? blind : undefined,
      requires_evidence: rule.requires,
      evidence: [],
      transitions: [
        {
          at: pv.created?.time ? new Date(pv.created.time).toISOString() : created,
          kind: "created",
          from_lane: null,
          to_lane: laneOf(pv.created?.source ?? r.owner),
          actor_id: null,
          note: `Seeded by ${pv.created?.actor?.name ?? "the simulator"} at the ${pv.created?.source ?? r.owner} site.`,
        },
        ...(lastChange && lastChange !== pv.created
          ? [
              {
                at: new Date(lastChange.time).toISOString(),
                kind: "sent" as const,
                from_lane: laneOf(lastChange.source),
                to_lane: lane,
                actor_id: null,
                note: `${lastChange.action} by ${lastChange.actor.name}.`,
              },
            ]
          : []),
      ],
      source,
      closure_rule: rule.closure_rule,
      alternate_route:
        blind.length > 0
          ? `Grant ${blind.map((s) => s).join(" and ")} visibility of this record, then route to the ${LANE_LABEL[lane]} coordinator. ${rule.alternate ?? ""}`.trim()
          : rule.alternate,
    });
  }

  // Abnormal results that nobody has acknowledged, inferred from absence.
  const abnormal = bundle.observations
    .filter((o) => o.flag === "abnormal" && !o.acknowledged_at)
    .sort((a, c) => new Date(c.released_at ?? 0).getTime() - new Date(a.released_at ?? 0).getTime());
  if (abnormal.length) {
    const first = abnormal[0]; // most recently released, not the oldest in the file
    out.push({
      id: "OBL-ANIMA-UNACK-RESULTS",
      episode_id: bundle.episode_id,
      lane: "gp",
      origin_lane: "hospital",
      title: `Acknowledge ${abnormal.length} out-of-range result(s) with no recorded clinician decision`,
      detail:
        `${abnormal.length} of ${bundle.observations.length} results in this record sit outside their reference range with no acknowledgement by any clinician at any site. ` +
        `Highest-signal example: ${first.name} = ${first.value}${first.unit ? " " + first.unit : ""}.`,
      snomed: { code: "371545006", term: "Laboratory report" },
      priority: "urgent",
      policy_class: "microbiology_result_action",
      created_at: first.released_at ?? nowIso,
      due_at: addHours(first.released_at ?? nowIso, policyWindow("microbiology_result_action", "urgent").complete_within_h),
      owner_id: null,
      next_owner_id: "ANI-COORD-GP",
      status: "unowned",
      requires_evidence: ["result_acknowledged"],
      evidence: [],
      transitions: [
        {
          at: first.released_at ?? nowIso,
          kind: "created",
          from_lane: null,
          to_lane: "hospital",
          actor_id: null,
          note: "Released by the diagnostics site with no onward acknowledgement route.",
        },
      ],
      source: abnormal.slice(0, 5).map((o) => ({
        system: o.system,
        record_id: o.id,
        record_type: "Result",
        at: o.released_at ?? nowIso,
        excerpt: `${o.name} = ${o.value}${o.unit ? " " + o.unit : ""}. ${o.note ?? ""}`,
      })),
      closure_rule: "A clinician authorised to act on results has recorded a decision against each out-of-range result.",
      alternate_route: "Batch the out-of-range results into a single duty-GP review task rather than acknowledging individually.",
    });
  }

  return out;
}

export function loadAnima(raw: unknown): { bundle: EhrBundle; obligations: Obligation[]; simNow: string; meta: AnimaBundle["extraction"] & { statistics: Record<string, number>; notInferred: number } } {
  const b = raw as AnimaBundle;
  const bundle = animaToBundle(b);
  const obligations = animaObligations(b, bundle);
  return {
    bundle,
    obligations,
    simNow: new Date(b.extraction.simulation_clock_start.now).toISOString(),
    meta: {
      ...b.extraction,
      statistics: b.statistics,
      notInferred: b.workflows.filter((w) => w.clinical_task_status === "not_inferred").length,
    },
  };
}
