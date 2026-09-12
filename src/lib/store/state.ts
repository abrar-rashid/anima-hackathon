import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EhrBundle, Lane, LedgerEntry, Obligation, TraceStep } from "@/lib/types";
import { AMIRA, SIM_START } from "@/lib/ehr/amira";
import { buildObligations } from "@/lib/engine/obligations";
import { loadAnima } from "@/lib/ehr/anima";

export type EpisodeKey = "amira" | "eleanor";

export interface EpisodeMeta {
  key: EpisodeKey;
  label: string;
  provenance: string;
  sublabel: string;
  source_systems: number;
  record_count: number;
  not_inferred: number;
}

export const EPISODES: { key: EpisodeKey; label: string; sublabel: string }[] = [
  { key: "amira", label: "Amira Khatun", sublabel: "authored discharge episode" },
  { key: "eleanor", label: "Eleanor Chen", sublabel: "live Anima simulator export" },
];

export interface InboxItem {
  id: string;
  lane: Lane;
  to_actor_id: string;
  from: string;
  subject: string;
  body: string;
  obligation_id: string;
  arrived_at: string; // sim time
  priority: string;
  action_required: string;
  acted: boolean;
}

export interface TranscriptLine {
  role: "agent" | "patient";
  text: string;
  at: string;
}

export interface CallState {
  status: "idle" | "connecting" | "ringing" | "live" | "ended" | "failed";
  mode: "realtime" | "scripted" | null;
  transcript: TranscriptLine[];
  started_at: string | null;
  ended_at: string | null;
  /** Structured answers the call captured. This is the closure evidence. */
  captured: Record<string, string>;
  red_flags: string[];
  error?: string;
}

export interface State {
  episode: EpisodeKey;
  meta: EpisodeMeta;
  bundle: EhrBundle;
  now: string;
  obligations: Obligation[];
  ledger: LedgerEntry[];
  seq: number;
  inbox: InboxItem[];
  call: CallState;
}

function loadEleanor() {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "data", "anima", "SIM-000006.json"), "utf8"),
  );
  return loadAnima(raw);
}

function freshState(which: EpisodeKey = "amira"): State {
  let bundle: EhrBundle;
  let obligations: Obligation[];
  let now: string;
  let meta: EpisodeMeta;
  let ingestTrace: TraceStep[];

  if (which === "eleanor") {
    const a = loadEleanor();
    bundle = a.bundle;
    obligations = a.obligations;
    now = a.simNow;
    const sites = a.meta.site_contexts.length;
    meta = {
      key: "eleanor",
      label: bundle.patient.name,
      sublabel: "live Anima simulator export",
      provenance: `${a.meta.source_api} · world ${a.meta.world} · ${a.meta.team} · schema anima.patient.timeline.v1`,
      source_systems: sites,
      record_count: a.meta.statistics.resources ?? 0,
      not_inferred: a.meta.notInferred,
    };
    ingestTrace = [
      { step: "anima.load", input: "data/anima/SIM-000006.json", output: `${a.meta.statistics.resources} resources, ${a.meta.statistics.events} events`, ms: 96 },
      { step: "anima.sites", input: a.meta.site_contexts.map((c) => c.endpoint).join(", "), output: `${sites} site contexts`, ms: 4 },
      { step: "anima.visibility", input: "resource.visible_to vs required readers", output: `${obligations.filter((o) => o.opaque).length} records invisible to a service that needs them`, ms: 11 },
      { step: "anima.task_status", input: `${a.meta.notInferred} workflows`, output: 'every one reports clinical_task_status "not_inferred" - the simulator holds records, not obligations', ms: 2 },
      { step: "obligations.build", output: `${obligations.length} obligations inferred`, ms: 14 },
    ];
  } else {
    bundle = AMIRA;
    obligations = buildObligations(bundle);
    now = SIM_START;
    meta = {
      key: "amira",
      label: bundle.patient.name,
      sublabel: "authored discharge episode",
      provenance: "Synthetic NHS record set spanning 5 unconnected source systems",
      source_systems: 5,
      record_count:
        bundle.documents.length + bundle.observations.length + bundle.orders.length + bundle.medications.length + bundle.referrals.length,
      not_inferred: 0,
    };
    ingestTrace = [
      { step: "ehr.fetch", input: bundle.episode_id, output: `${bundle.documents.length} docs`, ms: 84 },
      { step: "extract.free_text", input: "discharge summary + addendum + GP note", output: "7 task-bank matches", ms: 41 },
      { step: "extract.structured_gaps", input: "orders, results, referrals, medications", output: "5 inferred gaps", ms: 12 },
      { step: "obligations.build", output: `${obligations.length} obligations, 4 crossing a boundary`, ms: 6 },
      { step: "policy.bind", input: "CC-P1 v1.3", output: "9 policy classes bound", ms: 3 },
    ];
  }

  const state: State = {
    episode: which,
    meta,
    bundle,
    now,
    obligations,
    ledger: [],
    seq: 0,
    inbox: [],
    call: {
      status: "idle",
      mode: null,
      transcript: [],
      started_at: null,
      ended_at: null,
      captured: {},
      red_flags: [],
    },
  };

  append(state, {
    obligation_id: null,
    actor: "CareClosure Agent",
    actor_kind: "agent",
    event: "Episode ingested",
    detail:
      `${meta.provenance}. Parsed ${meta.record_count} records across ${meta.source_systems} source systems and built ${obligations.length} obligations` +
      (meta.not_inferred
        ? `. All ${meta.not_inferred} simulator workflows report clinical_task_status "not_inferred": the records exist, the obligations did not.`
        : "."),
    trace: ingestTrace,
  });

  return state;
}

/** Next dev remounts modules on edit, so the sim state has to survive that. */
const g = globalThis as unknown as { __cc_state?: State };

export function getState(): State {
  if (!g.__cc_state) g.__cc_state = freshState();
  return g.__cc_state;
}

export function resetState(which?: EpisodeKey): State {
  g.__cc_state = freshState(which ?? g.__cc_state?.episode ?? "amira");
  return g.__cc_state;
}

export function append(
  state: State,
  entry: Omit<LedgerEntry, "seq" | "at" | "wall_at" | "episode_id">,
): LedgerEntry {
  const e: LedgerEntry = {
    seq: ++state.seq,
    at: state.now,
    wall_at: new Date().toISOString(),
    episode_id: state.bundle.episode_id,
    ...entry,
  };
  state.ledger.push(e);
  return e;
}

export function traceFor(steps: TraceStep[]): TraceStep[] {
  return steps;
}
