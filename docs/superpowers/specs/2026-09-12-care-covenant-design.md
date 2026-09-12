# Care Covenant Design Specification

**Status:** Approved design
**Date:** 2026-09-12
**Build boundary:** One five-hour hackathon slice; no production clinical deployment

## 1. Product thesis

Care Covenant is an Anima-native reliability layer for one abnormal-result pathway.
It keeps the pathway open until responsibility has been explicitly accepted, the
clinician-recorded plan has been communicated and initiated, and current records
provide evidence of the outcome.

The product does not compete with Anima's existing result detection, task creation,
routing, messaging or booking. It adds three missing guarantees:

1. **Ownership is transactional.** Visibility or a sent task does not transfer
   responsibility. The ordering team remains accountable until a named actor in an
   accountable receiving team accepts.
2. **Closure is evidence-backed.** A successful request is only `SUBMITTED`.
   Acceptance, patient contact, action and outcome each require their own returned
   record.
3. **Operational improvement is testable.** A failed synthetic pathway can produce
   a bounded, versioned protocol patch. A deterministic operational-latency twin
   replays the same event trace against the old and candidate protocols before a
   human may approve the candidate.

The signature line is:

> **An alert finds a result. A covenant proves someone owned what happened next.**

## 2. User, problem and product-market-fit hypothesis

### Primary user

The primary user is the clinician or care-operations lead responsible for an
abnormal-result workflow in an existing Anima Documents, Tasks or Collaboration
surface. They can review source records, accept or decline an operational handoff,
approve supported follow-up actions and inspect evidence. Clinical review remains
with an authorised clinician.

The hackathon presenter may act as both sending and receiving synthetic staff
identities, but the audit must show which role performed each event.

### Problem

Current systems can make the same result visible to several teams and can create
tasks in each system. That can still leave three dangerous ambiguities:

- the receiver has not accepted responsibility;
- a sent message or task is mistaken for completed care;
- repeated delays create more alerts rather than a governed change to the
  operational protocol.

The orderer normally remains accountable until delegation is accepted. Care
Covenant must never display an ownership vacuum.

### Product-market-fit hypothesis

Care Covenant is an extension to the workflow where teams already process results,
not a new inbox. Its first buyer hypothesis is an organisation or neighbourhood
already using Anima across result/document workflows and accountable for
cross-team pathway reliability. The value proposition is operational and
measurable:

- shorter time from result availability to accepted owner;
- fewer manual chases and duplicate tasks;
- fewer closures without patient-contact or action evidence;
- inspectable protocol changes with approval and rollback.

The prototype does not establish fewer adverse events, readmissions, deaths or
cash-releasing savings. Those require a controlled local evaluation. The DMS impact
research supports the broader need for cross-boundary acknowledgement and
evidence, but it also shows why a practice-level ROI or lives-saved claim would be
indefensible.

## 3. The five-hour vertical slice

The slice covers one synthetic patient and one source-classified abnormal result
that becomes available after a care transition. The preferred hero patient is
Amira Khan (`SIM-000001`) only if the live team world contains a qualifying result.
The implementation must preflight the live world and use a different synthetic
patient if Amira does not qualify; it must not fabricate a result or classification.

The transparent eligibility rule is:

> source result is current and classified abnormal by the source or an approved
> simulator rule; follow-up is required; no complete, evidence-backed pathway
> already exists.

The interface displays the rule and the exact selected result ID and version.
Patient selection is deterministic demo control, not an AI ranking feature.

### Vertical-slice sequence

1. Read the current result, its source classification and version, ordering team,
   requested receiver, existing tasks/actions and current simulator time.
2. Show that both teams may see the result while the ordering team remains the
   accountable owner.
3. Compile a fixed operational covenant. Clinical interpretation and the
   clinician-recorded plan are locked inputs.
4. Request transfer to the receiving team. Transfer occurs only on an explicit,
   attributed acceptance record.
5. After human approval, execute at least one action supported by the live Anima
   OpenAPI contract.
6. Re-read the destination and Activity records. Advance state only from returned
   evidence.
