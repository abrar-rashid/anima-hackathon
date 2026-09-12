# Synthetic EHR and MedLatency integration handoff

Start with **Eleanor Chen, SIM-000006**, in Anima team12 / world `team-ea32f6302052`. Exactly 25 seed records were appended and read back: 23 blood/CT stage consultations, one follow-up instruction consultation, and one open GP task. The simulation clock was unchanged at 2026-09-14 15:20 UTC. No additional seeding is necessary for this world.

The [verified stage report](../medlatency-service/docs/seed-results/REPORT.md) contains every resource ID, clinical timestamp and elapsed interval. Blood request: `r-7158`; CT request: `r-7182`; open task: `r-7204`; companion instruction: `r-7206`. The episode spans 1–11 September; booking follow-up is due 18 September 2026 at 16:00 UTC.

## What the API actually supports

`save_consultation` preserves clinical free text in `data.text`. It does not backdate server audit timestamps. There is no general historical import, custom lab-result import or complete CT lifecycle endpoint in the reviewed contract. These records therefore contain explicitly labelled retrospective clinical evidence, not populated native laboratory/PACS queues or imaging files.

`create_task` discarded supplied text and assigned a default `dueAt` in the live test. Read the linked consultation for the actual task instruction, owner and clinical deadline. Do not derive that deadline from the task's default metadata. Existing records were preserved; an idempotent rerun added no duplicates; a neighbouring patient's GP snapshot was unchanged.

## Frontend integration

The branch adds consultation narrative rendering, labelled clinical-time entries alongside audit events, and strict parsing of the versioned synthetic envelope. Completed seed narratives stay visible as evidence but are excluded from the frontend open-work extractor to avoid reissuing historical requests. The downstream follow-up remains open.

`medlatency-service/` is the portable Python service developed in this workspace. It is deliberately separate from the repository's earlier `medlatency/` prototype: their contracts differ. Use [the service API](../medlatency-service/docs/API.md), [JSON schemas](../medlatency-service/schemas), and [a complete fictional presentation response](../medlatency-service/docs/sample_patient_presentation.json) when building the frontend adapter. The existing frontend does not yet call this service.

1. Create a Python 3.12 virtual environment inside `medlatency-service`, install `requirements.txt`, and run `python scripts/demo.py` for the nine credential-free fictional examples.
2. Start `python -m backend.server` from that directory (loopback port 8765).
3. Use a Next.js server-side adapter to call `/api/patients/{id}/overview`, `/tasks`, `/timeline`, and `/evidence`. Keep API keys on the server. The service rejects cross-origin browser writes; do not call its write endpoints directly from the browser.
4. For live SIM-000006 evidence, configure `ANIMA_API_KEY` locally and run `python scripts/fetch_anima.py --patient-id SIM-000006 --out data/bundles`, followed by `python scripts/import_bundle.py data/bundles/SIM-000006.json`.
5. Configure `LLM_API_KEY`, `LLM_MODEL`, and `MEDLATENCY_PROVIDER=openai` locally. POST an analysis request, poll the returned job URL, and render failed/queued/evidence-only states honestly. A failed extraction must not appear as zero outstanding tasks.

See [setup and commands](../medlatency-service/README.md). No credentials, virtual environments, local databases, broad raw API downloads or failed model responses are included in this branch.

## Extraction status and remaining work

Funding allowed model calls to resume. GPT-5.4-mini outputs failed exact evidence validation. GPT-5.4 returned source-backed output but final validation rejected a task with no explicit fulfillment criterion. The adapter now includes that requirement in bounded repair feedback; the subsequent GPT-5.4 run exhausted its network/timeout retries. **No successful validated analysis for SIM-000006 is included or claimed.** The seed/readback and timestamp checks succeeded independently.

The adapter preserves strict source quotes, exact resource/snapshot pairs, related episode batching and bounded retries. An invalid pointer can only be resolved when its unchanged exact quotation has one unique location in the same immutable source snapshot; such corrections are audited. Human review is still needed for model interpretation and cross-batch matching.

Next integration work: implement the service-to-frontend adapter, expose analysis job failures and source evidence, then rerun and review the live patient's extraction. The checked-in stage-latency data is authored clinical evidence, not successful model output.

Handoff verification: 62 backend unit tests passed from `medlatency-service`; 17 focused frontend tests passed (retrospective seed, patient timeline and patient evidence honesty); `tsc --noEmit` passed. These checks do not establish successful live model extraction.
