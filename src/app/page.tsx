"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type OpsPayload, type RailPayload } from "@/lib/api";
import { startCall, type ActiveCall } from "@/lib/voice/client";
import { fmtClock } from "@/lib/engine/clock";
import Rail from "@/components/Rail";
import ExceptionPanel from "@/components/ExceptionPanel";
import Drawer from "@/components/Drawer";
import CallOverlay, { type CallUi } from "@/components/CallOverlay";
import LedgerView from "@/components/LedgerView";
import OpsView from "@/components/OpsView";
import Workplace from "@/components/Workplace";

type View = "rail" | "ledger" | "ops" | "workplace";
type Episode = "amira" | "eleanor";

const EMPTY_CALL: CallUi = {
  status: "idle",
  mode: null,
  lines: [],
  partial: "",
  captured: null,
  redFlags: [],
  error: null,
};

export default function Page() {
  const [data, setData] = useState<RailPayload | null>(null);
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [view, setView] = useState<View>("rail");
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [call, setCall] = useState<CallUi>(EMPTY_CALL);
  const [active, setActive] = useState<ActiveCall | null>(null);

  const refresh = useCallback(async () => {
    const d = await api.rail();
    setData(d);
    setSelected((cur) =>
      cur && d.obligations.some((o) => o.id === cur) ? cur : (d.rail.exceptions[0]?.obligation_id ?? null),
    );
  }, []);

  useEffect(() => {
    void refresh();
    void api.ops().then(setOps);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(t);
  }, [toast]);

  const obligation = useMemo(
    () => data?.obligations.find((o) => o.id === selected) ?? null,
    [data, selected],
  );
  const exception = useMemo(
    () => data?.rail.exceptions.find((e) => e.obligation_id === selected) ?? null,
    [data, selected],
  );

  const withBusy = async (fn: () => Promise<unknown>, msg?: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (msg) setToast(msg);
    } catch (e) {
      setToast(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const advance = (hours: number) =>
    withBusy(async () => {
      const r = (await api.advance(hours)) as { newly_breached: string[] };
      if (r.newly_breached?.length) {
        setSelected(r.newly_breached[0]);
        setToast(`Clock advanced. ${r.newly_breached.length} obligation(s) crossed a policy threshold.`);
      } else {
        setToast("Clock advanced. No new thresholds crossed.");
      }
    });

  const onCall = async () => {
    setCall({ ...EMPTY_CALL, status: "connecting" });
    const c = await startCall({
      onStatus: (status, mode) => setCall((p) => ({ ...p, status, mode: mode ?? p.mode })),
      onLine: (role, text, partial) =>
        setCall((p) =>
          partial
            ? { ...p, partial: text }
            : { ...p, partial: "", lines: [...p.lines, { role, text }] },
        ),
      onCaptured: async (captured, summary, redFlag) => {
        const res = (await api.complete(captured, summary, redFlag)) as { red_flags: string[] };
        setCall((p) => ({ ...p, status: "ended", captured, redFlags: res.red_flags ?? [] }));
        await refresh();
      },
      onError: (msg) => setCall((p) => ({ ...p, error: msg })),
    });
    setActive(c);
  };

  if (!data) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "var(--muted)" }}>
        Building the Recovery Rail…
      </div>
    );
  }

  const p = data.rail.patient;
  const crit = data.rail.exceptions.filter((e) => e.severity === "critical").length;
  const openInbox = data.inbox.filter((i) => !i.acted).length;

  return (
    <div style={{ paddingBottom: drawer ? "44vh" : 56, minHeight: "100vh" }}>
      {/* -------------------------------------------------------------- header */}
      <header style={{ borderBottom: "1px solid var(--line)", background: "var(--bg-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
            <strong style={{ fontSize: 16.5, letterSpacing: "-0.01em" }}>CareClosure</strong>
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>Recovery Rail</span>
          </div>

          <div style={{ display: "flex", gap: 4, padding: 3, background: "var(--panel)", borderRadius: 9, border: "1px solid var(--line)" }}>
            {([
              ["amira", "Amira Khatun", "authored episode"],
              ["eleanor", "Eleanor Chen", "live simulator export"],
            ] as [Episode, string, string][]).map(([k, name, sub]) => (
              <button
                key={k}
                className={`tab${data.episode === k ? " tab-active" : ""}`}
                style={{ textAlign: "left", lineHeight: 1.2, padding: "5px 10px" }}
                disabled={busy || data.episode === k}
                onClick={() =>
                  withBusy(async () => {
                    await api.reset(k);
                    setSelected(null);
                    setCall(EMPTY_CALL);
                    setView("rail");
                  })
                }
              >
                {name}
                <div style={{ fontSize: 9.5, color: "var(--muted-2)", fontWeight: 500 }}>{sub}</div>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 5, marginLeft: 10 }}>
            {(
              [
                ["rail", "Rail"],
                ["ledger", "Task ledger"],
                ["ops", "Ops latency"],
                ["workplace", `Workplaces${openInbox ? ` (${openInbox})` : ""}`],
              ] as [View, string][]
            ).map(([k, label]) => (
              <button key={k} className={`tab${view === k ? " tab-active" : ""}`} onClick={() => setView(k)}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <div style={{ textAlign: "right" }}>
              <div className="lbl">Simulator clock</div>
              <div className="mono" style={{ fontSize: 12.5, color: "var(--amber)" }}>{fmtClock(data.rail.now)}</div>
            </div>
            <button className="btn btn-sm" onClick={() => advance(24)} disabled={busy}>
              Advance 1 day →
            </button>
            <button className="btn btn-sm" onClick={() => advance(4)} disabled={busy}>
              +4h
            </button>
            <button
              className="btn btn-sm"
              onClick={() =>
                withBusy(async () => {
                  await api.reset();
                  setSelected(null);
                  setCall(EMPTY_CALL);
                }, "Demo reset to the starting state.")
              }
              disabled={busy}
            >
              ↺ Reset
            </button>
          </div>
        </div>

        {/* patient banner */}
        <div
          style={{
            display: "flex",
            gap: 22,
            alignItems: "center",
            padding: "10px 20px",
            borderTop: "1px solid var(--line)",
            flexWrap: "wrap",
            fontSize: 12,
          }}
        >
          <div>
            <strong style={{ fontSize: 14 }}>{p.name}</strong>
            <span style={{ color: "var(--muted)" }}>
              {" "}
              · {p.age}
              {p.sex === "Female" ? "F" : "M"} · NHS <span className="mono">{p.nhs_number}</span>
            </span>
          </div>
          <span style={{ color: "var(--muted-2)" }}>
            {data.rail.episode_id} · {data.meta.record_count} records · {data.meta.source_systems} source systems
            {data.meta.not_inferred > 0 && (
              <span style={{ color: "var(--amber)" }}>
                {" "}· {data.meta.not_inferred} simulator workflows report clinical_task_status &ldquo;not_inferred&rdquo;
              </span>
            )}
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {p.flags.map((f) => (
              <span key={f} className="chip" style={{ fontSize: 10 }}>{f}</span>
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 9, alignItems: "center" }}>
            {crit > 0 && <span className="chip chip-critical">{crit} critical</span>}
            <span className="chip">{data.rail.exceptions.length} exceptions</span>
            <span className={`chip ${data.rail.closure_percent === 100 ? "chip-teal" : ""}`}>
              {data.rail.closure_percent}% loop closed
            </span>
          </div>
        </div>
      </header>

      {toast && (
        <div
          style={{
            position: "fixed",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 95,
            background: "var(--panel-2)",
            border: "1px solid var(--teal)",
            color: "var(--text)",
            borderRadius: 9,
            padding: "10px 16px",
            fontSize: 12.5,
            boxShadow: "0 12px 34px -12px #000",
            maxWidth: 620,
          }}
        >
          {toast}
        </div>
      )}

      {/* ---------------------------------------------------------------- body */}
      <main style={{ padding: view === "rail" ? 0 : "16px 20px" }}>
        {view === "rail" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 430px", gap: 16, padding: "0 20px 20px" }}>
            <div style={{ minWidth: 0 }}>
              <div className="panel" style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 940 }}>
                  <Rail rail={data.rail} obligations={data.obligations} selected={selected} onSelect={setSelected} />
                </div>
              </div>
            </div>
            <div style={{ maxHeight: drawer ? "calc(56vh - 150px)" : "calc(100vh - 200px)", position: "sticky", top: 16 }}>
              <ExceptionPanel
                obligation={obligation}
                exception={exception}
                actors={data.actors}
                busy={busy}
                callActive={call.status === "live" || call.status === "ringing" || call.status === "connecting"}
                onApprove={(message) =>
                  withBusy(async () => {
                    const r = (await api.approve(selected!, message)) as { target?: string; lane?: string; error?: string };
                    if (r.error) throw new Error(r.error);
                    setToast(
                      r.target
                        ? `Routed to ${r.target}. Open the ${r.lane} workplace to see it arrive.`
                        : "Approved.",
                    );
                  })
                }
                onReject={(reason) => withBusy(() => api.reject(selected!, reason), "Escalation rejected. Obligation stays open and tracked.")}
                onCall={onCall}
              />
            </div>
          </div>
        )}

        {view === "ledger" && <LedgerView data={data} selected={selected} onSelect={(id) => { setSelected(id); setView("rail"); }} />}
        {view === "ops" && <OpsView ops={ops} />}
        {view === "workplace" && (
          <Workplace
            data={data}
            busy={busy}
            onAct={(id, note, actorId) =>
              withBusy(() => api.act(id, note, actorId), "Action recorded in the receiving workplace. Evidence written back.")
            }
          />
        )}
      </main>

      <CallOverlay
        ui={call}
        patientName={p.name}
        patientPhone={p.phone}
        onHangUp={() => {
          active?.hangUp();
          setCall((c) => ({ ...c, status: "ended" }));
        }}
        onClose={() => {
          setCall(EMPTY_CALL);
          void refresh();
        }}
      />

      <Drawer open={drawer} onToggle={() => setDrawer((v) => !v)} data={data} obligation={obligation} />
    </div>
  );
}
