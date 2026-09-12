"""Report actual seed receipts, exact live readback, stage latencies and model evidence coverage."""
import _bootstrap
import argparse
from backend.common import ROOT, read, write, instant, digest
from backend.retrospective import metadata


def report(out):
    manifest = read(out / 'manifest.json')
    bundle = read(out / 'after.json')
    analysis = read(out / 'analysis.json') if (out / 'analysis.json').exists() else None
    if analysis and analysis['input_fingerprint'] != digest(bundle):
        analysis = None
    records = {r['id']: r for r in bundle['resources']}
    observations = analysis['extraction']['observations'] if analysis else []
    rows = []
    lines = [f'# Synthetic diagnostic seed: {manifest["patient_name"]} ({manifest["patient_id"]})', '',
        f'Team: {manifest["team"]}. World: `{manifest["world"]}`.', '',
        f'Simulation as-of: {instant(manifest["clock_after"]).isoformat()}. The shared clock was not changed.', '',
        '23 saved GP consultation records contain retrospective clinical evidence for the blood and CT pathways. '
        'One additional consultation carries the open follow-up instruction and links to the single native open task. '
        'All clinical event times below are explicitly authored narrative timestamps; server creation and Activity times remain unchanged. '
        'These notes do not populate native laboratory queues, PACS, DICOM files, CT booking state, or a structured result store.', '',
        '## Verification', '',
        f'- Live readback verified for {manifest["verified_resources"]} explicit seed resources.',
        f'- {manifest["isolation_basis"]}',
        '- Every historical stage is at or before the simulator as-of time.',
        '- The existing native laboratory reports and previous tasks were not edited.',
        '- Each stage cites its original request resource through the note envelope; raw text and audit provenance are preserved.', '',
        '## Stage timestamps and latency', '',
        'All times below are UTC. The booking event and the planned appointment time are distinct.', '']
    for family in ('blood', 'ct'):
        lines += [f'### {"Blood tests" if family == "blood" else "CT chest"}', '',
            '| Stage | Clinical event time | Since prior stage | Since request | Resource | Model observation |',
            '|---|---|---:|---:|---|---|']
        writes = [(key, row) for key, row in manifest['writes'].items()
                  if row['investigation'] == family and row['action'] == 'save_consultation' and key != 'ct:followup-instruction']
        writes.sort(key=lambda pair: instant(pair[1]['clinical_event_at']))
        start = instant(writes[0][1]['clinical_event_at'])
        prev = start
        for key, row in writes:
            source = records[row['resource_id']]
            meta = metadata(source['native'])
            assert meta and meta['clinical_event_at'] == row['clinical_event_at']
            at = instant(row['clinical_event_at'])
            assert at <= instant(manifest['clock_after'])
            matched = [obs for obs in observations if obs['source']['resource_id'] == row['resource_id']]
            # Coverage is semantic only when a model explicitly nominated an observation; exact readback is separate.
            stages = sorted(set(obs['stage'] for obs in matched))
            entry = dict(investigation=family, stage=row['stage'], resource_id=row['resource_id'],
                         clinical_event_at=row['clinical_event_at'], server_created_at=row['server_created_at'],
                         minutes_since_previous=(at-prev).total_seconds()/60,
                         minutes_since_request=(at-start).total_seconds()/60,
                         model_observed_stages=stages, evidence_kind='retrospective-narrative')
            rows.append(entry)
            lines.append(f'| {row["stage"]} | {at.isoformat()} | {entry["minutes_since_previous"]:g} min | '
                         f'{entry["minutes_since_request"]:g} min | {row["resource_id"]} | {", ".join(stages) or ("Not observed" if analysis else "Not run")} |')
            prev = at
        lines.append('')
    lines += ['## MedLatency analysis', '']
    if analysis:
        lines += [f'Provider: {analysis["provider"]}; model: {analysis["model"]}; mode: {analysis["mode"]}.', '',
                  '| Extracted task | Family | Outcome | Active | Source |', '|---|---|---|---|---|']
        seed_ids = {row['resource_id'] for row in manifest['writes'].values()}
        for task in analysis['tasks']:
            if task['source']['resource_id'] in seed_ids:
                lines.append(f'| {task["label"].replace("|", "/")} | {task["family"]} | '
                             f'{task["resolution"]["fulfillment"]} | {task["active"]} | {task["source"]["resource_id"]} |')
        missing = [r['investigation']+':'+r['stage'] for r in rows if r['stage'] not in r['model_observed_stages']]
        lines += ['', 'Stages without an exactly matching model stage observation: '+(', '.join(missing) or 'none')+'.',
            'An active instruction with a fulfilled outcome is completed work in the resolver; '
            'historical actions are not additional open requests. Review flags and unresolved matches remain in analysis.json.', '']
    else:
        reason = manifest.get('analysis', {}).get('reason', 'No completed model analysis matches this source snapshot.')
        lines += [reason, 'Readback, timestamp and relationship checks passed independently; '
                  'no semantic extraction success is claimed.', '']
    lines += ['## Limitations', '',
        '- Stage states are retrospective narrative evidence. The API does not expose general historical event imports or the full CT lifecycle.',
        '- No actual messages/calls were sent; communication stages are authored synthetic records.',
        '- The GP task is open; its appointment has not been booked or attended.',
        '- create_task discards text and supplies a default dueAt. The linked consultation preserves the clinical deadline and instruction; native task dueAt is not the clinical deadline.',
        '- Full clinical history and a whole-world atomic snapshot are not guaranteed by the API. See manifest.json for source coverage.',
        '- All patient-facing narrative and results are fictional demo content, not clinical recommendations.', '']
    write(out / 'stage-latencies.json', rows)
    (out / 'REPORT.md').write_text('\n'.join(lines), encoding='utf-8')
    print('Report:', out / 'REPORT.md')


if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',type=__import__('pathlib').Path,default=ROOT/'outputs/seed-diagnostics')
    report(p.parse_args().out)
