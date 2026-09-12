"use client";

import type { OpsPayload } from "@/lib/api";
import { fmtDuration } from "@/lib/engine/clock";

const MAX_BAR = 96;

export default function OpsView({ ops }: { ops: OpsPayload | null }) {
  if (!ops) return <div className="panel" style={{ padding: 20, color: "var(--muted)" }}>Loading cohort…</div>;
  const s = ops.summary;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Stat label="Episodes tracked" value={String(s.episodes)} sub={ops.source} />
        <Stat
          label="Loops fully closed"
          value={`${s.closure_rate}%`}
          sub={`${s.fully_closed} of ${s.episodes} discharges`}
          tone={s.closure_rate < 50 ? "red" : "teal"}
        />
        <Stat label="Boundary breaches" value={String(s.total_breaches)} sub="never crossed, or 3× median" tone="red" />
        <Stat
          label="Worst boundary"
          value={s.worst_boundary?.label ?? "—"}
          sub={
            s.worst_boundary
              ? `${s.worst_boundary.never_crossed_pct}% never cross · p90 ${fmtDuration(s.worst_boundary.p90 ?? 0)}`
              : ""
          }
          tone="red"
        />
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>
          <strong style={{ fontSize: 13.5 }}>Where the time goes, by boundary</strong>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
            Latency is measured at the join between organisations, not inside them. &ldquo;Never crossed&rdquo; is the
            number that matters: those obligations have no owner anywhere.
          </div>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 190 }}>Boundary</th>
              <th style={{ width: 78 }}>Crossed</th>
              <th style={{ width: 120 }}>Never crossed</th>
              <th style={{ width: 74 }}>p50</th>
              <th style={{ width: 74 }}>p90</th>
              <th style={{ width: 74 }}>Worst</th>
              <th>Avoidable delay per 100 discharges</th>
            </tr>
          </thead>
          <tbody>
            {s.boundaries.map((b) => (
              <tr key={b.boundary}>
                <td style={{ fontWeight: 650 }}>{b.label}</td>
                <td className="mono">{b.crossed}</td>
                <td>
                  <span className="mono" style={{ color: b.never_crossed_pct > 20 ? "var(--red)" : "var(--amber)" }}>
                    {b.never_crossed} ({b.never_crossed_pct}%)
                  </span>
                </td>
                <td className="mono">{fmtDuration(b.p50 ?? 0)}</td>
                <td className="mono" style={{ color: (b.p90 ?? 0) > 72 ? "var(--red)" : undefined }}>
                  {fmtDuration(b.p90 ?? 0)}
                </td>
                <td className="mono" style={{ color: "var(--muted)" }}>{fmtDuration(b.worst ?? 0)}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div className="bar" style={{ flex: 1, maxWidth: 230 }}>
                      <span
                        style={{
                          width: `${Math.min(100, (b.burden_per_100 / 2600) * 100)}%`,
                          background: b.burden_per_100 > 1200 ? "var(--red)" : "var(--amber)",
                        }}
                      />
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                      {b.burden_per_100}h
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ padding: "13px 16px" }}>
        <strong style={{ fontSize: 13.5 }}>Dwell distribution</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 18, marginTop: 14 }}>
          {s.histogram.map((h) => {
            const max = Math.max(...h.buckets.map((b) => b.count), 1);
            return (
              <div key={h.boundary}>
                <div className="lbl" style={{ marginBottom: 9 }}>{h.label}</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: MAX_BAR + 22 }}>
                  {h.buckets.map((b) => (
                    <div key={b.range} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                      <span className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>{b.count || ""}</span>
                      <div
                        style={{
                          width: "100%",
                          height: Math.max(2, (b.count / max) * MAX_BAR),
                          borderRadius: "4px 4px 0 0",
                          background: b.range === "never" ? "var(--red)" : b.range === "4d+" ? "#ff9a52" : "var(--teal)",
                          opacity: b.range === "never" ? 1 : 0.82,
                        }}
                      />
                      <span style={{ fontSize: 9.5, color: "var(--muted-2)", whiteSpace: "nowrap" }}>{b.range}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--line)" }}>
          <strong style={{ fontSize: 13.5 }}>Episodes with an unclosed loop</strong>
        </div>
        <div className="scroll" style={{ maxHeight: 260, overflow: "auto" }}>
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Episode</th>
                <th style={{ width: 160 }}>Patient</th>
                <th style={{ width: 200 }}>Trust</th>
                <th style={{ width: 84 }}>Breaches</th>
                <th>Boundaries (h, ✗ = never crossed)</th>
              </tr>
            </thead>
            <tbody>
              {ops.cohort
                .filter((e) => !e.closed)
                .sort((a, b) => b.breaches - a.breaches)
                .map((e) => (
                  <tr key={e.episode_id}>
                    <td className="mono" style={{ color: e.episode_id === "EPI-2026-0844" ? "var(--violet)" : "var(--muted)" }}>
                      {e.episode_id}
                      {e.episode_id === "EPI-2026-0844" && <div style={{ fontSize: 9.5 }}>on screen now</div>}
                    </td>
                    <td style={{ fontWeight: e.episode_id === "EPI-2026-0844" ? 700 : 400 }}>{e.patient_name}</td>
                    <td style={{ color: "var(--muted)" }}>{e.trust}</td>
                    <td className="mono" style={{ color: e.breaches > 2 ? "var(--red)" : "var(--amber)" }}>{e.breaches}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {Object.entries(e.boundaries)
                        .map(([k, v]) => `${k.split("->")[0].slice(0, 4)}→${k.split("->")[1].slice(0, 4)} ${v === null ? "✗" : v + "h"}`)
                        .join("   ")}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" | "teal" }) {
  return (
    <div className="panel" style={{ padding: "14px 16px" }}>
      <div className="lbl">{label}</div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 750,
          marginTop: 6,
          color: tone === "red" ? "var(--red)" : tone === "teal" ? "var(--teal)" : "var(--text)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}
