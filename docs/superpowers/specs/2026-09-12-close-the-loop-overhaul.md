# Close The Loop — platform overhaul

**Status:** approved 2026-09-12. Supersedes the single-case Care Covenant UI.
**Team 12 brief:** `docs/context/team-12-close-the-loop.md`.

This document is the build policy. Every agent working on this overhaul MUST
read it in full and MUST NOT deviate without recording the deviation.

---

## 1. What we are building

A clinical task governance platform for one simulated NHS neighbourhood.

> Every clinical intention that was written down but never finished, found,
> ranked by who it could hurt, and closed by a named human with an agent doing
> the legwork.

The product answers a working clinician's three questions, in order:

1. **What is on my list, and what is about to hurt someone?** → the worklist
2. **What happened to this patient, and what is unfinished?** → the patient loop
3. **Where does our system lose time?** → operational insights

A fourth surface, the pixel neighbourhood, makes the same truth legible to a
non-clinical audience in ten seconds.

### The core insight

Every resource the simulator returns carries a `provenance` object:

```json
"provenance": {
  "created": { "time": 1789200000000, "actor": { "kind": "simulation", "name": "Synthetic GP history" },
               "action": "generate_history", "source": "gp", "version": 1 },
  "changes": [ { "time": 1789286400000, "actor": { "kind": "team", "name": "team12" },
                 "action": "accept", "source": "gp", "version": 2 } ]
}
```

That is a complete machine-readable record of intent and follow-through.
Therefore **no metric in this product is ever asserted**. Unclosed work, step
latency, and loop breakage are all *computed* from provenance, and every number
is displayed with its denominator and scan window.

---

## 2. Non-negotiable honesty rules

These are the rules that the previous build broke. Breaking them again fails
the deliverable.

1. **No invented data, anywhere.** Every name, age, value, unit, reference
   range, owner, timestamp, site name, and count rendered in the UI MUST trace
   to a field in an API response. No `PATIENT_NAMES` maps. No fallback clinical
   values. No placeholder NHS numbers. No invented site names.
2. **No silent fallbacks.** If a field is absent, render an explicit absence
   state ("not supplied by source"), never a default that looks like data. A
   lookup miss MUST NOT be replaced by a plausible constant.
3. **Site names come from `GET /api/catalogue`.** They are "Riverside Practice",
   "Northbank General", "High Street Pharmacy" — not "St. Jude's".
4. **Counts carry denominators.** "18 unclosed" is forbidden. "18 of 412
   resources scanned across 7 sites" is required.
5. **HTTP 200 is not proof.** A write is `SUBMITTED` until a readback returns a
   matching resource. Only then may domain state advance.
6. **No clinical inference, by code or by model.** The agent never diagnoses,
   triages, chooses urgency, interprets a physiological value as safe or unsafe,
   selects treatment, or infers refusal. Abnormality and priority come from the
   source record only.
7. **Synthetic labelling stays visible.** The world is fictional. Say so.
8. **Secrets stay server-side.** `ANIMA_SIM_API_KEY` and `OPENAI_API_KEY` never
   reach browser code, model prompts, logs, fixtures, or screenshots.

### Robust by design

- Every surface renders usefully when the simulator is unreachable. The API
  returned 502 for ~10 minutes during this spec's authoring; that MUST NOT be a
  demo-ending event. Show last-known data with its capture time, clearly
  labelled stale, plus a retry.
- Partial failure is normal: seven site reads fan out, and some may fail. Render
  what succeeded, name what did not, never block the page.
- No unhandled promise rejection may blank a page. Every route has an error
  boundary that names the failure and preserves navigation.

---

## 3. Verified API surface

Confirmed live against `https://sim.animahacks.com` on 2026-09-12. Auth is
`Authorization: Bearer <team key>`. 79 paths total; the ones we use:

### Read

