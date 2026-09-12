# Anima ADK and API integration

## Architecture boundary

Care Covenant is an external application connected to one isolated Anima team
world. Treat Anima as versioned read/write ports around a deterministic domain
core:

```text
Anima read adapters → bounded ADK proposals → deterministic reducer
                                            ↓
human approval → execution service → Anima write adapter
                                            ↓
                              readback + Activity evidence
```

Only the execution service may call a write operation. It requires human approval,
current source versions, a staff identity, a supported live schema, and a stable
idempotency key. The reducer alone advances ownership and closure state.

## Three bounded ADK responsibilities

### Context Assembler

Reads the current source result, classification/version, orderer, requested
receiver, relevant site records, simulator time, and Activity. It returns cited
records, conflicts, and missing evidence. It cannot infer abnormality, choose
treatment, write, set ownership, or declare closure.

### Covenant Compiler

Maps the cited snapshot and fixed protocol to structured operational proposals,
deadlines, payload previews, provenance, and hard-stop reasons. It cannot invent
clinical fields, approve itself, write, or convert submission into completion.

### Reliability Analyst

Explains a labelled failed synthetic trace and proposes one patch limited to:

- receiver mode;
- acknowledgement deadline;
- fallback team;
- exception route;
- duplicate-suppression window.

It cannot alter clinical content, closure evidence rules, safety invariants, or
approval requirements.

## Adapter rules

1. Fetch `GET /openapi.json` during preflight and bind only operations currently
   present.
2. Keep the team bearer key server-side. Never send it to browser code, model
   prompts, logs, fixtures, screenshots, or source control.
3. Read team and clock context before resolving patient/site records.
4. Paginate record collections.
5. Attach resource ID, version, actor, simulator timestamp, and Activity ID to
   evidence.
6. Revalidate patient, destination, permissions, and versions immediately before
   execution.
7. Treat a successful response as `SUBMITTED`.
8. Recover uncertain writes by readback before retrying.
9. Retry with the same idempotency key:

   `team + patient + result + result-version + protocol-version + action-kind + destination`

10. Advance state only from matching current readback. If Activity is unavailable,
    show the operational record but block a final audit/closure claim.

## Failure behavior

- Unsupported operations become **Protocol preview**, without a live control.
- Missing staff identity disables writes.
- A changed source version marks the proposal stale and rebuilds it.
- Partial write failure preserves successful rows and retries only the failed row.
- ADK failure leaves deterministic evidence browsing and manual proposal fields
  usable.
- Recorded simulator evidence is isolated from live receipts and visibly labelled
  with world and capture time.
- Clock failure leaves time and state unchanged.

The operational-latency twin is side-effect-free. It replays identical immutable
events through baseline and candidate reducers, uses no model output during replay,
and cannot access live write ports.
