"use client";

import { useEffect, useState } from "react";
import type { Actor, Exception, Obligation } from "@/lib/types";
import { EVIDENCE_LABEL, EXCEPTION_LABEL, LANE_LABEL } from "@/lib/types";
import { fmtClock, fmtDuration } from "@/lib/engine/clock";

function Measure({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
      <span
        className="mono"
        style={{
          flex: "0 0 auto",
          width: 17,
          height: 17,
          borderRadius: 4,
          background: "var(--panel-2)",
          border: "1px solid var(--line-2)",
          fontSize: 9.5,
          color: "var(--muted-2)",
          display: "grid",
          placeItems: "center",
          marginTop: 1,
        }}
      >
        {n}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="lbl" style={{ marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{children}</div>
      </div>
    </div>
  );
}

function YesNo({ v, yes, no, unknown }: { v: boolean | null; yes: string; no: string; unknown: string }) {
  if (v === null) return <span style={{ color: "var(--grey)" }}>{unknown}</span>;
  return <span style={{ color: v ? "var(--teal)" : "var(--red)" }}>{v ? yes : no}</span>;
}

export default function ExceptionPanel({
  obligation,
  exception,
  actors,
  onApprove,
  onReject,
  onCall,
  busy,
  callActive,
}: {
  obligation: Obligation | null;
  exception: Exception | null;
  actors: Actor[];
  onApprove: (message: string) => void;
  onReject: (reason: string) => void;
  onCall: () => void;
  busy: boolean;
  callActive: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setEditing(false);
    setDraft(exception?.safest_next_step.message ?? "");
  }, [exception?.obligation_id, exception?.safest_next_step.message]);

  if (!obligation) {
    return (
      <div className="panel" style={{ padding: 22, color: "var(--muted)", fontSize: 13 }}>
        Select a node, a handoff or an exception on the rail.
      </div>
    );
  }

  if (!exception) {
    return (
      <div className="panel" style={{ padding: 20 }}>
        <span className="chip chip-teal">Closed</span>
        <h3 style={{ fontSize: 15, margin: "12px 0 8px", lineHeight: 1.35 }}>{obligation.title}</h3>
        <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>{obligation.detail}</p>
        <div className="lbl" style={{ marginTop: 16, marginBottom: 6 }}>Evidence held</div>
        {obligation.evidence.map((e, i) => (
          <div key={i} style={{ fontSize: 12, marginBottom: 6, color: "var(--teal)" }}>
            ✓ {EVIDENCE_LABEL[e.kind]} — {fmtClock(e.at)}
            {e.note && <div style={{ color: "var(--muted)", marginTop: 2 }}>{e.note}</div>}
          </div>
        ))}
      </div>
    );
  }

  const step = exception.safest_next_step;
  const isCall = step.action === "call_patient";
  const target = step.target_actor_id ? actors.find((a) => a.id === step.target_actor_id) : null;

  return (
    <div className="panel scroll" style={{ padding: 0, overflow: "auto", maxHeight: "100%" }}>
      <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
          <span className={`chip chip-${exception.severity}`}>{exception.severity}</span>
          {exception.kinds.map((k) => (
            <span key={k} className="chip">{EXCEPTION_LABEL[k]}</span>
          ))}
        </div>
        <h3 style={{ fontSize: 15.5, margin: "0 0 7px", lineHeight: 1.35 }}>{obligation.title}</h3>
        <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>{obligation.detail}</p>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)", marginTop: 9 }}>
          {obligation.id} · SNOMED {obligation.snomed.code} {obligation.snomed.term} · {obligation.priority}
        </div>
      </div>

      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
        <div className="lbl">What was expected</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: "5px 0 14px" }}>{exception.expected}</p>

        <div className="lbl" style={{ color: "var(--red)" }}>What we found</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: "5px 0 0" }}>{exception.found}</p>
      </div>

      <div style={{ padding: "6px 18px 12px", borderBottom: "1px solid var(--line)" }}>
        <div className="lbl" style={{ padding: "10px 0 2px" }}>
          The eight measures
        </div>

        <Measure n={1} label="Who owns it now">
          {exception.owner_now ? (
            <>
              {exception.owner_now.name} · {exception.owner_now.role}, {exception.owner_now.org}
            </>
          ) : (
            <span style={{ color: "var(--red)", fontWeight: 650 }}>Nobody. No owner in any participating system.</span>
          )}
        </Measure>

        <Measure n={2} label="Who must receive it next">
          {exception.must_receive_next ? (
            <>
              {exception.must_receive_next.name} · {exception.must_receive_next.role},{" "}
              {exception.must_receive_next.org}
            </>
          ) : (
            <span style={{ color: "var(--grey)" }}>No onward route configured</span>
          )}
        </Measure>

        <Measure n={3} label="How long it has waited, by boundary">
          {exception.boundary_dwell.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
              <span style={{ color: d.open ? "var(--red)" : "var(--muted)" }}>
                {d.open ? "▸ " : "✓ "}
                {d.boundary}
                {d.from_lane && d.to_lane && d.from_lane !== d.to_lane
                  ? ` (${LANE_LABEL[d.from_lane]} → ${LANE_LABEL[d.to_lane]})`
                  : ""}
              </span>
              <span className="mono" style={{ color: d.open ? "var(--red)" : "var(--muted-2)", whiteSpace: "nowrap" }}>
                {fmtDuration(d.hours)}
              </span>
            </div>
          ))}
        </Measure>

        <Measure n={4} label="Is the next person available and authorised">
          <div>
            Available:{" "}
            <YesNo v={exception.next_actor_available} yes="yes, rostered on" no="no, not rostered" unknown="unknown" />
          </div>
          <div>
            Authorised:{" "}
            <YesNo
              v={exception.next_actor_authorised}
              yes="yes, holds the required authorisation"
              no="no — routing there would not close it"
              unknown="unknown"
            />
          </div>
        </Measure>

        <Measure n={5} label="What information is missing">
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {exception.missing_information.map((m, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{m}</li>
            ))}
          </ul>
        </Measure>

        <Measure n={6} label="When delay becomes unsafe">
          {exception.unsafe_at ? (
            exception.past_unsafe ? (
              <span style={{ color: "var(--red)", fontWeight: 650 }}>
                Passed {fmtDuration(Math.abs(exception.hours_to_unsafe ?? 0))} ago ({fmtClock(exception.unsafe_at)})
              </span>
            ) : (
              <span style={{ color: "var(--amber)" }}>
                In {fmtDuration(exception.hours_to_unsafe ?? 0)} ({fmtClock(exception.unsafe_at)})
              </span>
            )
          ) : (
            <span style={{ color: "var(--grey)" }}>
              Not computable while the status is unknown — we do not guess a deadline we cannot evidence
            </span>
          )}
          <div className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)", marginTop: 3 }}>
            {exception.policy_ref}
          </div>
        </Measure>

        <Measure n={7} label="Alternate route that preserves continuity">
          {exception.alternate_route ?? <span style={{ color: "var(--grey)" }}>None defined</span>}
        </Measure>

        <Measure n={8} label="Evidence that proves the loop closed">
          {exception.closure_evidence_required.map((k) => {
            const held = exception.closure_evidence_held.includes(k);
            return (
              <div key={k} style={{ color: held ? "var(--teal)" : "var(--red)" }}>
                {held ? "✓" : "✗"} {EVIDENCE_LABEL[k]}
              </div>
            );
          })}
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 5, fontStyle: "italic" }}>
            {obligation.closure_rule}
          </div>
        </Measure>
      </div>

      <div style={{ padding: "16px 18px 20px" }}>
        <div className="lbl" style={{ color: "var(--teal)" }}>Safest next step</div>
        <div style={{ fontSize: 14, fontWeight: 650, margin: "6px 0 8px" }}>{step.label}</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, margin: "0 0 12px" }}>{step.rationale}</p>

        {!isCall && (
          <div className="panel-2" style={{ padding: 11, marginBottom: 12 }}>
            <div className="lbl" style={{ marginBottom: 6 }}>
              Message to {target ? `${target.name}, ${target.org}` : "recipient"}
            </div>
            {editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={7}
                style={{
                  width: "100%",
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
            ) : (
              <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "var(--text)" }}>{draft}</div>
            )}
          </div>
        )}

        <div
          style={{
            fontSize: 11.5,
            lineHeight: 1.45,
            color: "var(--amber)",
            background: "rgba(242,169,59,0.07)",
            border: "1px solid var(--amber-dim)",
            borderRadius: 7,
            padding: "8px 10px",
            marginBottom: 14,
          }}
        >
          <strong>Clinical boundary.</strong> {step.clinical_boundary}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isCall ? (
            <button className="btn btn-primary" onClick={onCall} disabled={busy || callActive}>
              {callActive ? "Call in progress…" : "📞 Place the follow-up call"}
            </button>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => onApprove(draft)} disabled={busy}>
                ✓ Approve
              </button>
              <button className="btn btn-sm" onClick={() => setEditing((v) => !v)} disabled={busy}>
                {editing ? "Done editing" : "Edit"}
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => onReject("Clinician judged the proposed route inappropriate")}
                disabled={busy}
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