7. Demonstrate one timeout or failed-contact trace in which the original owner
   remains accountable and one fallback exception is created.
8. Produce one candidate operational patch and replay the same trace under baseline
   and candidate protocol versions in the operational-latency twin.
9. Display the measured comparison, safety invariants and an approval gate. Do not
   deploy the candidate.

### Live proof threshold

The live demo is valid only if it shows all of:

- one current Anima source record;
- one human-approved, schema-supported simulator write;
- one destination or shared-record readback caused by that write;
- one matching Activity/audit record with actor, time and version;
- one honest open state when required evidence is absent.

If an explicit ownership-acceptance action is unavailable in the live schema, the
handshake is labelled **Protocol preview** and must not claim a live transfer. The
live write/readback then uses another supported operational action in the same
pathway. A previously captured readback may be shown only as **Recorded simulator
replay**, with world ID and capture time.

## 4. Architecture

Care Covenant uses ports and adapters around a deterministic domain core:

```text
Existing Anima surface
        |
        v
Case Workspace ----> Covenant Reducer <---- Protocol Definition
        |                    |
        |                    +----> Invariant Engine
        v
Human Approval ----> Execution Service ----> Anima Write Port
        ^                                      |
        |                                      v
Three ADK agents <---- Anima Read Port <---- live readback/Activity
        |
        v
Patch Proposal ----> Operational-Latency Twin ----> Comparison + approval gate
```

The agents return structured proposals. They do not mutate the simulator. Only the
execution service can call a write port, and it requires a current human approval,
current source versions and an idempotency key. The reducer alone changes case
state. The twin is side-effect-free and cannot call the live write port.

### Core domain objects

`CovenantCase`

- `caseId`
- `patientId`
- `sourceResultId`
- `sourceResultVersion`
- `sourceClassification`
- `orderingTeamId`
- `currentAccountableOwner`
- `requestedReceiver`
- `acceptingActor`
- `protocolVersion`
- `ownershipState`
- `closureState`
- `deadlines`
- `evidenceRefs`
- `eventLog`

`ProtocolVersion`

- `id`
- `supersedes`
- `receiverMode`: `NAMED_ACTOR` or `ACCOUNTABLE_TEAM`
- `ackDeadlineMinutes`
- `fallbackTeamId`
- `exceptionRoute`
- `dedupeWindowMinutes`
- immutable clinical-policy references
- approval and rollback metadata

`EvidenceRef`

- `site`
- `resourceId`
- `resourceVersion`
- `observedAtSimulatorTime`
- `activityId`
- `eventType`

## 5. Three bounded ADK agents

The agents are backend responsibilities, not visible characters. Each invocation
has a typed input and output, a maximum purpose, and an explicit prohibition.

### 5.1 Context Assembler

**Purpose:** Build a cited snapshot of the current pathway.

**Reads:** source result, source classification/version, orderer, receiver, existing
tasks/actions, destination visibility, simulator clock and Activity.

**Returns:** current records, conflicts, missing evidence and citations.

**Cannot:** write, infer abnormality, select treatment, set ownership, set deadlines
or declare closure.

### 5.2 Covenant Compiler

**Purpose:** Map the cited snapshot and fixed protocol version into an operational
covenant and supported action proposals.

**Returns:** proposed transfer, fixed deadlines and escalation route, supported
payload previews, prohibited-action flags and the source for every populated field.

**Cannot:** invent missing clinical fields, alter clinical classification or plan,
approve its own proposal, call an external write API or mark an action complete.

### 5.3 Reliability Analyst

**Purpose:** Explain one failed synthetic trace and propose the smallest patch from
the allowed operational patch grammar.

The five-hour patch grammar permits changes only to:

- receiver mode;
- acknowledgement deadline;
- fallback team;
- exception route;
- duplicate-suppression window.

**Returns:** one protocol diff, trace references, denominator, failure hypothesis
and requested twin run.

**Cannot:** alter diagnosis, abnormality thresholds, urgency, treatment,
patient-message clinical content, closure evidence rules, invariants, approval
requirements or production state.

