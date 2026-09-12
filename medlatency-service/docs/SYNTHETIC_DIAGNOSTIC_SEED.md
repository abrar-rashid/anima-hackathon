# One-patient diagnostic demo seed

This seed appends a blood-test and CT chest episode to **Eleanor Chen, SIM-000006**, using the existing team world. It writes 23 pathway consultations, one consultation with the open follow-up instruction, and one open GP task. It does not advance the shared clock, edit existing laboratory reports, create active diagnostic orders, contact patients, or use operator endpoints.

The live Action contract has no general historical event import, custom laboratory-result import, or complete CT state machine. Consequently the clinical stages are **explicit retrospective narrative evidence in native consultation records**, not native lab/PACS states. Audit creation times remain the real simulator write times. Numeric blood values and the CT report are in the narratives. No imaging files are fabricated. Live testing also showed that `create_task` discards `text` and supplies its own default `dueAt`: the companion consultation explicitly links the returned task ID and preserves the clinical booking deadline, owner and instruction. The default task dueAt must not be interpreted as that clinical deadline.

## Commands

From the Anima workspace, using the prepared Python runtime:

```powershell
# Read the live contract and patient; validate payloads without writing.
& medlatency-service/.venv/Scripts/python.exe medlatency-service/scripts/seed_diagnostics.py --env-file .env.local

# Apply and read back exactly the same patient's seed; use the existing demo extraction model.
& medlatency-service/.venv/Scripts/python.exe medlatency-service/scripts/seed_diagnostics.py --env-file .env.local --apply --analyse --model gpt-5.4

# Repeat --apply without --analyse to check idempotent reuse, without another model request.
& medlatency-service/.venv/Scripts/python.exe medlatency-service/scripts/seed_diagnostics.py --env-file .env.local --apply

# Produce the per-stage report and latency JSON from verified live evidence.
& medlatency-service/.venv/Scripts/python.exe medlatency-service/scripts/report_diagnostic_seed.py

# Run model extraction on the verified saved patient, with no Anima writes.
& medlatency-service/.venv/Scripts/python.exe medlatency-service/scripts/analyse_diagnostic_seed.py --env-file .env.local --model gpt-5.4
```

`--env-file` is explicit. Keys stay in memory and never enter payloads, prompts, manifests or console output. Environment values take precedence. The script checks the synthetic patient identity and binds its manifest to the team world. It refuses mismatched existing content rather than overwriting it. A partial/uncertain run resumes with the same stable idempotency keys, checks existing titles and exact content, and persists receipts after every write.

The fixed authored content is in `fixtures/seed/diagnostic-episode.json`. The first preparation anchors the episode to a Tuesday sufficiently before the simulation clock; its dates stay fixed in the manifest on later runs. For the original run these are 1â€“11 September 2026, with a follow-up booking deadline of 18 September 2026. Planned appointment times, event times, deadlines and import times remain separate.

## Integration and outputs

`backend/retrospective.py` decodes only an exact, versioned synthetic note envelope. It validates patient, investigation, stage and timezone; normalizes the explicit event timestamp without replacing the native payload; and preserves `/data/text` provenance. The importer links stage records to the matching same-patient request reference. The resolver identifies these as documented relationships, not native lab-order relationships.

The model receives the original narratives and independently extracts tasks/observations. `blood_test` and `ct_imaging` templates expose the relevant distinct stages. Authored instructions remain task origins; later completed events are observations, not additional outstanding tasks. No model outputs or fulfillment results are hard-coded by the seed.

The model transport supplies short snapshot handles to avoid copying long hashes. The adapter restores the exact immutable snapshot only when the handle and resource ID agree. Unknown handles, mismatched resources and inexact source quotations remain validation failures.

The frontend displays consultation narratives as evidence and adds their explicitly labelled clinical events alongside the existing audit timeline. Its open-work extractor excludes this exact seed's explicitly completed retrospective pathways. The separate native task remains visible as open work. This frontend is not the standalone MedLatency resolver: the detailed full-pathway analysis is available through the MedLatency service and exported report.

Outputs under `outputs/seed-diagnostics/`:

- `manifest.json`: patient/world, actual IDs and versions, payload hashes, timestamps, coverage and verification.
- `payloads.json`: actual synthetic action payloads with returned request references.
- `before.json`, `after.json`: canonical live imports using the existing importer; exact raw HTTP evidence is in `raw/`.
- `analysis.json`, `presentation.json`, `patient.html`: real model analysis and standalone presentation.
- `stage-latencies.json`, `REPORT.md`: clinical stage deltas, model evidence coverage and limitations.

The canonical after-bundle is also imported into the existing local MedLatency SQLite store. The seeder verifies a neighbouring patient's GP snapshot and enforces the selected patient on every write. This is not a claim of an atomic whole-world audit. The API's history and source-coverage limitations remain visible.
