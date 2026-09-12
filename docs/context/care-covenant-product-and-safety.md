# Care Covenant product and clinical safety

## Product

Care Covenant is an embedded reliability layer for one abnormal-result pathway.
It distinguishes:

```text
Ownership: Orderer owns → Transfer requested → Named acceptance
Care:      Result available → Clinically reviewed → Plan recorded
           → Patient informed → Action started → Outcome evidenced → Closed
```

A shared result, request receipt, or downstream visibility never transfers
ownership by itself. The ordering team remains accountable through decline,
timeout, and unavailable-recipient branches until an attributed receiver accepts.

Closure requires the current protocol's evidence for clinical review, plan,
patient contact, action, and outcome. Missing or stale evidence keeps the case open.
A changed source version reopens only affected steps.

## Human control

- The source or an approved simulator rule supplies abnormal classification.
- An authorised clinician records or confirms the clinical plan.
- A user reviews every external write and exact payload.
- Agents extract, reconcile, explain, and propose bounded operational work.
- Deterministic reducers decide states; returned records establish evidence.
- Protocol patches remain proposed until named clinical and operational governance
  approves a controlled rollout and rollback target. The hackathon slice never
  deploys a patch.

## Hard stops

Disable or exclude a write when:

- patient, destination, staff identity, or permission does not match;
- the result/source is absent, non-current, or not source-classified;
- the action is unsupported by the live schema;
- required operational fields are missing;
- a duplicate or idempotency conflict is unresolved;
- the proposal was built from stale versions;
- any included field requires clinical interpretation.

Never let an agent diagnose, triage, choose urgency, change a medication, select
treatment, interpret a physiological value as safe, infer refusal or
non-adherence, or write as a different service.

## Safety invariants

1. There is always an accountable team.
2. Acceptance requires a named actor in an accountable team.
3. Submission and visibility are not acceptance or completion.
4. Clinical review is human and evidenced.
5. Clinical classification, thresholds, urgency, diagnosis, and treatment do not
   change.
6. Patient contact needs delivery/contact evidence.
7. Closure cannot skip required review, communication, action, or outcome evidence.
8. Successful actions are not duplicated.
9. Absent actors invoke team cover without creating an ownership vacuum.
10. A candidate protocol cannot worsen manual touches, duplicates, or alert burden
    beyond the baseline trace.
11. Version conflicts preserve unaffected valid evidence.
12. Activation always requires named approval and rollback.

## Clinical deployment boundary

This is a synthetic hackathon prototype, not a clinical device or production NHS
workflow. Real deployment would require clinical safety review, information
governance, identity and delegation agreements, interoperability validation,
accessibility review, local policy and capacity, controlled rollout, and monitoring.
Do not use real patient data or real patient messaging.
