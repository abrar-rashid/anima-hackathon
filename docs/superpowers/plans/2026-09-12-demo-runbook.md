# Care Covenant — three-minute demo runbook

Drive this cold. Do not invent numbers or upgrade a state the screen has not reached. If something is missing, say so.

The live case is synthetic patient `SIM-000001` (on-screen name Amira Khan), result `blood-v1-SIM-000001-crp-5` version 1, C-reactive protein 5.6 mg/L against the source-supplied reference range 0–5. World `team-ea32f6302052`, team `team12`, simulator time `1789286400000`. The Protocol Lab computes, from one immutable trace, that protocol v3 leaves the result unaccepted for 240 minutes with 1 deadline breach and 8 fallback exceptions, while candidate v4 has a duty clinician accepting in 25 minutes with 0 of each.

## Setup

1. From the repo root, copy `.env.example` to `.env.local` if needed. Set `ANIMA_SIM_API_KEY` (team bearer, server-side only). `ANIMA_SIM_BASE_URL` defaults to `https://sim.animahacks.com`. `OPENAI_API_KEY` is optional; the compiler still emits the deterministic proposal without it. Do not put the key in slides, the chat, or screenshots.
2. Leave `COVENANT_FAKE_PORTS` and `COVENANT_RECORDED_REPLAY` unset for the live run.
3. `npm run dev`
4. Open `http://localhost:3000`. The home page redirects to `http://localhost:3000/case/SIM-000001`. The page loads by `POST /api/case/open` (reads only). Wait until the header shows patient id, result id, and a Connection badge of **Live**.
5. Confirm the header source line: C-reactive protein 5.6 mg/L (reference 0–5), above the source range. The rule under the header must be the verbatim text: `An analyte value lies outside the reference range supplied by the source laboratory (referenceLow..referenceHigh). No urgency, diagnosis or treatment is inferred.`

`npm run smoke:live` is the operator rehearsal for the one approved write. It is not a demo click. Do not run it during the three minutes.

## Reset between rehearsals

- **Reload the page** or click **Reload case** to re-open from current simulator reads. That is not a write. It clears the on-screen receipt.
- **Refresh case** only re-reads destination and Activity evidence for the stored case. Use it after Approve if the receipt is still `SUBMITTED`.
- Do not click **Approve covenant actions** twice unless you are showing the idempotency path. A second approve of the same `create_task` should show `DUPLICATE_LINKED` and must not be described as a second task.
- App-side case files live under `.data/` (gitignored). Deleting `.data` resets local case memory. It does not delete a task already written to the simulator.
- Leave the simulator clock alone. Do not advance it. The captured now is `1789286400000`.
- After a successful live write, rehearse beats 0:00–0:55 and 1:25–3:00 freely. Rehearse the write beat by saying you will hit the idempotency path, or by pointing at a labelled replay file from `npm run smoke:live`. Do not send a second distinct task.

## What is live versus computed

Say this distinction out loud when you point.

- **Live (simulator):** the source blood report and version, visibility, existing tasks, clock, the one approved `create_task`, the destination readback, and any Activity/provenance row that comes back.
- **Computed in this app:** the displayed eligibility rule, the compiled covenant (who, by when, which bound action), ownership and closure reducers, and every Protocol Lab number. The twin does not call the simulator and does not move the live clock. It replays `fixtures/traces/after-hours-timeout.json` (30 events, denominator 1) under v3 and the v3→v4 patch.

Staff names in the dropdown are app-side. The simulator attributes writes to the team. The select label says so: `App-side staff attribution (simulator records team-level actor)`.

---

## 0:00–0:25 — Expose the gap

**Clicks.** Land on `/case/SIM-000001`. Do not click Approve. Point at the sticky header, then the Evidence panel, then the Covenant graph.

**Point at.**