The candidate shown in the hero demo changes an after-hours named-person transfer
to an accountable GP duty team, requires named acceptance within 30 simulator
minutes, retains the ordering team until acceptance, and emits one deduplicated
exception to the duty clinician on timeout.

## 6. External API ports

All external interactions sit behind these logical ports. Concrete endpoint and
action names are bound from the live OpenAPI document during preflight.

```ts
interface AnimaReadPort {
  getTeam(): Promise<TeamContext>
  getClock(): Promise<SimulatorClock>
  getOpenApi(): Promise<OpenAPIDocument>
  getCurrentResult(patientId: string): Promise<VersionedResult | null>
  getSiteRecords(
    site: SiteId,
    patientId: string,
    cursor?: string,
  ): Promise<Page<VersionedRecord>>
  getActivity(caseId: string): Promise<ActivityEntry[]>
}

interface AnimaWritePort {
  executeApprovedAction(input: {
    site: SiteId
    actionName: string
    payload: unknown
    staffIdentity: StaffIdentity
    expectedSourceVersions: ResourceVersion[]
    idempotencyKey: string
  }): Promise<SubmissionReceipt>
}

interface SimulatorClockPort {
  read(): Promise<SimulatorClock>
  advanceApproved(minutes: 10 | 30 | 90): Promise<ClockReceipt>
}

interface AdkRuntimePort {
  run<TInput, TOutput>(
    agent: "context-assembler" | "covenant-compiler" | "reliability-analyst",
    input: TInput,
  ): Promise<TOutput>
}
```

Known Anima routes used for adapter discovery and binding are:

- `GET /openapi.json`
- `GET /api/team`
- `GET /api/clock`
- `GET /api/sites/{site}/view`
- `GET /api/sites/{site}/appointments`
- `GET /api/sites/gp/documents`
- `GET /api/sites/hospital/documents`
- `GET /api/sites/hospital/attendances`
- `POST /api/sites/{site}/actions`
- `POST /api/clock`

The team bearer key remains server-side. Staff identity is mandatory on writes.
The adapter stores resource IDs, versions, simulator timestamps and Activity IDs;
it does not translate HTTP success into domain completion.

The write idempotency basis is:

```text
team + patient + result-id + result-version + protocol-version + action-kind + destination
```

Retries reuse the same key.

## 7. Operational-latency twin

The twin is a deterministic, side-effect-free replay engine for operational
protocols. It is not a patient digital twin and makes no clinical prediction.

### Inputs

- one immutable, timestamped synthetic event trace;
- one baseline protocol version;
- one candidate protocol version;
- the same source classification and clinician-recorded plan for both runs;
- the invariant suite.

### Replay rules

The twin feeds the identical ordered events into both protocol reducers. The
candidate may change only the allowed operational patch fields. Model output is not
used during replay. No live Anima state is mutated.

### Outputs

The comparison contains values calculated from replay events:

- accepted-owner latency;
- minutes while the orderer remains accountable without an accepted receiver;
- time to clinical review;
- time to successful patient contact;
- time to action and outcome evidence;
- manual chases;
- duplicate alerts/tasks;
- timeout and reopen count;
- all invariant results.

Exact values must be derived at runtime and never hard-coded into the presentation.
The report is labelled **simulator regression evidence**, not clinical causal
evidence.

### Candidate lifecycle

`DRAFT → TESTING → FAILED_INVARIANTS | PASSED → PROPOSED`

The five-hour slice stops at `PROPOSED`. Approval and deployment controls are
visible but disabled with the explanation:

> Production activation requires named clinical and operational approvers,
> controlled rollout and a rollback target.

## 8. Interface

Care Covenant appears as a focused case workspace launched from an existing Anima
result/document/task context. There is no population dashboard.

### 8.1 Case header

Shows:

- synthetic patient name and ID;
- source result ID, source classification and version;
- ordering team;
- current accountable owner;
- requested receiver and accepting actor;
- simulator time and connection state;
- protocol version.

### 8.2 Covenant graph

