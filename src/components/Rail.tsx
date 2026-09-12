"use client";

import type { Exception, Handoff, NodeState, Obligation, Rail as RailT, RailNode } from "@/lib/types";

const STATE_WORD: Record<NodeState, string> = {
  closed: "Closed with evidence",
  waiting: "Waiting",
  breached: "Broken",
  unverifiable: "Unable to verify",
};

function nodeCls(s: NodeState) {
  return `node node-${s}`;
}

function NodeBubble({
  node,
  selected,
  onClick,
  openCount,
}: {
  node: RailNode;
  selected: boolean;
  onClick: () => void;
  openCount: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 132, flex: "0 0 auto" }}>
      <button className={`${nodeCls(node.state)}${selected ? " sel" : ""}`} onClick={onClick} title={node.org}>
        <span style={{ fontSize: 15, fontWeight: 750, letterSpacing: "0.01em" }}>{node.label}</span>
        <span style={{ fontSize: 10.5, opacity: 0.9, marginTop: 3, fontWeight: 600 }}>
          {node.state === "closed" && node.total > 0 ? "✓ evidenced" : STATE_WORD[node.state]}
        </span>
        {node.total > 0 && (
          <span style={{ fontSize: 10, opacity: 0.78, marginTop: 4 }}>
            {node.closed}/{node.total} closed
          </span>
        )}
      </button>
      <div style={{ textAlign: "center", minHeight: 46 }}>
        <div style={{ fontSize: 10.5, color: "var(--muted-2)", lineHeight: 1.3 }}>{node.org}</div>
        {openCount > 0 && (
          <div
            style={{
              fontSize: 10.5,
              marginTop: 4,
              fontWeight: 700,
              color: node.state === "breached" ? "var(--red)" : node.state === "unverifiable" ? "var(--grey)" : "var(--amber)",
            }}
          >
            {node.headline}
          </div>
        )}
      </div>
    </div>
  );
}

function Edge({ h, onClick, selected }: { h: Handoff; onClick: () => void; selected: boolean }) {
  const empty = h.obligation_ids.length === 0;
  return (
    <div
      className="edge"
      onClick={empty ? undefined : onClick}
      style={{ cursor: empty ? "default" : "pointer", opacity: selected ? 1 : undefined }}
      title={empty ? "No obligation had to cross this boundary" : h.label}
    >
      <div className={`edge-line edge-${empty ? "unverifiable" : h.state}`} />
      {h.state === "breached" && !empty && <div className="edge-cut" />}
      {!empty && (
        <div className={`edge-badge${h.state === "breached" ? "" : " warn"}`}>
          {h.state === "breached" ? "⚡ " : ""}
          {h.label}
        </div>
      )}
    </div>
  );
}

export default function Rail({
  rail,
  obligations,
  selected,
  onSelect,
}: {
  rail: RailT;
  obligations: Obligation[];
  selected: string | null;
  onSelect: (obligationId: string) => void;
}) {
  const excById = new Map(rail.exceptions.map((e: Exception) => [e.obligation_id, e]));
  const oblById = new Map(obligations.map((o) => [o.id, o]));

  /** Clicking a node or edge selects its worst open obligation. */
  const pick = (ids: string[]) => {
    if (!ids.length) return;
    const withExc = ids.filter((id) => excById.has(id));
    onSelect(withExc[0] ?? ids[0]);
  };

  const selectedIn = (ids: string[]) => !!selected && ids.includes(selected);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "26px 20px 8px",
          gap: 0,
        }}
      >
        {rail.nodes.map((node, i) => (
          <div key={node.lane} style={{ display: "flex", alignItems: "flex-start", flex: i === rail.nodes.length - 1 ? "0 0 auto" : "1 1 0" }}>
            <NodeBubble
              node={node}
              selected={selectedIn(node.obligation_ids)}
              onClick={() => pick(node.obligation_ids)}
              openCount={node.total - node.closed}
            />
            {i < rail.handoffs.length && (
              <Edge
                h={rail.handoffs[i]}
                selected={selectedIn(rail.handoffs[i].obligation_ids)}
                onClick={() => pick(rail.handoffs[i].obligation_ids)}
              />
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 22,
          alignItems: "center",
          padding: "14px 22px 4px",
          borderTop: "1px solid var(--line)",
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        <span className="lbl">Legend</span>
        {(
          [
            ["closed", "Closed with evidence"],
            ["waiting", "Waiting, inside policy"],
            ["breached", "Expected but missing"],
            ["unverifiable", "Not visible to us"],
          ] as [NodeState, string][]
        ).map(([s, label]) => (
          <span key={s} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--muted)" }}>
            <span
              className={`ring-dot`}
              style={{
                width: 11,
                height: 11,
                background:
                  s === "closed" ? "var(--teal)" : s === "waiting" ? "var(--amber)" : s === "breached" ? "var(--red)" : "var(--grey)",
                border: s === "breached" ? "1px dashed #fff4" : undefined,
              }}
            />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted-2)" }}>
          Nodes are organisations · <strong style={{ color: "var(--muted)" }}>edges are handoffs</strong> — a ⚡ break means the obligation never crossed
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, padding: "16px 22px 20px", flexWrap: "wrap" }}>
        {rail.exceptions.map((e) => {
          const o = oblById.get(e.obligation_id);
          if (!o) return null;
          return (
            <button
              key={e.obligation_id}
              onClick={() => onSelect(e.obligation_id)}
              className="panel-2"
              style={{
                textAlign: "left",
                padding: "10px 13px",
                cursor: "pointer",
                maxWidth: 330,
                borderColor: selected === e.obligation_id ? "var(--violet)" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span className={`chip chip-${e.severity}`}>{e.severity}</span>
                <span style={{ fontSize: 10.5, color: "var(--muted-2)" }} className="mono">
                  {o.lane.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>{o.title}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                {e.kinds.map((k) => k.toLowerCase().replace(/_/g, " ")).join(" · ")}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