- Patient `SIM-000001`, result `blood-v1-SIM-000001-crp-5` `v1`.
- Source classification: C-reactive protein 5.6 against 0–5.
- Visible to: `gp, hospital, diagnostics` (Evidence panel).
- Header and graph line: `Current accountable owner:` — it should read `hospital`. Hospital is the ordering team because a discharge summary is present. GP can see the result.

**Say.** Visibility is not acceptance. Both settings can see the same source row; the ordering team is still accountable. Use the words **Current accountable owner: ordering team**. Connection is **Live**; this row is a current simulator record, not a fixture painted on the page.

## 0:25–0:55 — Compile a covenant

**Clicks.** Stay on the same page. The Context Assembler and Covenant Compiler already ran during open. Open one citation in Evidence → Returned records (click the source row if you want the graph node detail). In **Proposed covenant**, leave clinical rows untouched. Open **Technical details**.

**Point at.**

- Proposed transfer: current owner `hospital`, next owner `gp`, acknowledgement deadline (from protocol v3, 120 minutes after simulator now).
- Action `create_task → gp` and the JSON payload (`type: create_task`, title `Acknowledge abnormal-result handover`, patient `SIM-000001`).
- Clinical rows `review`, `plan`, `urgency` with disabled buttons **Clinician decision required**.
- Technical details: case id `case-SIM-000001-blood-v1-SIM-000001-crp-5`, result `v1`.

**Say.** The agent proposed who becomes accountable, by when, and what bound action would start that handover. It has not written. Clinical meaning stays locked. Protocol is v3.

If `accept` is listed and labelled `live`, that is because a prior probe write confirmed the accept handshake (task `r-2` moved `open` v1 to `accepted` v2). Uncheck **Include accept** so the next click sends one action only.

## 0:55–1:25 — Write and prove

**Clicks.**

1. Confirm only `create_task` is included.
2. Staff select: `Dr Ada Sim · Duty GP · gp`.
3. Click **Approve covenant actions**.
4. If the receipt stays on `SUBMITTED`, click **Refresh case** once.

**Point at.** The Proposal pane is replaced by **Receipt**. The chain is `SUBMITTED` → `VISIBLE_DOWNSTREAM` → `ACCEPTED` → `EVIDENCED`. Only light the steps the receipt has actually reached. Open **Technical details** for any Activity id. Header `Current accountable owner` should still be `hospital` unless a real acceptance record exists for this handover.

**Say.**

- An HTTP 200 is `SUBMITTED` only.
- `VISIBLE_DOWNSTREAM` means the destination view returned the matching task.
- `EVIDENCED` means a matching Activity or provenance record was returned.
- If Activity is missing, the screen says so (`Activity evidence unavailable` / hard stop). Do not say the write is evidenced.
- A created task is not acceptance. Ownership moves only if an acceptance record exists. For this `create_task` it should not.

If Approve fails, read the alert (`The approve request did not succeed. No completion is claimed.`). Do not narrate a receipt you do not have. Switch to the fallback section.

## 1:25–1:50 — Force the failure branch

**Clicks.** Scroll to **Protocol Lab**. Click **Test patch**. Wait until **Failed trace** and **simulator regression evidence** appear. This is a local replay of one captured trace. It is not a live clock advance and not a second simulator write.

**Point at.** Failed trace name `after-hours-timeout`. Failure hypothesis: `After-hours named-person transfer timed out; the ordering team stayed accountable without a duty-team fallback.` Baseline track **Baseline v3**.

**Say.** Under v3 the named GP is away. The ordering team remains accountable. The computed baseline is 240 minutes unaccepted, 1 deadline breach, 8 fallback exceptions. The trace has one later patient message, not a duplicate. Duty-team cover is what v3 does not do.

## 1:50–2:35 — Operational-latency twin

**Clicks.** You already pressed **Test patch**. Stay on the evidence block labelled **simulator regression evidence**.

**Point at.**

