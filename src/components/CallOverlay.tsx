"use client";

import { useEffect, useRef } from "react";

export interface CallUi {
  status: "idle" | "connecting" | "ringing" | "live" | "ended" | "failed";
  mode: "realtime" | "scripted" | null;
  lines: { role: "agent" | "patient"; text: string }[];
  partial: string;
  captured: Record<string, string> | null;
  redFlags: string[];
  error: string | null;
}

const STATUS_TEXT: Record<CallUi["status"], string> = {
  idle: "",
  connecting: "Opening session…",
  ringing: "Ringing…",
  live: "Connected",
  ended: "Call ended",
  failed: "Call failed",
};

export default function CallOverlay({
  ui,
  onHangUp,
  onClose,
  patientName,
  patientPhone,
}: {
  ui: CallUi;
  onHangUp: () => void;
  onClose: () => void;
  patientName: string;
  patientPhone: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [ui.lines.length, ui.partial]);

  if (ui.status === "idle") return null;
  const done = ui.status === "ended" || ui.status === "failed";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,8,11,0.82)",
        backdropFilter: "blur(5px)",
        zIndex: 90,
        display: "grid",
        placeItems: "center",
        padding: 22,
      }}
    >
      <div className="panel" style={{ width: "min(760px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            padding: "15px 18px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: 13,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              background: "var(--panel-2)",
              border: "1px solid var(--line-2)",
              display: "grid",
              placeItems: "center",
              fontSize: 18,
            }}
          >
            📞
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{patientName}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>{patientPhone}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <span
              className={`chip ${ui.status === "live" ? "chip-teal" : ui.status === "failed" ? "chip-critical" : ""}`}
              style={{ gap: 7 }}
            >
              {ui.status === "live" && <span className="ring-dot live-dot" style={{ background: "var(--teal)" }} />}
              {STATUS_TEXT[ui.status]}
            </span>
            {ui.mode && (
              <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)", letterSpacing: "0.06em" }}>
                {ui.mode === "realtime" ? "LIVE VOICE · OPENAI REALTIME" : "SIMULATED PATIENT"}
              </span>
            )}
          </div>
          {ui.status === "live" && (
            <div className="wave">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <i key={i} style={{ animationDelay: `${i * 110}ms` }} />
              ))}
            </div>
          )}
        </div>

        {ui.error && (
          <div
            style={{
              padding: "9px 18px",
              fontSize: 11.5,
              color: "var(--amber)",
              borderBottom: "1px solid var(--line)",
              background: "rgba(242,169,59,0.06)",
            }}
          >
            {ui.error}
          </div>
        )}

        <div ref={scroller} className="scroll" style={{ flex: 1, overflow: "auto", padding: "16px 18px", minHeight: 220 }}>
          {ui.lines.length === 0 && !ui.partial && (
            <div style={{ color: "var(--muted-2)", fontSize: 12.5 }}>
              {ui.mode === "realtime"
                ? "Waiting for the first turn. Speak as Amira when the agent greets you."
                : "Connecting…"}
            </div>
          )}
          {ui.lines.map((l, i) => (
            <Bubble key={i} role={l.role} text={l.text} />
          ))}
          {ui.partial && <Bubble role="agent" text={ui.partial} partial />}
        </div>

        {ui.captured && (
          <div style={{ borderTop: "1px solid var(--line)", padding: "14px 18px", maxHeight: 260, overflow: "auto" }} className="scroll">
            <div className="lbl" style={{ color: "var(--teal)", marginBottom: 8 }}>
              Captured as closure evidence
            </div>
            <table className="grid">
              <tbody>
                {Object.entries(ui.captured).map(([k, v]) => (
                  <tr key={k}>
                    <td className="mono" style={{ color: "var(--muted-2)", width: 150, fontSize: 11 }}>{k}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ui.redFlags.length > 0 && (
              <>
                <div className="lbl" style={{ color: "var(--red)", margin: "14px 0 7px" }}>
                  Red flags routed to the duty GP
                </div>
                {ui.redFlags.map((f, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: "var(--red)", marginBottom: 4 }}>⚑ {f}</div>
                ))}
                <div style={{ fontSize: 11.5, color: "var(--amber)", marginTop: 9, fontStyle: "italic" }}>
                  The agent gave no advice and changed nothing. Everything above is now a clinician&apos;s decision.
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ padding: "13px 18px", borderTop: "1px solid var(--line)", display: "flex", gap: 9, justifyContent: "flex-end" }}>
          {!done ? (
            <button className="btn btn-danger" onClick={onHangUp}>End call</button>
          ) : (
            <button className="btn btn-primary" onClick={onClose}>Back to the rail</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, text, partial }: { role: "agent" | "patient"; text: string; partial?: boolean }) {
  const agent = role === "agent";
  return (
    <div style={{ display: "flex", justifyContent: agent ? "flex-start" : "flex-end", marginBottom: 10 }}>
      <div
        style={{
          maxWidth: "78%",
          padding: "9px 13px",
          borderRadius: 12,
          borderTopLeftRadius: agent ? 3 : 12,
          borderTopRightRadius: agent ? 12 : 3,
          background: agent ? "var(--panel-2)" : "rgba(25,194,181,0.11)",
          border: `1px solid ${agent ? "var(--line-2)" : "var(--teal-dim)"}`,
          fontSize: 12.5,
          lineHeight: 1.5,
          opacity: partial ? 0.62 : 1,
        }}
      >
        <div className="lbl" style={{ marginBottom: 3, color: agent ? "var(--muted-2)" : "var(--teal)" }}>
          {agent ? "Agent" : "Patient"}
        </div>
        {text}
      </div>
    </div>
  );
}
