# Five-hour build and demo boundary

This boundary is fixed. The goal is one complete, honest vertical slice, not a
platform.

## Build sequence

| Elapsed | Deliverable |
|---|---|
| 0:00–0:30 | Preflight live OpenAPI, team world, eligible source result, one supported action, destination readback, and Activity path; capture redacted fixtures |
| 0:30–1:15 | Implement covenant types, reducers, invariants, deterministic traces, and unit tests |
| 1:15–2:00 | Implement Anima read/write/clock adapters, server-only credential handling, version checks, and idempotency |
| 2:00–3:00 | Build the single case workspace, evidence view, approval gate, receipt, and inline failure states |
| 3:00–4:00 | Build bounded patch proposal, side-effect-free operational-latency twin, and calculated baseline/candidate comparison |
| 4:00–4:35 | Complete integration, accessibility, and failure-path tests |
| 4:35–5:00 | Run a live synthetic smoke test, capture a labelled replay fallback, and rehearse the three-minute demo |

If preflight consumes the budget, cut decorative motion, extra evidence detail,
multiple patient choices, then live clock advance. Do not cut:

- a current live source and version;
- one human-approved schema-supported write;
- destination readback and matching Activity evidence;
- the always-owned rule;
- one deterministic identical-trace comparison;
- calculated invariant results;
- honest live/replay labels and fallback behavior.

## Required implementation truth

- The patient qualifies under a visible deterministic rule.
- Anima supplies the abnormal classification.
- Clinical plan fields are locked human/source inputs.
- Each write is attributed, version-checked, separately recoverable, and
  idempotent.
- HTTP success stays **Submitted** until matching readback.
- Missing evidence keeps the pathway open.
- The candidate patch can change only allowed operational fields and stops at
  **Proposed**.

## Three-minute demo

### 0:00–0:25 — Expose the gap

Open the qualifying synthetic result from an existing Anima context. Show the
source classification/version, both teams' visibility, and the ordering team as
current accountable owner.

### 0:25–0:55 — Compile the covenant

Run the Context Assembler and Covenant Compiler. Open one source citation and
version. Show that the clinical plan is locked while operational ownership,
deadlines, and supported payloads are proposed.

### 0:55–1:25 — Write and prove

Approve one safe live simulator action. Show `SUBMITTED`, then destination readback
and matching Activity metadata. Move ownership only if the simulator provides a
real acceptance record.

### 1:25–1:50 — Force the failure branch

Replay the after-hours timeout. The orderer stays accountable, a duty-team fallback
receives one exception, and no patient message or task is duplicated.

### 1:50–2:35 — Test the protocol patch

Show the bounded baseline-to-candidate diff. Replay the same immutable event trace
through both reducers and display calculated accepted-owner latency, manual chases,
duplicate alerts, and invariant results.

### 2:35–2:50 — Show governance

Keep the candidate at **Proposed**. Show its trace denominator, approver roles,
disabled deployment control, and rollback target.

### 2:50–3:00 — Close

Return to the evidence receipt:

> **The model can propose. Deterministic tests prove. Clinicians govern.**

## Fallback rules

- If the preferred patient is ineligible, use another qualifying synthetic patient.
- If ownership acceptance is unavailable, label that portion **Protocol preview**.
- If a live write fails, show the failure; do not fabricate its receipt.
- A recorded fallback must name its world and capture time and remain isolated from
  the live receipt.
- If ADK fails, retain deterministic evidence and manual proposal paths.
- If clock advance fails, leave time and state unchanged.
