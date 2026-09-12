# Care Covenant

Clinical reliability infrastructure for the Anima × OpenAI hackathon.

## Project context

Start with [`docs/context/README.md`](docs/context/README.md). It indexes the
curated hackathon brief, verified simulator capabilities, integration constraints,
Care Covenant safety model, evidence policy, and fixed five-hour build boundary.

The approved design is preserved at
[`docs/superpowers/specs/2026-09-12-care-covenant-design.md`](docs/superpowers/specs/2026-09-12-care-covenant-design.md).

## What this does

An abnormal blood result crosses from a hospital to a GP practice. Results like
this get lost because nobody owns them: the ordering team assumes the receiver
picked it up, the receiver never acknowledged, and no system holds the gap.

Care Covenant makes the handover an explicit, always-owned covenant. A bounded
agent proposes who becomes accountable, by when, and what evidence would prove
it. A human approves. One schema-bound write goes to the Anima simulator. The
outcome is then proven by readback and an audit record — never by an HTTP status
code.

Two guarantees hold throughout:

- **Accountability is never blank.** It stays with the ordering team until
  someone accepts, including when the named receiver turns out to be away.
- **Nothing infers clinical meaning.** A result counts as abnormal only when a
  value falls outside the reference range the source laboratory itself supplied,
  and that rule is displayed verbatim beside the case.

A second surface, the Protocol Lab, replays one immutable failure trace under two
protocol versions. Changing only routing and timing — never clinical meaning — it
computes that the old protocol leaves the result unaccepted for 240 minutes with
one deadline breach and eight fallback exceptions, while the candidate gets a
duty clinician accepting in 25 minutes with none. The candidate stops at
`PROPOSED`; deployment is deliberately disabled.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add a team-scoped simulator API key locally; never use production NHS
   credentials or real patient data.
3. Keep credentials server-side and out of commits, logs, fixtures, screenshots,
   browser bundles, and agent context.
4. Bind actions from the live simulator OpenAPI document before making a write.

```bash
npm install
npm run preflight   # read-only capability + eligibility scan against the simulator
npm run dev         # http://localhost:3000
npm test            # unit, adapter contract and integration suites
npm run typecheck && npm run lint && npm run build
```

`npm run preflight` binds the live OpenAPI document, scans the patient directory
for results outside their source-supplied reference range, and writes redacted
fixtures under `fixtures/`. It performs no write unless you explicitly type
`PROBE` at its prompt.

## Architecture

Ports and adapters around a pure TypeScript domain core.

- `src/domain` — covenant types, ownership and closure reducers, 12 invariants,
  idempotency, the source-range eligibility rule, and the replay twin. No I/O.
- `src/ports` — the external interfaces the domain is written against.
- `src/adapters/anima` — server-only simulator access. Throws if imported into a
  browser bundle, never logs headers, and never translates an HTTP 200 into a
  domain state. `src/adapters/fake` holds deterministic in-memory equivalents
  used only by the test suites.
- `src/agents` — three bounded agents on `@animahealth/adk`. Deterministic steps
  compute every clinical and ownership field in TypeScript; an optional model
  step may only add prose, and a gate discards any model value that differs.
  Human approval is a yielding tool.
- `src/services` — the only place a write happens, and only with a current human
  approval, revalidated source versions, a staff identity and an idempotency key.

Synthetic simulator patients (`SIM-*`) only. Simulator attribution is team-level,
so staff identity is app-side and labelled as such rather than written into the
record as if the simulator had recorded it.