The primary visual is two linked, text-labelled tracks:

```text
Ownership: Orderer owns → Transfer requested → Accepted owner
Care:      Result available → Reviewed → Plan recorded → Patient informed
           → Action started → Outcome evidenced → Closed
```

Colour supplements text and icons. The current owner is always visible. Selecting a
node opens the source record, version, actor and event that established it.

### 8.3 Evidence and action pane

The left side shows exact source excerpts and returned records. The right side shows
one covenant proposal with:

- action and destination;
- current versus next owner;
- acknowledgement and action deadlines with policy source;
- exact payload preview;
- expected readback;
- included source versions;
- idempotency status;
- hard-stop reasons.

The primary action is **Approve covenant actions**. Clinical rows are locked and
labelled **Clinician decision required**.

### 8.4 Receipt and exception state

After approval, the same layout becomes a receipt. It distinguishes:

`SUBMITTED → VISIBLE_DOWNSTREAM → ACCEPTED → EVIDENCED`

Timeout, decline, failed contact, stale source and missing evidence are shown inline
with the current owner and next safe action. Exceptions are written back to the
configured Anima/EHR task surface; Care Covenant does not create an inbox.

### 8.5 Protocol Lab

The final demo panel shows:

- the failed trace and failure hypothesis;
- a compact baseline-to-candidate diff;
- side-by-side state graphs using the same event trace;
- measured latency and balancing metrics;
- invariant results;
- evidence denominator;
- disabled approval/deployment gate and rollback target.

No agent avatar, chat transcript or chain-of-thought is shown. A technical-details
drawer may show tool stages, payloads, IDs, versions and Activity links.

## 9. State and event model

### Ownership state

```text
ORDERER_OWNS
  → TRANSFER_REQUESTED
  → ACCEPTED
```

Branches:

- `TRANSFER_REQUESTED → DECLINED`, with orderer still accountable;
- `TRANSFER_REQUESTED → OVERDUE`, with orderer still accountable and fallback
  exception emitted;
- any active state may emit `OWNER_UNAVAILABLE`, invoking team cover without
  deleting the accountable team;
- a newer source version emits `STALE` and blocks pending writes.

### Care-closure state

```text
RESULT_AVAILABLE
  → CLINICALLY_REVIEWED
  → PLAN_RECORDED
  → PATIENT_INFORMED
  → ACTION_STARTED
  → OUTCOME_EVIDENCED
  → CLOSED
```

Branches are `PATIENT_UNREACHED`, `ACTION_NOT_BOOKED`, `ACTION_MISSED`,
`PLAN_CHANGED`, `EVIDENCE_LATE` and `REOPENED`.

### Domain events

- `ResultAvailable`
- `ClinicalReviewRecorded`
- `PlanRecorded`
- `TransferRequested`
- `TransferAccepted`
- `TransferDeclined`
- `TransferTimedOut`
- `FallbackNotified`
- `PatientMessageSubmitted`
- `PatientContactEvidenced`
- `ActionSubmitted`
- `ActionVisibleDownstream`
- `OutcomeEvidenced`
- `SourceVersionChanged`
- `CaseReopened`
- `ProtocolPatchProposed`
- `TwinRunCompleted`

Every event includes `caseId`, `eventId`, actor or source system, simulator time,
source resource/version and Activity ID when available. Reducers reject events that
move state backwards, skip required evidence or refer to a stale version.

`CLOSED` is legal only when all mandatory closure events exist for the current
source and protocol versions. A changed source reopens only affected steps and
preserves unrelated valid evidence.

## 10. Failure handling

