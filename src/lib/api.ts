"use client";

import type {
  Actor,
  EhrDocument,
  EhrMedication,
  EhrObservation,
  EhrOrder,
  EhrReferral,
  LedgerEntry,
  Obligation,
  Rail,
} from "@/lib/types";
import type { CallState, InboxItem } from "@/lib/store/state";
import type { OpsSummary } from "@/lib/engine/latency";
import type { CohortEpisode } from "@/lib/ehr/adapter";

export interface RailPayload {
  episode: "amira" | "eleanor";
  meta: {
    key: string;
    label: string;
    sublabel: string;
    provenance: string;
    source_systems: number;
    record_count: number;
    not_inferred: number;
  };
  rail: Rail;
  obligations: Obligation[];
  actors: Actor[];
  ledger: LedgerEntry[];
  inbox: InboxItem[];
  call: CallState;
  bundle: {
    documents: EhrDocument[];
    observations: EhrObservation[];
    orders: EhrOrder[];
    medications: EhrMedication[];
    referrals: EhrReferral[];
    discharge_at: string;
  };
}

export interface OpsPayload {
  summary: OpsSummary;
  cohort: CohortEpisode[];
  source: string;
}

const j = (r: Response) => r.json();

export const api = {
  rail: (): Promise<RailPayload> => fetch("/api/rail", { cache: "no-store" }).then(j),
  ops: (): Promise<OpsPayload> => fetch("/api/ops", { cache: "no-store" }).then(j),
  advance: (hours: number) => post("/api/clock", { hours }),
  approve: (obligation_id: string, message?: string) => post("/api/approve", { obligation_id, message }),
  reject: (obligation_id: string, reason: string) => post("/api/reject", { obligation_id, reason }),
  act: (message_id: string, note: string, actor_id: string) =>
    post("/api/inbox/act", { message_id, note, actor_id }),
  reset: (episode?: "amira" | "eleanor") => post("/api/reset", episode ? { episode } : {}),
  complete: (captured: Record<string, string>, summary: string, red_flag_detected: boolean) =>
    post("/api/voice/complete", { captured, summary, red_flag_detected }),
};

function post(path: string, body: unknown) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(j);
}