| Endpoint | Gives us |
|---|---|
| `GET /api/team` | team id, world id, granted scopes |
| `GET /api/catalogue` | real site names/subtitles/colours, adapter list |
| `GET /api/clock` | `now`, `paused`, `speed`, 100 recent events |
| `GET /api/sites/{site}/patients?q=&offset=` | patient directory, **50,000 patients**, page size fixed 30; `q` matches name, ID, condition, need, goal |
| `GET /api/sites/{site}/view?patient=&limit=&offset=` | resources + events + staffing + counters for a site |
| `GET /api/sites/gp/documents`, `/api/sites/hospital/documents` | discharge correspondence with **free-text sections** |
| `GET /api/sites/hospital/attendances`, `/consultations` | attendance and encounter records |
| `GET /api/sites/wearables/readings`, `/devices` | home telemetry |
| `GET /api/sites/{site}/appointments` | appointment day + sessions |
| `GET /api/nhs/gp-connect?patient=` | FHIR-ish `Task` projection |
| `GET /api/nhs/pds/Patient/{id}` | FHIR-ish demographics |
| `GET /api/nhs/ods/Organization` | real organisation records |
| `GET /api/nhs/pathology`, `/radiology`, `/scr`, `/ers`, `/eps-tracker` | results, reports, shared care, referrals, prescription lifecycle |

Sites: `gp`, `hospital`, `community`, `pharmacy`, `diagnostics`, `referrals`,
`wearables` (and `patient` for the patient-facing view).

### Resource shape

Every resource in a site view is:

```ts
{ id, kind, title, status, priority, owner, patientId?,
  createdAt, dueAt?, version, visibleTo[], data{}, provenance{} }
```

Observed `kind` values by site:

- **gp** — `task`, `request`, `message`, `screening`, `mental-health-plan`,
  `capacity`, `ehr-record`, `encounter`, `observation`, `appointment`
- **hospital** — `document`, `discharge-summary`, `prescription`, `referral`,
  `surgery`, `genomic-test`, `theatre-slot`, `bed`, `staff`, `handover`,
  `encounter`, `hospital-attendance`, `genome-record`
- **diagnostics** — `report`
- **referrals** — `referral`, `choice`, `capacity`
- **pharmacy** — `prescription`, `pharmacy-product`, `pharmacy-quote`,
  `pharmacy-referral`, `pharmacy-basket`, `pharmacy-movement`, `robot`
- **community** — `observation`, `device`, `care-plan`, `care-package`
- **wearables** — `device`, `observation`

Observed `status` values: `open`, `accepted`, `reviewed`, `completed`,
`available`, `approved`, `rejected`, `waiting`, `sent`, `filed`, `draft`,
`received`, `active`, `occupied`, `assessing`, `take`, `inpatient`.

**Resource ordering is insertion order, not chronological.** Curated scenario
resources sit at the head (`offset=0`); the bulk middle is historical
`encounter`/`observation` volume; freshly generated live activity sits at the
tail (`offset ≈ total`). Therefore the worklist scans a **head window and a
tail window** per site, and states how many resources it scanned. It MUST NOT
claim to have scanned the whole population.

### Write

`POST /api/sites/{site}/actions` with 43 action types, including
`create_task`, `order_test`, `book_appointment`, `create_referral`,
`send_message`, `save_consultation`, `process_document`, `schedule_visit`,
`draft_prescription`, `review`, `accept`, `complete`, `reject`.

Verified behaviour:

- `clientRequestId` **must be a UUID** matching
  `^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`.
  A raw string returns HTTP 400. `clientRequestIdFrom()` in
  `src/domain/idempotency.ts` already produces a conforming v8 UUID — keep using it.
- Replaying the same `clientRequestId` returns **the same resource at the same
  version** (verified: `r-6738` twice at v1). Idempotency is real.
- The response body **is the created resource including its provenance chain**,
  so the receipt and the proof-by-readback are one call.
- `expectedVersion` provides optimistic concurrency on mutations of existing
  resources.
- **Writes take ~6 seconds.** Every write path needs a genuine pending state.

### Also available, used if time permits

- `GET /cis2/*` — a real OIDC identity provider issuing RS256 tokens for
  fictional named staff with roles. Turns "accountable owner" from a string
  into a named person with a verified role.
- `POST /api/sites/gp/messages` + `GET /api/messaging/reply-presets` — scripted
  patient conversations, which covers the brief's "follow up with patients at
  home about their symptoms".

