# Hackathon brief and decisions

## Brief

Build an Anima-native prototype against the fictional NHS simulator that makes a
cross-team abnormal-result pathway operationally reliable. The demonstrable gap is
not detection: Anima already supports result/document triggers, tasks, routing,
messaging, booking, and workflow automation. The prototype must show what happens
after those capabilities create work.

The signature claim is:

> **An alert finds a result. A covenant proves someone owned what happened next.**

## Final product decision

Care Covenant is a focused case workspace launched from an existing Anima
result, document, or task context. It adds:

1. **Transactional ownership:** visibility or a sent task does not transfer
   responsibility. The ordering team remains accountable until explicit,
   attributed acceptance.
2. **Evidence-backed closure:** request success is only submission. Patient
   contact, downstream action, and outcome each need current record evidence.
3. **Testable operational improvement:** a failed synthetic trace may produce a
   bounded protocol patch, replayed against the identical trace before any human
   approval.

The operational-latency twin is a deterministic protocol replay engine, not a
clinical or patient digital twin. It changes no clinical classification, plan,
threshold, urgency, diagnosis, or treatment.

## Hero slice

- Use one qualifying synthetic patient and one current, source-classified abnormal
  result after a care transition.
- Prefer Amira Khan (`SIM-000001`) only when live preflight proves she qualifies.
- Show the current result/version, ordering team, requested receiver, simulator
  time, and existing evidence.
- Execute at least one human-approved action supported by the current OpenAPI
  schema.
- Prove the resulting state through destination readback and matching Activity
  metadata.
- Replay one timeout/failure trace, propose one allowed operational patch, and
  display calculated baseline-versus-candidate measures and invariant results.
- Stop the candidate at **Proposed**; do not deploy it.

## Explicit cuts

Do not build a dashboard, new inbox, chatbot, visible agent personas, generic
workflow builder, voice interface, clinical classifier, autonomous write path,
production identity system, real patient messaging, or outcome predictor.

Patient selection is transparent demo control, never AI ranking. If an ownership
acceptance operation is unavailable, label it **Protocol preview** and use a
different supported action for the live write/readback proof.
