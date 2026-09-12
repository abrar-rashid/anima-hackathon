"use client";

import type { RailPayload } from "@/lib/api";
import { EXCEPTION_LABEL, LANE_LABEL } from "@/lib/types";
import { fmtClock, fmtDuration, hoursBetween } from "@/lib/engine/clock";

export default function LedgerView({
  data,
  onSelect,
  selected,
}: {
  data: RailPayload;
  onSelect: (id: string) => void;
  selected: string | null;
}) {
  const exc = new Map(data.rail.exceptions.map((e) => [e.obligation_id, e]));
  const now = data.rail.now;

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13.5 }}>Task ledger</strong>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          Every obligation extracted for this episode, with the boundary it is stuck at and the evidence it still needs.
        </span>
        <span className="chip chip-teal" style={{ marginLeft: "auto" }}>
          {data.rail.closure_percent}% closed with evidence
        </span>
      </div>
      <div className="scroll" style={{ overflow: "auto" }}>
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 150 }}>Obligation</th>
              <th>Title</th>
              <th style={{ width: 118 }}>Accountable</th>
              <th style={{ width: 140 }}>Owner</th>
              <th style={{ width: 90 }}>Status</th>
              <th style={{ width: 88 }}>Open for</th>
              <th style={{ width: 112 }}>Due</th>
              <th style={{ width: 190 }}>Exception</th>
              <th style={{ width: 80 }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {data.obligations.map((o) => {
              const e = exc.get(o.id);
              const owner = o.owner_id ? data.actors.find((a) => a.id === o.owner_id) : null;
              const overdue = o.status !== "completed" && hoursBetween(o.due_at, now) > 0;
              return (
                <tr
                  key={o.id}
                  onClick={() => onSelect(o.id)}
                  style={{
                    cursor: "pointer",
                    background: selected === o.id ? "rgba(139,123,240,0.1)" : undefined,
                  }}
                >
                  <td className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                    {o.id}
                    <div style={{ color: "var(--muted-2)", marginTop: 2 }}>{o.snomed.code}</div>
                  </td>
                  <td style={{ fontWeight: 600, lineHeight: 1.4 }}>{o.title}</td>
                  <td>
                    {LANE_LABEL[o.lane]}
                    {o.origin_lane !== o.lane && (
                      <div style={{ fontSize: 10, color: "var(--muted-2)" }}>from {LANE_LABEL[o.origin_lane]}</div>
                    )}
                  </td>
                  <td style={{ color: owner ? "var(--text)" : "var(--red)", fontWeight: owner ? 400 : 650 }}>
                    {owner ? owner.name : "none"}
                    {owner && <div style={{ fontSize: 10, color: "var(--muted-2)" }}>{owner.role}</div>}
                  </td>
                  <td>
                    <span className={`chip ${o.status === "completed" && !e ? "chip-teal" : o.status === "not_shared" ? "chip-info" : ""}`}>
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="mono" style={{ color: e?.total_open_hours ? "var(--red)" : "var(--muted-2)" }}>
                    {e?.total_open_hours ? fmtDuration(e.total_open_hours) : "—"}
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: overdue ? "var(--red)" : "var(--muted)" }}>
                    {fmtClock(o.due_at)}
                  </td>
                  <td>
                    {e ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        <span className={`chip chip-${e.severity}`}>{e.severity}</span>
                        {e.kinds.slice(0, 2).map((k) => (
                          <span key={k} className="chip" style={{ fontSize: 10 }}>{EXCEPTION_LABEL[k]}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="chip chip-teal">closed</span>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)" }}>
                    {o.source.length} rec
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