---

## 4. Surfaces

### 4.1 `/` — Worklist

The landing page. A prioritised queue, **not a patient**.

- **Header strip:** four counters — unclosed tasks, breached deadline, awaiting
  result, unprocessed handovers. Each shows its denominator and the scan window.
- **Queue:** one row per finding: patient name and age, what needs doing, the
  accountable owner, how overdue (relative to simulator `now`), source site
  badge, detector that found it, and one primary action.
- **Ranking:** by breach severity then clinical priority, both source-supplied.
- **Filters:** site, priority, breach state, detector, plus real patient search
  against the 50,000-patient directory.
- **Empty and stale states** are first-class.

A clinician must understand this page without narration. That is the bar.

### 4.2 `/patient/[id]` — The loop

- **Header:** real name, `birthDate` → age, conditions, care goals, needs,
  cross-site local IDs. All from the directory and PDS.
- **The loop timeline:** one chronological spine merging every resource for this
  patient across all seven sites, each entry stamped with site, actor, action,
  and version, derived from `provenance`. This is the brief's "recreate a
  clinical workflow timeline" deliverable.
- **Open and latent work:** real tasks plus detector findings, each citing the
  resource that produced it.
- **Free-text evidence:** the actual discharge-summary sections and notes, with
  extracted task spans highlighted in place and linked to their candidate task.
- **Effectuator drawer:** proposed action, exact JSON payload, source versions,
  idempotency key, approve button → execute → receipt with readback.

Density discipline: the previous case page was too crowded. Default to the
timeline and open work. Everything else is progressive disclosure.

### 4.3 `/insights` — Operational latency

- Step-latency distribution per action type, computed from `provenance.changes`
  deltas, with N stated for every figure.
- Bottleneck ranking: which transition burns the most time.
- Loop breakage: share of handovers never reviewed, tests never acted on,
  referrals never accepted — each a fraction with a visible denominator.
- The existing protocol twin becomes the "what if we changed the protocol"
  panel here, replaying one immutable trace through baseline and candidate
  reducers. It is side-effect-free and MUST NOT touch write ports.

### 4.4 `/town` — The neighbourhood

The immersive lens. Requirements:

- **Real pixel art craft:** committed palette, consistent sprite scale on an
  integer grid, shading and dithering, no flat single-fill shapes. Buildings
  read as buildings with roof, facade, door, and lit windows.
- **The seven real sites** as buildings, named from `/api/catalogue`.
- **Inhabited:** clinician and courier sprites with walk cycles, moving between
  buildings on paths.
- **The paper trail:** each real event from `/api/clock` and each real write
  spawns a visible document sprite that travels from source site to destination
  site. A handover you can watch. This is the signature visual.
- **Agents visibly thinking:** when the agent is working, its sprite shows a
  thinking state; when it proposes, a bubble; when a human approves, the
  document flies.
- **Aging work:** unclosed tasks stack above their owning building and shift
  amber then red as they pass `dueAt`.
- **Click to inspect:** clicking a building opens a drawer of that site's real
  resources and patients; clicking a patient goes to their loop.
- **Day/night** driven by simulator `now`; clock controls advance the world.
- Writes fire live here without an approval gate — this surface is for visuals.
- Honours `prefers-reduced-motion` and has an accessible non-canvas equivalent.

---

## 5. Where intelligence lives

### 5.1 Deterministic detectors — pure, no model, fully tested

Each detector is a pure function over normalised resources plus simulator `now`,
returning findings that cite their source resource IDs and versions.

| Detector | Rule |
|---|---|
| `overdue-task` | `kind=task`, `status` not terminal, `dueAt < now` |
| `awaiting-result` | a test/order resource with no matching `report`/result resource |
| `unprocessed-handover` | `discharge-summary` at `stage=sent` with no `review` or `file` action in `provenance.changes` |
| `unaccepted-referral` | `referral` `status=open` past `dueAt`, never accepted by the receiver |
| `undispensed-prescription` | `prescription` `draft`/`open`, never `dispense`d or `collect`ed |
| `unanswered-request` | patient `request` `status=open` with no responding change |
| `stalled-loop` | any resource whose latest `provenance.changes` entry is older than its `dueAt` |