- Line: `Same immutable trace replayed under both protocols.`
- Changed protocol fields only: `receiverMode`, `ackDeadlineMinutes`, `fallbackTeamId`, `exceptionRoute`, `dedupeWindowMinutes`. No clinical field is in that table.
- Side-by-side tracks and the Comparison metrics table (those cells are deltas, candidate minus baseline, computed at runtime).
- Invariant list (text plus icon).
- Denominator: `traces: 1, events: 30`.

**Say.** Same 30-event trace. v3: unaccepted 240 minutes, 1 deadline breach, 8 fallback exceptions. v4: duty clinician accepts in 25 minutes, 0 breaches, 0 exceptions. These values are computed from the replay, not typed into the page. This is `simulator regression evidence` with a denominator of one. It is not a clinical outcome.

## 2:35–2:50 — Governance

**Clicks.** Stay in Protocol Lab. Do not enable anything. The **Approve** and **Deploy** buttons in Governance are disabled.

**Point at.** Candidate badge `PROPOSED`. Denominator `traces: 1, events: 30`. Verbatim disabled-control text: `Production activation requires named clinical and operational approvers, controlled rollout and a rollback target.` Rollback target: `v3`.

**Say.** The candidate stops at `PROPOSED`. Named clinical and operational approval, controlled rollout and a rollback target are required for activation. This build does not deploy.

## 2:50–3:00 — Close

**Clicks.** Scroll back to the Receipt (or header if you never approved).

**Point at.** The receipt chain and `Current accountable owner`.

**Say, verbatim.**

> The model can propose. Deterministic tests prove. Clinicians govern.

---

## Fallback switches

Announce the switch on stage. Never pass a fallback off as a live write. The instruction is no fakery.

### Simulator is slow or down after the page has already loaded

- Do not click **Approve covenant actions**.
- Protocol Lab **Test patch** still runs; it uses the local trace. You can finish 1:25–2:50.
- For the write beat, say the live write is unavailable and either stop or show a labelled replay file (below).

### Recorded replay (preferred fallback)

Stop the dev server. Restart with:

```bash
COVENANT_RECORDED_REPLAY=1 npm run dev
```

Open `http://localhost:3000/case/SIM-000001` again. The Connection badge must read **Recorded simulator replay** plus world id plus capture time (from the preflight metadata; world `team-ea32f6302052`). That label is mandatory. Say: this is a recorded simulator replay, not a live mutation happening now.

The shipped env var is `COVENANT_RECORDED_REPLAY`. (An earlier plan note said `COVENANT_REPLAY`; that name is not what the app reads.)

If `npm run smoke:live` has already been approved once, also point at `fixtures/replay/<world>-<timestamp>.json`. That file is `{ label: 'Recorded simulator replay', world, capturedAt, case, receipts }`. If `label`, `world` or `capturedAt` is missing, do not use it as replay evidence.

### Local-only fake ports

```bash
COVENANT_FAKE_PORTS=1 npm run dev
```

This is an in-process fake, not the simulator and not a labelled replay. The Connection badge is not **Live** and is not **Recorded simulator replay**. Say: local fake ports, not live. Use only if replay mode is also unavailable.

### Live write fails

Show the failure. Do not fabricate `VISIBLE_DOWNSTREAM` or `EVIDENCED`. Do not click through a second unapproved action to “make it look complete.”

### Preferred patient missing

Only if open fails for `SIM-000001`, say so and stop or use another `SIM-*` patient that the app actually loaded. Do not type a result the header does not show.

---

## Honesty

This build proves one human-approved, schema-bound write against a synthetic simulator, plus one replayed operational trace with a denominator of one. It does not establish clinical outcomes, effectiveness, or deployability.

It does not classify disease, choose urgency, record a clinical plan, message a real patient, or activate a protocol. Abnormality is the source range rule above, nothing the model inferred.

Simulator attribution is team-level. Staff identity is app-side and labelled as such. The accept handshake is live: a probe write confirmed it (task `r-2` moved `open` v1 to `accepted` v2). That probe is not this demo’s `create_task`.

HTTP 200 is not completion. Missing Activity evidence is a hard stop, not a pass.
