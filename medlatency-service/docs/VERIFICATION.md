# Verification record — 12 September 2026

## Executed checks

- **52 MedLatency Python tests passed** under Python 3.12.14. Tests cover all nine scenarios; invalid/fabricated evidence; separate repeat identities; clocks and future evidence; conditional/negated actions; time-specific pending statements; reopening/cancellation; schema and patient isolation; graph cycles; SQLite idempotency; original/review preservation; correction, merge and split behavior; stale-analysis hiding; structured model output and refusals with a mocked provider; offset pagination failures; partial coverage; resume and tampering; HTTP jobs, filtering and exports; cross-origin write rejection.
- **13 pre-existing exporter regression tests passed.** These tests were run without editing the existing exporter code. Their temporary-directory ACLs required an unsandboxed test run on this Windows host. The new project's tests use inherited ACLs in an isolated workspace test directory.
- **Nine standalone export scripts passed execution checks without HTTP.** `tests/offline_export.test.cjs` executes each generated HTML script with a minimal DOM double and a network function that fails on use. All nine render their own identity, fixture/replay labels and filtering controls without network requests. This is a script test, not a visual browser renderer.
- **Scenario evaluation:** 9/9 independently authored mention-count assertions, 14/14 fulfillment assertions, and zero automatic acceptance of old results as newer requests. Extraction, matching and resolution are reported separately in `outputs/evaluation.json`. These are replay/contract checks, not measured model accuracy.
- **Anima discovery:** current OpenAPI and catalogue were downloaded and inspected, with retrieval timestamps and SHA-256 hashes. The implemented discovery CLI was exercised against the public service.
- **One live Anima patient:** selected from directory results, downloaded with GET only, and validated against the current response specification. The import contains 113 patient snapshots, 15 requested source responses, 11 visible recent audit events and 270 shared service context records. Its manifest reports 1 requested / 1 saved / 1 with all requested responses. Shared context remains separate. No simulation state was changed.
- **No live model inference was run.** The imported patient's analysis mode is `not_analysed`. Its evidence-only view and export work. The nine task demonstrations use authored fixture replays, not interpretations observed from a live model or complete workflows inferred from Anima.

## Browser checks

The local viewer was opened in the Codex browser. Verified:

- Patient switching among Alex Rowan (compound discharge), Casey Linden (authored complete diagnostic), Robin Ash (repeat requests) and Jamie Fern (partial blood evidence).
- Distinct source mode and analysis mode labels.
- Two documented prerequisites under the compound document task.
- Complete diagnostic task displays progress separately from fulfilled outcome.
- Ambiguous filter retains both repeat instances; expanding the old result displays the exact quote, JSON pointer and “Evidence predates this request” conflict.
- Partial blood evidence remains an **inferred candidate**, with no documented parent tasks counted and no inferred review/communication completion.
- Typography and layout were inspected at the browser's normal desktop viewport.

The browser tool's URL policy refused direct `file://` navigation. No bypass was attempted. Standalone files were verified through export API tests, embedded-data checks, and the no-network script execution test. Direct-from-disk visual browser verification remains a user-side check.

## Reproduce

```sh
python scripts/demo.py
python -m unittest discover -s tests -v
python scripts/evaluate.py
# Optional development check if Node is installed; not a runtime dependency:
node tests/offline_export.test.cjs
```

The generated `outputs/verification.json` records the delivery checks. `docs/sample_patient_presentation.json` contains only authored fictional data. Local Anima downloads, raw API responses, databases and generated exports are ignored by Git.

## Remaining uncertainty

Source existence validation does not validate the clinical meaning of a model interpretation. Cross-batch matching, unlinked records, identity changes across source fields, conditions, and conflicting snapshots can require human clarification. Templates are possible workflows, not universal clinical requirements. Only one live extraction was smoke-tested; a 100-patient production/live cohort was not downloaded for this project. Cohort pagination/resume behavior is exercised with deterministic API doubles. No clinical correctness, effectiveness or generalised accuracy claim is supported by this demonstration.