| Failure | Required behaviour |
|---|---|
| Source or destination read fails | Preserve last evidence with observed time; make no new state claim; retry that port only |
| Result is absent or not source-classified | Mark case ineligible; do not infer abnormality |
| Source version changes during review | Mark proposal stale, disable approval and rebuild from the new version |
| Unsupported simulator action | Remove execute control and label **Protocol preview** |
| Staff identity is absent | Disable all writes |
| Write times out or returns 5xx | Keep state pre-submission unless a readback finds the idempotent result; retry with the same key |
| Duplicate/idempotency conflict | Link the original receipt and do not create another action |
| One action in a bundle fails | Preserve successful rows; retry only the failed row |
| Receiver declines or times out | Ordering team remains accountable; emit one coded fallback exception |
| Patient message is not delivered | `PATIENT_UNREACHED`; never claim informed |
| Downstream action is missing | Keep the case open; do not infer non-adherence |
| Activity evidence is unavailable | Show the operational record but block final closure/audit claim |
| ADK runtime is unavailable | Keep deterministic state, evidence browser, manual proposal fields and live approved-action path usable |
| Clock advance fails | Keep time and all states unchanged |
| Twin invariant fails | Candidate becomes `FAILED_INVARIANTS`; approval remains disabled |
| Recorded replay is used | Label replay, world ID and capture time; never mix replay evidence into a live receipt |

## 11. Safety and governance

### Non-negotiable safety invariants

1. Source or an approved rule supplies abnormality; the model does not.
2. The ordering team remains accountable until explicit acceptance.
3. An accepted owner is a named actor within an accountable team.
4. Clinical review is human and evidenced.
5. Diagnosis, urgency, thresholds and treatment are unchanged by agents and patches.
6. Patient contact is not claimed without delivery/contact evidence.
7. Closure is impossible without review, plan, communication, action and outcome
   evidence required by the current protocol.
8. Successful actions are not duplicated.
9. Unavailable actors invoke team cover without producing a blank owner.
10. Candidate protocols may not worsen manual touches, duplicates or alert burden
    beyond the baseline trace.
11. Version conflict reopens only affected steps.
12. Protocol activation requires named human approval and a rollback target.

### Human gates

- A user reviews every external write.
- An authorised clinician supplies or confirms the clinical plan.
- Current source versions are revalidated immediately before execution.
- The Reliability Analyst may propose but never approve or deploy a patch.
- Real deployment would require clinical safety review, information governance,
  identity and delegation agreements, interoperability validation, accessibility
  assessment, controlled rollout and post-deployment monitoring.

### Claims policy

Allowed: operational latency, acceptance, manual-touch, duplicate, evidence and
reopen measures from labelled simulator traces.

Prohibited: claims that the prototype prevents harm, saves lives, improves clinical
outcomes, proves national deployability or learns the best clinical care.

## 12. Five-hour build scope

The implementation plan must fit this fixed sequence:

| Elapsed time | Deliverable |
|---|---|
| 0:00–0:30 | Preflight live OpenAPI, team world, eligible source result, one supported action, readback and Activity path; capture redacted fixtures |
| 0:30–1:15 | Implement covenant types, reducers, invariants and deterministic trace fixtures with unit tests |
| 1:15–2:00 | Implement Anima read/write/clock adapters, server-side credentials, version checks and idempotent execution |
| 2:00–3:00 | Build the single case workspace, approval gate, live receipt and inline failure states |
| 3:00–4:00 | Build the bounded Reliability Analyst output, operational-latency twin and baseline/candidate comparison |
| 4:00–4:35 | Complete integration, accessibility and failure-path tests |
| 4:35–5:00 | Run live smoke test, capture labelled replay fallback and rehearse the three-minute demo |

Scope is cut in this order if preflight consumes the budget:

1. decorative motion;
2. extra evidence detail;
3. multiple eligible-patient choices;
4. live clock advance.

The live input/write/readback, ownership rule, deterministic twin, invariant report
and honest fallback may not be cut.

## 13. Test strategy

### Unit tests

- ownership never becomes blank;
- transfer does not occur on visibility or submission;
- decline/timeout leaves the orderer accountable;
- closure rejects missing review, contact, action or outcome evidence;
- stale versions reject writes and reopen only affected steps;
- identical idempotency input produces an identical key;
- duplicate events do not duplicate state or alerts;
- patch grammar rejects clinical fields;
- baseline and candidate replay the same input events;
- candidate cannot pass when any invariant fails.

### Adapter contract tests