Detectors MUST NOT assign clinical priority. They surface the
source-supplied `priority` and compute only elapsed time and breach state.

### 5.2 LLM — free text only, strictly bounded

Model reads only free text: discharge-summary `sections.*`, consultation and
note text, `report.data.text`. It emits `ClinicalTaskEpisode` candidates against
a **fixed task-tag bank** (the brief's "map free text into a task tag from a
bank of potential tasks").

Every candidate MUST carry:

- the source resource ID and version it was read from
- the exact quoted span of source text
- a task tag from the fixed bank, never free-invented
- `snomed_id` only if the source supplies one, else `"not-supplied-by-source"`

The model MUST NOT set clinical priority, invent dates not present in the text,
or emit a candidate without a verbatim citation. Candidates are *proposals*;
they are never auto-executed. Use OpenAI structured outputs so the schema is
enforced, not hoped for.

Episode records conform to the brief's `ClinicalTaskEpisode` schema
(`docs/context/team-12-close-the-loop.md`). Fields the source does not supply
are explicitly marked unsupplied rather than fabricated.

### 5.3 Effectuator — propose, approve, execute, prove

1. Map a finding to one of the 43 real action types with a concrete payload.
2. Render the exact payload, the source versions it was built from, and the
   idempotency key.
3. **Clinical surfaces require human approval.** Town does not.
4. Execute via `POST /api/sites/{site}/actions` with a UUID `clientRequestId`.
5. Read the resource back and compare. Advance state only on a match.
6. Hard-stop and disable the control when: patient/destination/identity
   mismatch, source absent or non-current, action unsupported by the live
   schema, required fields missing, unresolved idempotency conflict, proposal
   built from stale versions, or any field would require clinical
   interpretation.

---

## 6. Architecture

```
src/anima/          server-only typed client + readers (pagination, retry, cache)
src/ctl/normalise/  API payloads -> SimResource, SimPatient, SimEvent
src/ctl/detect/     pure detectors -> Finding[]
src/ctl/latency/    pure provenance -> metrics with denominators
src/ctl/extract/    LLM free text -> ClinicalTaskEpisode candidates + citations
src/ctl/effect/     Finding -> ActionProposal -> execute -> readback
src/app/            pages render server-side first paint; routes stay thin
src/components/     per-surface components
src/design/         existing design system, extended
```

Rules:

- The Anima key is read only in `src/anima/`, which is server-only. No client
  component imports it, directly or transitively.
- `src/ctl/detect`, `src/ctl/latency`, `src/ctl/normalise` are **pure**: no
  I/O, no clock reads, no randomness. `now` is always a parameter. This is what
  makes them testable and is non-negotiable.
- Seven-site fan-out goes through a short-TTL in-memory cache keyed on the
  simulator's `now`, invalidated when the clock advances. Reads are parallel and
  individually fault-tolerant.
- Reuse the existing tested domain reducers, task ledger, persistence, and
  protocol twin. The Care Covenant ownership model becomes one detector among
  several rather than the whole product.

### Testing policy

Test what carries risk of silent wrongness, and skip the rest:

- **Required:** every detector, the latency computation, normalisation of real
  fixture payloads, the idempotency key format, and the readback comparison.
  These are pure and cheap to test, and a silent error in them produces a
  confidently wrong clinical claim.
- **Required:** one honesty test per surface asserting the rendered output
  contains no value absent from its input fixture.
- **Not required:** pixel rendering internals, animation timing, styling,
  exhaustive component snapshots.

Fixtures are real captured payloads in `tests/fixtures/live/` (2.9 MB across all
seven sites, captured 2026-09-12). Tests run offline against them. Vitest 5
needs `// @vitest-environment jsdom` as a docblock in any DOM test.

---

## 7. Out of scope

- Real patient data or real messaging. Never.
- Clinical claims about harm, readmission, mortality, cost, or workforce.
- Deploying a protocol patch. Patches stay proposed.
- Operator-only endpoints (`/api/control/*`), which need a separate token.
- Any assertion that this is deployable. It is a synthetic prototype.
