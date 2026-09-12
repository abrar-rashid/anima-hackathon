# Local API

Base URL: `http://127.0.0.1:8765`. All bodies and responses are JSON unless noted. Errors return `{ "error": "..." }`; common statuses are 400 invalid input, 404 absent/cross-patient ID, 413 body too large, 415 wrong content type, 429 full queue. No endpoint writes to Anima.

| Method | Route | Result |
|---|---|---|
| GET | `/api/health` | Local service state |
| GET | `/api/patients` | Identities, dataset mode, analysis mode and readiness |
| POST | `/api/bundles` | Validate and import a canonical bundle; 201 |
| POST | `/api/patients/{id}/analyses` | Enqueue `{ "provider": "replay" }` or `openai`; 202 |
| GET | `/api/jobs/{job_id}` | Queued/running/completed/failed, analysis ID, safe error |
| GET | `/api/patients/{id}/overview` | Complete pitch presentation response |
| GET | `/api/patients/{id}/tasks` | All task mentions; optional `filter=unresolved`, `filter=ambiguous`, `family=diagnostic` |
| GET | `/api/patients/{id}/tasks/{task_id}` | Full task, candidates, resolution and review flags |
| GET | `/api/patients/{id}/tasks/{task_id}/graph` | Dependency edges and stage states |
| GET | `/api/patients/{id}/evidence` | Source snapshots and flattened field index |
| GET | `/api/patients/{id}/evidence/{resource_or_snapshot_id}` | Matching snapshots, native source and provenance |
| GET | `/api/patients/{id}/timeline` | Events with clock domain, event type and metadata visibility |
| GET | `/api/patients/{id}/reviews` | Append-only human review history |
| POST | `/api/patients/{id}/reviews` | Save local review; 201 |
| GET | `/api/patients/{id}/export` | Standalone `text/html`, all presentation data embedded |

Use `curl.exe` in Windows PowerShell if `curl` is an alias.

```sh
curl -X POST http://127.0.0.1:8765/api/bundles -H 'Content-Type: application/json' --data-binary @fixtures/patients/DEMO-005.json
curl -X POST http://127.0.0.1:8765/api/patients/DEMO-005/analyses -H 'Content-Type: application/json' -d '{"provider":"replay"}'
```

Example queue response (IDs shown illustratively):

```json
{"job_id":"job_…","status":"queued","poll":"/api/jobs/job_…"}
```

```sh
curl http://127.0.0.1:8765/api/jobs/job_REPLACE_WITH_RETURNED_ID
curl http://127.0.0.1:8765/api/patients/DEMO-005/overview
curl http://127.0.0.1:8765/api/patients/DEMO-006/tasks?filter=ambiguous
curl http://127.0.0.1:8765/api/patients/DEMO-005/export -o outputs/pitch/DEMO-005.html
```

The complete, actual, wholly synthetic presentation response is checked in at `docs/sample_patient_presentation.json`. It includes overview, counting rules, task cards, dependency edges, exact evidence, timeline, highlights and analysis provenance. Generated counterparts for all nine patients are in `outputs/analyses/*.presentation.json` after `scripts/demo.py`.

Review request shape:

```json
{
  "task_id": "task_ID_FROM_THIS_PATIENT",
  "operation": "correct",
  "reviewer": "Demo reviewer",
  "explanation": "Responsibility clarified for this demonstration.",
  "payload": {"responsible": "GP team"}
}
```

Supported payloads:

```json
{"operation":"accept_match","payload":{"candidate_id":"match_ID_FROM_TASK"}}
{"operation":"reject_match","payload":{"candidate_id":"match_ID_FROM_TASK"}}
{"operation":"correct","payload":{"family":"external_document","label":"Request ward note"}}
{"operation":"merge","payload":{"other_task_id":"task_OTHER_SAME_PATIENT"}}
{"operation":"split","payload":{"children":[{"label":"Request note","outcome":"Request sent","required_stages":["requested"]},{"label":"Review note","outcome":"Note reviewed","required_stages":["reviewed"]}]}}
{"operation":"dispute","payload":{}}
```

Every request also needs `task_id`, `reviewer` and `explanation`. The response includes `id`, `patient_id`, timestamp, input fingerprint and the original interpretation. Cross-patient task/candidate references are rejected. A new import hides any analysis of a different fingerprint until analysis is rerun; previous analyses remain in SQLite for audit and comparison.
