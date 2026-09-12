"use client";

import { useState } from "react";
import type { LedgerEntry, Obligation } from "@/lib/types";
import type { RailPayload } from "@/lib/api";
import { fmtClock } from "@/lib/engine/clock";

type Tab = "sources" | "trace" | "trail";

export default function Drawer({
  open,
  onToggle,
  data,
  obligation,
}: {
  open: boolean;
  onToggle: () => void;
  data: RailPayload;
  obligation: Obligation | null;
}) {
  const [tab, setTab] = useState<Tab>("sources");
  const traced = [...data.ledger].reverse().filter((e) => e.trace?.length);

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        background: "var(--bg-2)",
        borderTop: "1px solid var(--line-2)",
        height: open ? "42vh" : 42,
        transition: "height 220ms ease",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 42, flex: "0 0 auto" }}>
        <button className="btn btn-sm" onClick={onToggle} style={{ border: "none", background: "none", padding: "4px 6px" }}>
          {open ? "▾" : "▸"} Evidence drawer
        </button>
        {open && (
          <>
            {(
              [
                ["sources", `Source records${obligation ? ` (${obligation.source.length})` : ""}`],
                ["trace", `Agent trace (${traced.length})`],
                ["trail", `Activity trail (${data.ledger.length})`],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button key={k} className={`tab${tab === k ? " tab-active" : ""}`} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted-2)" }}>
          Append-only · proves who acted and when
        </span>
      </div>

      {open && (
        <div className="scroll" style={{ flex: 1, overflow: "auto", padding: "4px 16px 16px" }}>
          {tab === "sources" && <Sources data={data} obligation={obligation} />}
          {tab === "trace" && <Trace entries={traced} />}
          {tab === "trail" && <Trail entries={[...data.ledger].reverse()} />}
        </div>
      )}
    </div>
  );
}

function Sources({ data, obligation }: { data: RailPayload; obligation: Obligation | null }) {
  if (!obligation) return <Empty text="Select an obligation to see the records it was derived from." />;
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {obligation.source.map((s, i) => (
        <div key={i} className="panel-2" style={{ padding: 11 }}>
          <div style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap" }}>
            <span className="chip">{s.record_type}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--teal)" }}>{s.record_id}</span>
            <span style={{ fontSize: 11, color: "var(--muted-2)" }}>{s.system}</span>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)", marginLeft: "auto" }}>
              {fmtClock(s.at)}
            </span>
          </div>
          {s.excerpt && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                lineHeight: 1.5,
                borderLeft: "2px solid var(--line-2)",
                paddingLeft: 10,
                color: "var(--text)",
                fontStyle: "italic",
              }}
            >
              &ldquo;{s.excerpt}&rdquo;
            </div>
          )}
        </div>
      ))}
      <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 3 }}>
        {data.bundle.documents.length} documents · {data.bundle.observations.length} results ·{" "}
        {data.bundle.orders.length} orders · {data.bundle.medications.length} medications ·{" "}
        {data.bundle.referrals.length} referrals in this episode
      </div>
    </div>
  );
}

function Trace({ entries }: { entries: LedgerEntry[] }) {
  if (!entries.length) return <Empty text="No agent activity yet." />;
  return (
    <div style={{ display: "grid", gap: 9 }}>
      {entries.map((e) => (
        <div key={e.seq} className="panel-2" style={{ padding: 11 }}>
          <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 7 }}>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)" }}>#{e.seq}</span>
            <span style={{ fontSize: 12.5, fontWeight: 650 }}>{e.event}</span>
            <span style={{ fontSize: 11, color: "var(--muted-2)", marginLeft: "auto" }}>{e.actor}</span>
          </div>
          <table className="grid">
            <tbody>
              {e.trace!.map((t, i) => (
                <tr key={i}>
                  <td className="mono" style={{ width: 170, color: "var(--violet)", fontSize: 11 }}>{t.step}</td>
                  <td style={{ color: "var(--muted)", fontSize: 11.5 }}>{t.input ?? "—"}</td>
                  <td style={{ fontSize: 11.5 }}>{t.output ?? "—"}</td>
                  <td className="mono" style={{ width: 52, color: "var(--muted-2)", fontSize: 10.5, textAlign: "right" }}>
                    {t.ms != null ? `${t.ms}ms` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Trail({ entries }: { entries: LedgerEntry[] }) {
  if (!entries.length) return <Empty text="Nothing has happened yet." />;
  const colour = (k: LedgerEntry["actor_kind"]) =>
    k === "clinician" ? "var(--teal)" : k === "agent" ? "var(--violet)" : k === "patient" ? "#ffb0bd" : "var(--muted)";
  return (
    <table className="grid">
      <thead>
        <tr>
          <th style={{ width: 40 }}>#</th>
          <th style={{ width: 120 }}>Sim time</th>
          <th style={{ width: 165 }}>Actor</th>
          <th style={{ width: 210 }}>Event</th>
          <th>Detail</th>
          <th style={{ width: 105 }}>Evidence</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.seq}>
            <td className="mono" style={{ color: "var(--muted-2)" }}>{e.seq}</td>
            <td className="mono" style={{ color: "var(--muted)" }}>{fmtClock(e.at)}</td>
            <td style={{ color: colour(e.actor_kind), fontWeight: 600 }}>
              {e.actor}
              <div style={{ fontSize: 10, color: "var(--muted-2)", fontWeight: 400 }}>{e.actor_kind}</div>
            </td>
            <td style={{ fontWeight: 600 }}>{e.event}</td>
            <td style={{ color: "var(--muted)", lineHeight: 1.45 }}>{e.detail}</td>
            <td className="mono" style={{ color: "var(--teal)", fontSize: 11 }}>{e.evidence_ref ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ color: "var(--muted-2)", fontSize: 12.5, padding: "10px 0" }}>{text}</div>;
}
