# Synthetic diagnostic seed: Eleanor Chen (SIM-000006)

Team: team12. World: `team-ea32f6302052`.

Simulation as-of: 2026-09-14T15:20:00+00:00. The shared clock was not changed.

23 saved GP consultation records contain retrospective clinical evidence for the blood and CT pathways. One additional consultation carries the open follow-up instruction and links to the single native open task. All clinical event times below are explicitly authored narrative timestamps; server creation and Activity times remain unchanged. These notes do not populate native laboratory queues, PACS, DICOM files, CT booking state, or a structured result store.

## Verification

- Live readback verified for 25 explicit seed resources.
- Every POST constrained to SIM-000006; neighbouring GP patient snapshot unchanged. Not a whole-world audit.
- Every historical stage is at or before the simulator as-of time.
- The existing native laboratory reports and previous tasks were not edited.
- Each stage cites its original request resource through the note envelope; raw text and audit provenance are preserved.

## Stage timestamps and latency

All times below are UTC. The booking event and the planned appointment time are distinct.

### Blood tests

| Stage | Clinical event time | Since prior stage | Since request | Resource | Model observation |
|---|---|---:|---:|---|---|
| requested | 2026-09-01T09:20:00+00:00 | 0 min | 0 min | r-7158 | No validated output |
| ordered | 2026-09-01T09:25:00+00:00 | 5 min | 5 min | r-7160 | No validated output |
| phlebotomy_booked | 2026-09-01T11:10:00+00:00 | 105 min | 110 min | r-7162 | No validated output |
| collected | 2026-09-02T09:10:00+00:00 | 1320 min | 1430 min | r-7164 | No validated output |
| dispatched | 2026-09-02T10:10:00+00:00 | 60 min | 1490 min | r-7166 | No validated output |
| received | 2026-09-02T12:10:00+00:00 | 120 min | 1610 min | r-7168 | No validated output |
| analysed | 2026-09-02T14:20:00+00:00 | 130 min | 1740 min | r-7170 | No validated output |
| validated | 2026-09-02T15:05:00+00:00 | 45 min | 1785 min | r-7172 | No validated output |
| result_available | 2026-09-02T15:20:00+00:00 | 15 min | 1800 min | r-7174 | No validated output |
| reviewed | 2026-09-03T09:30:00+00:00 | 1090 min | 2890 min | r-7176 | No validated output |
| communicated | 2026-09-03T14:30:00+00:00 | 300 min | 3190 min | r-7178 | No validated output |
| closed | 2026-09-03T14:40:00+00:00 | 10 min | 3200 min | r-7180 | No validated output |

### CT chest

| Stage | Clinical event time | Since prior stage | Since request | Resource | Model observation |
|---|---|---:|---:|---|---|
| requested | 2026-09-01T09:35:00+00:00 | 0 min | 0 min | r-7182 | No validated output |
| awaiting_vetting | 2026-09-01T10:00:00+00:00 | 25 min | 25 min | r-7184 | No validated output |
| approved | 2026-09-02T11:00:00+00:00 | 1500 min | 1525 min | r-7186 | No validated output |
| booked | 2026-09-03T15:00:00+00:00 | 1680 min | 3205 min | r-7188 | No validated output |
| safety_checked | 2026-09-09T10:00:00+00:00 | 8340 min | 11545 min | r-7190 | No validated output |
| scan_completed | 2026-09-09T10:30:00+00:00 | 30 min | 11575 min | r-7192 | No validated output |
| images_available | 2026-09-09T10:40:00+00:00 | 10 min | 11585 min | r-7194 | No validated output |
| report_available | 2026-09-10T16:00:00+00:00 | 1760 min | 13345 min | r-7196 | No validated output |
| reviewed | 2026-09-11T09:00:00+00:00 | 1020 min | 14365 min | r-7198 | No validated output |
| communicated | 2026-09-11T11:15:00+00:00 | 135 min | 14500 min | r-7200 | No validated output |
| follow_up_assigned | 2026-09-11T11:30:00+00:00 | 15 min | 14515 min | r-7202 | No validated output |

## MedLatency analysis

GPT-5.4 output was rejected because a task lacked an explicit fulfillment criterion. After adding bounded repair feedback for that condition, the subsequent run exhausted its network/timeout retries. No validated analysis is available.
Readback, timestamp and relationship checks passed independently; no semantic extraction success is claimed.

## Limitations

- Stage states are retrospective narrative evidence. The API does not expose general historical event imports or the full CT lifecycle.
- No actual messages/calls were sent; communication stages are authored synthetic records.
- The GP task is open; its appointment has not been booked or attended.
- create_task discards text and supplies a default dueAt. The linked consultation preserves the clinical deadline and instruction; native task dueAt is not the clinical deadline.
- Full clinical history and a whole-world atomic snapshot are not guaranteed by the API. See manifest.json for source coverage.
- All patient-facing narrative and results are fictional demo content, not clinical recommendations.
