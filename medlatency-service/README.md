# MedLatency

MedLatency shows which simulated follow-up actions are supported by evidence, which remain unresolved, and what needs clarification next.

This is a working local Python backend, SQLite store, browser viewer, read-only Anima importer, structured-output model adapter, and standalone HTML exporter. It includes nine entirely fictional patient scenarios. A sent document or completed encounter does **not** automatically complete instructions inside it.

The `medlatency/` directory is portable and does not import the pre-existing exporter scripts in its parent directory. Those files were preserved. No credentials or existing patient exports are needed to run the fixture demonstration.

## Quick start without credentials

Use stable Python 3.11â€“3.14 (tested with 3.12.14). Python 3.15 prerelease on this Windows ARM machine could not load a validator dependency; use stable Python.

From this directory:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python scripts/demo.py
python -m backend.server
```

macOS/Linux:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/demo.py
python -m backend.server
```

Open [the local viewer](http://127.0.0.1:8765). There are no CDN, Node, frontend build, Anima, or LLM dependencies for this demonstration. The only installed Python dependency is JSON Schema validation and its dependencies; HTTP and SQLite use the standard library.

**Already prepared in this workspace:** `.venv-runtime/Scripts/python.exe` is the verified Python 3.12 environment. Run `.venv-runtime/Scripts/python.exe -m backend.server` from `medlatency/` without installing again.

`demo.py` regenerates fictional source bundles and authored replays, imports them, analyses all nine, and writes standalone HTML to `outputs/pitch/`. It is idempotent and preserves local review history. `generate_fixtures.py` alone resets the authored fixture files to their original contents; neither command modifies Anima or reads the expected answers. To start a separate review database, set `MEDLATENCY_DB` to a new path.

## Common commands

```sh
# Generate/reset authored source fixtures and exact-input replay interpretations
python scripts/generate_fixtures.py

# Validate a portable bundle and import without analysing
python scripts/validate_bundle.py fixtures/patients/DEMO-001.json
python scripts/import_bundle.py fixtures/patients/DEMO-001.json

# Analyse a file, or a patient already imported into SQLite
python scripts/analyse_patient.py --bundle fixtures/patients/DEMO-005.json --provider replay
python scripts/analyse_patient.py --patient-id DEMO-005 --provider replay

# Export self-contained HTML; open the file with the backend stopped
python scripts/export_pitch.py --patient-id DEMO-005 --out outputs/pitch

# Service and verification
python -m backend.server --port 8765
python -m unittest discover -s tests -v
python scripts/evaluate.py
```

Commands resolve assets relative to the project directory. `--db` is supported by the import, analysis, export, and server commands. `MEDLATENCY_DB` also selects the database. Relative custom DB paths are relative to the working directory. No analysis is necessary to inspect imported evidence or export an evidence-only patient view.

## Optional model-assisted analysis

Copy `.env.example` to `.env` in **this** directory and supply values locally. Do not pass bearer keys in command-line arguments, URLs, exported files, or commits. Environment variables take precedence. The `.env` loader reads only the listed variable names and never evaluates shell expressions.

```dotenv
MEDLATENCY_PROVIDER=openai
LLM_API_KEY=your_provider_key
LLM_MODEL=your_structured_output_model
LLM_BASE_URL=https://api.openai.com/v1
```

Select a model that supports Chat Completions with strict `json_schema` structured outputs. The adapter follows the [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). No model is silently chosen. Other compatible providers may be configured with an HTTPS API base URL. Redirects are refused to protect the bearer token.

```sh
python scripts/analyse_patient.py --bundle data/bundles/SIM-000006.json --provider openai
```

Or select **Configured model provider** and click **Run analysis** in the viewer. HTTP requests return a job immediately; poll the job endpoint for queued/running/completed/failed. Two background workers and a bounded ten-job queue prevent indefinite HTTP requests. Interrupted jobs become failed on restart and can be resubmitted.

The model receives one patient's clinical source fields and template definitions. Native duplicate payloads, raw HTTP provenance and shared inventories remain local. Large patients are split into bounded batches with a compact task registry; cross-batch limitations are attached to tasks. The implementation limits each prompt to 150,000 characters and each patient to 32 requests. One source exceeding 110,000 characters fails explicitly rather than truncating clinical text. Transport retries are bounded; incomplete output, refusals, malformed schemas, invalid spans and unknown graph references fail before persistence.

Semantic task extraction is **model-assisted**. It is not implemented with regular expressions. Deterministic token overlap only nominates evidence candidates, never fulfillment. The credential-free provider reads **authored replays keyed by the exact bundle fingerprint**; it cannot analyse live bundles or silently handle edited fixtures. Replay demonstrations are not live LLM output.

## Optional Anima extraction

Set `ANIMA_API_KEY` in the environment or this directory's `.env`. The application does not implicitly consume a parent project's `.env`. For the development smoke check only, the existing workspace key was read directly into memory.

```sh
python scripts/fetch_anima.py --discovery-only
python scripts/fetch_anima.py --patient-id SIM-000006 --out data/bundles
python scripts/fetch_anima.py --count 100 --out data/bundles/cohort
python scripts/fetch_anima.py --count 100 --out data/bundles/cohort --resume
python scripts/import_bundle.py data/bundles/SIM-000006.json
```

The extractor always downloads the current [OpenAPI specification](https://sim.animahacks.com/api/openapi.json) and [catalogue](https://sim.animahacks.com/api/catalogue) before live data extraction. It verifies GET route availability, query parameters and responses against that specification. A contract inventory is saved at `data/raw/api-contract-audit.json`.

All remote Anima requests use **GET**. It never advances or pauses simulation time, sends messages, places orders, or changes clinical records. Original response bytes are stored under their SHA-256 hash in `data/raw/`; timestamped `.meta.json` files preserve every retrieval. Auth headers are never saved. The fixed Anima origin cannot be overridden with an arbitrary credential destination.

Patient IDs come from directory pagination, not invented ID ranges. The directory's current fixed page size is 30. Site views and wearables use offset/limit pagination. Repeated pages, repeated IDs, inconsistent totals, wrong offsets, empty premature pages and insufficient cohorts fail explicitly. Resources are filtered to the selected patient; shared service context is stored separately and is never task evidence. Identical native snapshots deduplicate while preserving retrieval provenance; differing versions remain separate.

The importer collects all accessible canonical service views, the five documented messaging/document/attendance/pharmacy workspaces, wearable devices/readings, and the limited recent-event clock. Secondary NHS projections are inventoried but not requested; some are capped. Resource **content**, not the projection's specialty, is supplied to semantic extraction. Generic narrative encounters, nested fields and queued call scripts retain their native content.

Each patient's checkpoint is written atomically. `--resume` skips only complete bundles whose fingerprint still matches; partial or corrupt checkpoints are retried. Team/world and extraction selection must match. Requests are sequential (modest concurrency of one), with timeouts and bounded retries. Exit 2 means saved but partial coverage; exit 1 means extraction failed. The manifest always reports requested, saved and complete counts. Missing credentials never trigger fixture substitution.

`complete` in an extraction manifest means the requested source responses were collected, **not** that clinical history or care is complete. Scope omissions, clock limits, non-atomic captures, unknown timestamps and conflicting snapshots remain in coverage metadata.

## Evidence and resolution model

The published contracts are `schemas/patient_bundle.schema.json`, `schemas/extraction.schema.json` and `schemas/analysis.schema.json`. Regenerate them with `python -m backend.models`. `schemas/database.sql` contains the SQLite DDL.

The canonical bundle preserves native IDs, kinds, versions, statuses, data, raw native payloads, snapshot IDs, retrieval provenance, source locations, explicit links, event times, record creation, clocks and coverage. Evidence references use a resource ID **and snapshot ID**, plus a JSON pointer relative to that canonical resource. A quotation must be a nonempty exact substring; structured values use their JSON encoding. Cross-patient resources and events are rejected. Shared context cannot contain patient-owned records.

The pipeline separates:

1. `anima.py` / bundle validation: importing and normalization.
2. `engine.index_evidence`: source field indexing, without task interpretations.
3. `providers.py`: semantic extraction, strict output validation, and exact source verification.
4. `engine.match_candidate`: native relationship matching and candidate abstention; dates, clock, item and record-metadata conflicts are recorded.
5. `engine.resolve`: stages, evidence assessment, lifecycle and outcome. Templates in `config/workflow_templates.json` supply possible stages, not universal requirements.
6. `store.py`: immutable original analyses and append-only local review decisions.
7. `server.py`, `viewer/`, `export.py`: patient presentation and self-contained exports.

Outcome criteria belong to each task: `required_stages` and `fulfillment_rule` (`all` or `any`). Graph edges distinguish documented prerequisites, parallel requirements, conditional paths, alternatives, supersession and template suggestions. Documented prerequisites can block a parent's resolution. Conditional task activation remains a clarification step; arbitrary clinical conditions are not automatically evaluated. Unknown families use their own criteria without an unsuitable template.

Progress, evidence assessment, fulfillment and lifecycle remain independent. Available results do not backfill unobserved orders, review or communication. Earlier pending assertions are retained as historical evidence when a later explicit observation at a comparable clinical event time resolves that stage. Simultaneous conflicts and incomparable clocks remain disputed/uncertain. Record creation is never used for this comparison. Reopening cancels a previous fulfillment assumption. Cancellation, decline and supersession remain separate from successful fulfillment.

Source-span validation establishes that text exists; it does **not** establish that a model's interpretation is clinically correct. Native linkage and item interpretation can still need human review. Recurring requests in separate source records remain distinct. Stable IDs derive from patient, source resource, source field and action key, independent of label/version. If a provider changes the action key or an action moves to another source field, identity reconciliation requires human review; fuzzy identity merging is intentionally not automatic.

Task counts include active, documented parent instances (including conditional plans). Subtasks, inferred candidates and non-action mentions are shown separately. Candidate-review counts count candidate records, not patients. Work started and fulfilled outcomes may overlap. The viewer gives every status a text label and marker, so colour is not required to understand it.

## Human review

Expand **Local human review** on a card. Enter a reviewer name, explanation and operation payload. The UI supports accepting/rejecting candidates, correcting label/outcome/family/responsibility/intent, merging mentions, splitting tasks and disputing an interpretation. IDs are visible in evidence and review panels. API examples are in `docs/API.md`.

Original interpretations, reviewer decisions, explanations and timestamps are retained. Reanalysis reapplies reviews and flags changes to source fingerprints or missing candidates. Merged mentions preserve source references and combine candidate evidence; splits are explicitly human-authored inferred candidates until reviewed. Accepting a text-only candidate cannot create a missing stage observation. An explicit reviewer can override a candidate decision; its human origin and original conflicts remain visible. Review history is local only and is included in exports.

## Files and data handling

| Location | Purpose |
|---|---|
| `backend/` | Import, contracts, providers, matching, resolution, SQLite, API and export |
| `viewer/index.html` | Inline CSS/JS, no external assets; also the standalone export template |
| `scripts/` | Fixture, import, analysis, live extraction, validation, evaluation and export commands |
| `config/` / `schemas/` | Configurable workflow expectations and published contracts |
| `fixtures/patients/` | Fictional source bundles suitable for version control |
| `fixtures/replays/` | Explicitly authored semantic outputs, keyed by source fingerprint |
| `fixtures/expected/` | Independently authored scenario assertions; used only by tests/evaluation |
| `data/raw/` / `data/bundles/` | Ignored live responses, discovery audits and downloaded bundles |
| `data/medlatency.sqlite3` | Ignored local database; facts, cache, analyses, reviews and jobs |
| `outputs/analyses/` / `outputs/pitch/` | Ignored generated analyses and standalone exports |
| `docs/` | API examples, complete synthetic patient response, validation report and demo walkthrough |

The server binds to loopback and rejects cross-origin writes and unexpected Host headers. It is a local hackathon service, not a multi-user clinical deployment. `.gitignore` excludes credentials, local databases, live downloads, generated outputs and virtual environments. Only explicitly fictional fixtures and a synthetic sample response belong in version control.

## Demonstration and evaluation

Read `docs/DEMO.md` for the three-minute walkthrough and `docs/VERIFICATION.md` for checks actually performed. The strongest examples are DEMO-001 (compound instruction with one prerequisite addressed), DEMO-002 (delivered reminder versus paperwork), DEMO-004 (partial blood evidence), DEMO-006 (old result versus repeat requests) and DEMO-005 (clearly authored complete diagnostic workflow).

`scripts/evaluate.py` reports extraction mention counts, matching outcomes and stage-resolution checks separately against `fixtures/expected/scenarios.json`. Replay evaluation tests scenario behavior and contracts. It does **not** measure LLM extraction accuracy, clinical correctness, reduced delays or performance on an independent patient population. The live provider transport is tested with mocked structured responses; live SIM-000006 calls were attempted but did not yield a validated analysis; see ../docs/MEDLATENCY_HANDOFF.md.