- validate the captured OpenAPI operation and payload used by the live action;
- redact bearer keys and clinical free text from fixtures/logs;
- map returned IDs, versions, actors, simulator time and Activity IDs;
- treat HTTP success as `SUBMITTED`;
- recover an uncertain write by readback before retrying;
- paginate site records rather than assuming the first page is complete.

### Integration tests with fake ports

- source read → compile → human approve → write → readback → evidenced receipt;
- timeout → original owner retained → one fallback exception;
- partial bundle failure → successful evidence preserved;
- ADK failure → deterministic manual path remains usable;
- replay mode cannot contaminate a live receipt.

### End-to-end tests

1. Eligible result opens with source/version and ordering owner.
2. Human approval executes exactly one schema-supported synthetic write.
3. Destination readback advances only the matching state.
4. Technical details link the matching Activity entry.
5. Failed trace produces one allowed patch.
6. Twin comparison is calculated from the same trace and ends at `PROPOSED`.

### Accessibility checks

- full keyboard path through evidence, approval and Protocol Lab;
- visible focus;
- text and icon for every state;
- WCAG 2.2 AA contrast;
- live-region announcements for submission/readback changes;
- usable layout at 200% zoom;
- reduced motion without loss of information.

The final verification command set must include unit, integration, typecheck,
lint and production build commands defined by the chosen scaffold, plus a live
synthetic smoke script that performs only the approved test-world mutation.

## 14. Three-minute demo

### 0:00–0:25 — Expose the gap

Open the eligible synthetic result from the existing Anima context. Show source
classification/version, both teams' visibility and:

> **Current accountable owner: ordering team**

Explain that visibility is not acceptance.

### 0:25–0:55 — Compile a covenant

Run the Context Assembler and Covenant Compiler. Open one source citation and one
version. The clinical plan remains locked; operational ownership, deadlines and
supported actions are proposed.

### 0:55–1:25 — Write and prove

Approve the safe simulator action. Show the request as `SUBMITTED`, then show its
destination readback and Activity entry. Move ownership only if an actual
acceptance record exists.

### 1:25–1:50 — Force the failure branch

Replay the after-hours timeout. Show that the ordering team remains accountable,
the duty team receives one exception, and no duplicate patient message is created.

### 1:50–2:35 — Operational-latency twin

The Reliability Analyst proposes the bounded v3-to-v4 operational diff. Select
**Test patch**. Replay the same event trace under both versions and show calculated
accepted-owner latency, manual chases, duplicate alerts and invariant results.

### 2:35–2:50 — Governance

Show the candidate as `PROPOSED`, its trace denominator, named approver roles,
disabled deployment control and rollback target.

### 2:50–3:00 — Close

Return to the case receipt:

> **The model can propose. Deterministic tests prove. Clinicians govern.**

## 15. Explicit non-goals

The five-hour slice does not build or claim:

- abnormal-result detection or clinical classification;
- diagnosis, triage, urgency selection, treatment or medicines decisions;
- autonomous clinical review or autonomous external writes;
- automatic protocol approval or deployment;
- a generic workflow builder or multi-pathway platform;
- a population dashboard, analytics suite or new clinical inbox;
- a chatbot, visible agent personas, chain-of-thought or voice interface;
- real patient messaging or use of real patient data;
- arbitrary simulator action support;
- production authentication, tenancy or NHS identity integration;
- a clinical patient digital twin or outcome prediction;
- a causal estimate of harm, readmission, mortality, cost or workforce reduction;
- DMS completion tracking as the demo pathway;
- national rollout readiness.

## 16. Acceptance criteria

The design is satisfied when a viewer can verify, without relying on presenter
narration, that:

1. the abnormal classification came from a current source;
2. the current owner never disappeared;
3. a live write was human-approved and schema-supported;
4. readback, not HTTP success, established downstream state;
5. absent evidence left the case open;
6. the candidate patch changed operational fields only;
7. baseline and candidate used the same trace;
8. invariant and comparison values were calculated rather than staged;
9. deployment remained human-governed;
10. no product or impact claim exceeded the evidence shown.
