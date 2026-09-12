"use client";

import { useState } from "react";
import type { RailPayload } from "@/lib/api";
import type { Lane } from "@/lib/types";
import { LANES, LANE_LABEL } from "@/lib/types";
import { fmtClock } from "@/lib/engine/clock";

const DESK: Record<Lane, { title: string; system: string; actorId: string }> = {
  hospital: { title: "Results desk", system: "Barts Health EPR — result inbox", actorId: "ACT-ONCALL-REG" },
  gp: { title: "Practice task list", system: "EMIS Web — Bromley-by-Bow Health Centre", actorId: "ACT-ADEYEMI" },
  pharmacy: { title: "Reconciliation queue", system: "Tower Hamlets PCN — clinical pharmacist workspace", actorId: "ACT-CHUKWU" },
  community: { title: "Neighbourhood team board", system: "Tower Hamlets Neighbourhood Team", actorId: "ACT-OBI" },
  home: { title: "Patient contact log", system: "CareClosure follow-up service", actorId: "ACT-AGENT" },
};

const DEFAULT_NOTE: Record<Lane, string> = {
  hospital:
    "Opened the culture. Organism resistant to the discharge antibiotic. Decision recorded and the patient's GP contacted directly.",
  gp: "Reviewed and actioned on the practice task list. Owner assigned and appointment booked.",
  pharmacy:
    "Reconciled all three lists. Conflict between the active naproxen repeat and the new apixaban flagged to the prescriber.",
  community: "Named nurse assigned and a visit slot booked. Acceptance now recorded against the referral.",
  home: "Contact logged against the record.",
};

export default function Workplace({
  data,
  onAct,
  busy,
}: {
  data: RailPayload;
  onAct: (messageId: string, note: string, actorId: string) => void;
  busy: boolean;
}) {
  const [lane, setLane] = useState<Lane>("gp");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const desk = DESK[lane];
  const items = data.inbox.filter((i) => i.lane === lane);
  const actor = data.actors.find((a) => a.id === desk.actorId);

  return (
    <div style={{ display: "grid", gap: 13 }}>
      <div className="panel" style={{ padding: "12px 14px", display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
        <span className="lbl">Signed in as</span>
        {LANES.map((l) => (
          <button key={l} className={`tab${lane === l ? " tab-active" : ""}`} onClick={() => setLane(l)}>
            {LANE_LABEL[l]}
            {data.inbox.filter((i) => i.lane === l && !i.acted).length > 0 && (
              <span
                style={{
                  marginLeft: 7,
                  background: "var(--red)",
                  color: "#fff",
                  borderRadius: 999,
                  fontSize: 10,
                  padding: "1px 6px",
                  fontWeight: 700,
                }}
              >
                {data.inbox.filter((i) => i.lane === l && !i.acted).length}
              </span>
            )}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted-2)" }}>
          This is the receiving organisation&apos;s own workplace, not CareClosure
        </span>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>
          <strong style={{ fontSize: 13.5 }}>
            {LANE_LABEL[lane]} — {desk.title}
          </strong>
          <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 3 }}>
            {desk.system} · {actor ? `${actor.name}, ${actor.role}` : ""}
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: 22, color: "var(--muted-2)", fontSize: 12.5 }}>
            Nothing in this queue. Approve an escalation on the rail and it will arrive here.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            {items.map((it) => (
              <div
                key={it.id}
                className={it.acted ? "" : "flash"}
                style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}
              >
                <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}>
                  <span className={`chip ${it.acted ? "chip-teal" : "chip-critical"}`}>
                    {it.acted ? "actioned" : it.priority}
                  </span>
                  <strong style={{ fontSize: 13 }}>{it.subject}</strong>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)", marginLeft: "auto" }}>
                    {it.id} · arrived {fmtClock(it.arrived_at)}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>From: {it.from}</div>
                <div
                  className="panel-2"
                  style={{ padding: 11, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 10 }}
                >
                  {it.body}
                </div>
                <div className="lbl" style={{ marginBottom: 5 }}>Required to close</div>
                <div style={{ fontSize: 12, color: "var(--amber)", marginBottom: 11 }}>{it.action_required}</div>

                {it.acted ? (
                  <div style={{ fontSize: 12, color: "var(--teal)" }}>✓ Actioned and evidence written back to the record.</div>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <textarea
                      value={notes[it.id] ?? DEFAULT_NOTE[lane]}
                      onChange={(e) => setNotes((n) => ({ ...n, [it.id]: e.target.value }))}
                      rows={2}
                      style={{
                        flex: 1,
                        minWidth: 280,
                        background: "var(--bg-2)",
                        color: "var(--text)",
                        border: "1px solid var(--line-2)",
                        borderRadius: 7,
                        padding: 9,
                        fontSize: 12,
                        fontFamily: "inherit",
                        resize: "vertical",
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => onAct(it.id, notes[it.id] ?? DEFAULT_NOTE[lane], desk.actorId)}
                    >
                      Record action + evidence
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
