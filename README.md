# CareClosure

**Care failures live at the boundaries between organisations, not inside them.**

CareClosure turns a discharge plan into a live chain of **obligations** across
Hospital → GP → Pharmacy → Community → Home, works out who owns each one, and
surfaces **only the exceptions**: missing owner, unaccepted work, overdue
action, insufficient evidence, and records that exist but cannot be seen by the
service that needs them.

It never recommends treatment. It routes, chases and verifies.

Built for the Anima × OpenAI healthcare hackathon, London, 12 September 2026.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No API key is required. For the live voice call, add one:

```bash
cp .env.example .env.local
# OPENAI_API_KEY=sk-...
```

## The one idea that makes this different

A five-step progress bar can only say *"this task is overdue."*

CareClosure draws **organisations as nodes and handoffs as edges**, because an
obligation that never crossed a boundary is not an organisational failure — it
is a failure of the join between two organisations, and that is where almost
all of the harm actually happens. On the rail those show as a ⚡ break *on the
edge*, with the dwell time attached.

For every clinically significant obligation it computes eight measures:

| # | Measure |
|---|---|
| 1 | Who owns it now |
| 2 | Who must receive it next |
| 3 | How long it has waited, at each boundary |
| 4 | Whether the next person is available **and authorised** |
| 5 | What information is missing |
| 6 | When delay becomes unsafe, under a versioned approved policy |
| 7 | What alternate route preserves continuity |
| 8 | What evidence proves the loop closed |

Two exception kinds are worth calling out because deadline trackers cannot
produce them:

- **Insufficient evidence** — the pharmacy record says *complete*. It holds a
  dispensing record. It does not hold a reconciliation. A completion flag is
  not closure.
- **Cannot be seen by who needs it** — the record exists and *we* can read it,
  but the service accountable for the next decision cannot. That is provable
  from `visible_to`, so it is a breach, not an unknown.

And one kind deliberately does **not** fire an alert:

- **Unable to verify** — when a receiving system will not tell us what
  happened, CareClosure says so and asks the one service that can answer.
  It does not invent a deadline it cannot evidence.

## Two episodes, one engine

Switch between them in the header. Nothing downstream knows the difference.

**Amira Khatun, 68** — authored discharge episode across five unconnected
source systems. Pneumonia, new AF, AKI. A blood culture released *after* she
went home comes back resistant to the antibiotic she was discharged on, to the
inbox of a registrar who has rotated post. Her Discharge Medicines Service
referral was never transmitted, so a community pharmacy dispensed a new
anticoagulant without ever reconciling it against a still-live naproxen
repeat. Her 72-hour follow-up call has no owner, no service and no attempt.

**Eleanor Chen, 83** — **real, unmodified Anima simulator export**
(`data/anima/SIM-000006.json`, schema `anima.patient.timeline.v1`, 98
resources, 500 events, 7 site contexts). She is in AMU bed 1 with reduced
mobility right now. The care plan recording that she has **no carer and no
confirmed home access** is visible only to `community` and `patient` — the
hospital planning her discharge cannot see it. Her GP follow-up was due
yesterday, while she was already admitted, and the practice cannot see the
admission either.

Every one of the 98 workflows in that export reports
`clinical_task_status: "not_inferred"`. The simulator holds the records and
deliberately does not turn them into obligations. **That inference is the
product.**

## The three-minute demo

1. **Open on Amira.** Rail is built from the records. Hospital is solid teal —
   they did send the summary. Then the ⚡ break: *never routed, 26h*.
2. **Click the critical exception.** Right panel: what was expected, what we
   found, the eight measures, and the safest next step. Point at measure 4 —
   *available and authorised* — and at the clinical boundary box.
3. **Advance the simulator one day.** The GP lane crosses its acceptance
   window and the rail visibly degrades. Nothing was hardcoded; the policy
   window did it.
4. **Approve the escalation** (edit the message first if you want to show the
   clinician is in control), then open **Workplaces → Pharmacy**. It is
   sitting in the receiving organisation's own queue. Record the action and
   watch the evidence come back.
5. **Place the follow-up call** on the Home node. Amira's own answers close
   the loop — and confirm three of the exceptions the rail had already found.
   Red flags route to the duty GP. The agent gives no advice.
6. **Safety moment:** the Community node is grey, *Unable to verify*, not red.
   Approve *Request confirmation* and it resolves to a confirmed breach with a
   named owner. No false alert was ever raised.
7. **Switch to Eleanor Chen.** Same engine, real simulator data, nine
   exceptions, top one critical: a woman in a hospital bed whose "no support at
   home" record is invisible to the hospital.
8. **Ops latency tab.** Across 42 discharges, `GP → Pharmacy` is the worst
   boundary. Finish on the **Evidence drawer → Activity trail**: who acted,
   when, with what evidence, append-only.

`↺ Reset` returns to the start. Run `node scripts/shot.mjs` to drive the whole
path in a headless browser as a smoke test.

## The voice call

OpenAI cannot dial a PSTN number on its own — that needs a telephony carrier.
So the call runs as a **real speech-to-speech conversation over WebRTC** using
the OpenAI Realtime API: `POST /v1/realtime/client_secrets` server-side mints a
short-lived token, the browser exchanges SDP at `POST /v1/realtime/calls`, and
audio plus a live transcript stream over the `oai-events` data channel. The
real API key never reaches the browser.

The agent has six structured questions, a `submit_followup` function tool with
a strict schema so the call returns **data and not just audio**, and hard
instructions never to advise, triage or change medication. A deterministic
transcript parser backs up the tool call.

If there is no key, or the network drops, the same button runs the identical
call against a simulated patient using the browser's own speech synthesis. The
UI, the captured answers and the closure evidence are the same either way, so
a dropped call cannot break the pitch.

`src/lib/voice/provider.ts` is the seam if a Twilio number appears later.

## Swapping in more real data

`EhrAdapter` in `src/lib/ehr/adapter.ts` is the only thing that knows where
records come from. `src/lib/ehr/anima.ts` already maps the full
`anima.patient.timeline.v1` schema, using the two fields that carry almost all
of the signal:

- `owner` → which site is accountable → the rail lane
- `visible_to` → who is permitted to read it → provable blindness

To point at the live simulator instead of the export, set
`CARECLOSURE_USE_SIM=1` with `ANIMA_SIM_API_KEY` and fill in the two mapping
functions in `AnimaSimAdapter`.

## How it maps to the 10 Year Health Plan

- **Hospital to community** — integrated discharge and neighbourhood care (pp.41–42, p.33)
- **Analogue to digital** — a shared record becomes an operational workflow, not another document store (pp.47–48)
- **Sickness to prevention** — catches failed follow-up before deterioration
- **p.55** — "scheduling, tracking and managing against the plan", plus workflow escalation

## Layout

```
src/lib/types.ts            domain model
src/lib/engine/policy.ts    versioned approved policy: the ONLY source of "unsafe after"
src/lib/engine/extract.ts   free-text task bank + structured-gap inference
src/lib/engine/obligations.ts  the authored obligation chain
src/lib/engine/exceptions.ts   the eight measures
src/lib/engine/rail.ts      nodes = organisations, edges = handoffs
src/lib/engine/latency.ts   cohort boundary statistics
src/lib/ehr/adapter.ts      the swap seam
src/lib/ehr/amira.ts        authored episode
src/lib/ehr/anima.ts        real Anima simulator mapping
src/lib/voice/              OpenAI Realtime + simulated fallback
src/lib/store/              sim clock, append-only ledger, effectuator
```

All patient data in this repository is synthetic.
