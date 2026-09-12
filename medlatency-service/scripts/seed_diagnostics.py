"""Patient-specific, append-only Anima seed. Default prepares; --apply performs verified writes."""
import _bootstrap
import argparse
import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.anima import Client, ORIGIN, NoRedirect, discover_patients, fetch_patient, pages
from backend.common import ROOT, digest, read, write, now, instant
from backend.models import validate
from backend.retrospective import MARKER, metadata


def credentials(path):
    """Explicitly selected dotenv only; no shell evaluation, values never printed."""
    values = dict(os.environ)
    if path:
        for line in Path(path).read_text(encoding='utf-8-sig').splitlines():
            key, sep, value = line.strip().partition('=')
            if sep and key in ('ANIMA_SIM_API_KEY', 'ANIMA_API_KEY', 'OPENAI_API_KEY',
                               'LLM_API_KEY', 'LLM_MODEL', 'OPENAI_EXTRACTION_MODEL'):
                values.setdefault(key, value.strip().strip('\"\''))
    return values


def read_gp(client, patient=None):
    params = {'limit': 500}
    if patient:
        params['patient'] = patient
    return [r for items, _, _ in pages(client, '/api/sites/gp/view', params,
                                      'resources', 'resourceTotal') for r in items]


def monday_before(clock):
    # A Tuesday start avoids a weekend and the August bank holiday in this demo.
    candidate = instant(clock).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=13)
    while candidate.weekday() != 1:
        candidate -= timedelta(days=1)
    return candidate


def event_at(start, event):
    hour, minute = map(int, event['time'].split(':'))
    return (start + timedelta(days=event['day'], hours=hour, minutes=minute)).isoformat()


def make_payload(patient, workflow, event, start, request_id='', task=False, context=None):
    reference = f'ML-SEED-{patient}-{workflow["key"].upper()}-v1'
    stamp = event_at(start, event)
    replacements = {
        'reference': reference,
        'collection_at': (start + timedelta(days=1, hours=9, minutes=10)).isoformat(),
        'scan_at': (start + timedelta(days=8, hours=10, minutes=15)).isoformat(),
        'follow_up_deadline': (start + timedelta(days=17, hours=16)).isoformat(),
    }
    meta = dict(patient_id=patient, investigation=reference, stage=event['stage'],
                clinical_event_at=stamp, request_resource_id=request_id,
                evidence_kind='retrospective-narrative', pathway_state='open' if task or event.get('open') else 'completed',
                responsible_role=event['role'])
    prose = event['text'].format(**replacements)
    if event['stage'] == 'requested':
        prose = (context if context is not None else read(ROOT / 'fixtures/seed/diagnostic-episode.json')['context']) + '\n\n' + prose
    text = (MARKER + '\n' + json.dumps(meta, ensure_ascii=False) + '\n\n'
            'SYNTHETIC DEMO: fictional retrospective clinical evidence. '
            'The clinical event time above is separate from the server import/audit time.\n'
            f'Investigation: {reference}. Responsible role: {event["role"]}.\n\n' + prose)
    payload = dict(type='create_task' if task else 'save_consultation', patientId=patient,
                   title=f'SYNTHETIC DEMO | {workflow["label"]} | {"Open follow-up booking" if task else event.get("title", event["stage"])}', text=text)
    if not task:
        payload['consultationStatus'] = 'saved'
    return payload


def post_once(client, payload, idempotency):
    schema = client.spec['components']['schemas']['Action']
    validate(dict(schema, components=client.spec.get('components', {})), payload)
    encoded = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    if len(encoded) > 65536:
        raise ValueError('Action exceeds API body limit')
    req = urllib.request.Request(ORIGIN + '/api/sites/gp/actions', data=encoded,
        headers={'Authorization': 'Bearer ' + client.key, 'Content-Type': 'application/json',
                 'Idempotency-Key': idempotency}, method='POST')
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        status = exc.code
        # Anima errors contain clinical payload at times; save only the status in exceptions.
        exc.close()
        raise ValueError(f'Anima write HTTP {status}; re-read before retrying same key') from None


def post(client, payload, idempotency):
    """Recover uncertain network outcomes by readback before retrying the same key."""
    for attempt in range(3):
        try:
            return post_once(client, payload, idempotency)
        except (TimeoutError, OSError, urllib.error.URLError):
            candidates = [r for r in read_gp(client, payload['patientId'])
                          if r.get('patientId') == payload['patientId'] and r.get('title') == payload['title']]
            if len(candidates) > 1:
                raise ValueError('Multiple records after uncertain write; no retry performed') from None
            if candidates:
                record = candidates[0]
                if payload['type'] != 'create_task' and record.get('data', {}).get('text') != payload['text']:
                    raise ValueError('Conflicting content after uncertain write; no retry performed') from None
                return record
            if attempt == 2:
                raise ValueError('Anima write outcome unresolved after readback and same-key retries') from None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--env-file', type=Path)
    p.add_argument('--out', type=Path, default=ROOT / 'outputs/seed-diagnostics')
    p.add_argument('--apply', action='store_true')
    p.add_argument('--content-file', type=Path, default=ROOT / 'fixtures/seed/diagnostic-episode.json')
    p.add_argument('--analyse', action='store_true')
    p.add_argument('--model', help='Existing configured structured-output model; no implicit model choice')
    args = p.parse_args()
    secrets = credentials(args.env_file)
    key = secrets.get('ANIMA_API_KEY') or secrets.get('ANIMA_SIM_API_KEY')
    if not key:
        raise ValueError('Existing team key required')
    out = args.out.resolve()
    client = Client(key, raw_dir=out / 'raw')
    client.discover()
    team = client.get('/api/team')
    clock = client.get('/api/clock')
    content = read(args.content_file)
    pid = content['patient_id']
    patient = discover_patients(client, 'gp', patient_id=pid)[0]
    if patient.get('synthetic') is not True or patient.get('death'):
        raise ValueError('Seed requires an existing living synthetic patient')
    age = (instant(clock['now']).date() - datetime.fromisoformat(patient['birthDate']).date()).days / 365.2425
    if age < 18 or patient.get('name') != content.get('patient_name', 'Eleanor Chen'):
        raise ValueError('Authored episode does not match selected adult patient')
    manifest_path = out / 'manifest.json'
    if manifest_path.exists():
        manifest = read(manifest_path)
        if (manifest['world'] != team['world'] or manifest['patient_id'] != pid
                or manifest['content_sha256'] != digest(content)):
            raise ValueError('World, patient or authored content differs from manifest')
        start = instant(manifest['episode_start'])
    else:
        start = monday_before(clock['now'])
        manifest = dict(patient_id=pid, patient_name=patient['name'], team=team['team'],
            world=team['world'], episode_start=start.isoformat(), simulation_as_of=clock['now'],
            content_sha256=digest(content), created_at=now(), writes={})
        write(manifest_path, manifest)
    gp_before = read_gp(client, pid)
    # Check a neighbouring sentinel patient as well as enforcing patientId on every write.
    # Do not download the entire multi-thousand-patient world for a one-patient seed.
    sentinel_before = read_gp(client, 'SIM-000009')
    if not (out / 'before.json').exists():
        bundle = fetch_patient(client, patient, team['scopes'])
        write(out / 'before.json', bundle)
        write(out / 'patient.json', patient)
    others_before = {r['id']: digest(r) for r in sentinel_before if r.get('patientId') == 'SIM-000009'}
    existing = {r['title']: r for r in gp_before if r.get('patientId') == pid}
    prepared = []
    receipts = []
    roots = {}
    def submit(workflow, event, task=False):
        action_key = workflow['key'] + ':' + ('followup-task' if task else event.get('key', event['stage']))
        payload = make_payload(pid, workflow, event, start, roots.get(workflow['key'], ''), task, context=content['context'])
        validate(dict(client.spec['components']['schemas']['Action'],
                      components=client.spec.get('components', {})), payload)
        if instant(event_at(start, event)) > instant(clock['now']):
            raise ValueError('Completed clinical event is after simulation clock')
        prepared.append(payload)
        record = existing.get(payload['title'])
        if record:
            if not task and record.get('data', {}).get('text') != payload['text']:
                raise ValueError('Existing seed title has different content; no overwrite performed')
            outcome = 'already_present'
        elif args.apply:
            request_key = f'{team["world"]}:{pid}:diagnostic-demo-v1:{action_key}'
            record = post(client, payload, request_key)
            if record.get('patientId') != pid or not record.get('id'):
                raise ValueError('Unexpected write receipt patient or resource')
            outcome = 'created'
            existing[payload['title']] = record
        else:
            return
        if event['stage'] == 'requested':
            roots[workflow['key']] = record['id']
        manifest['writes'][action_key] = dict(resource_id=record['id'], version=record['version'],
            action=payload['type'], site='gp', patient_id=pid, clinical_event_at=event_at(start, event),
            server_created_at=record.get('createdAt'), payload_sha256=digest(payload), outcome=outcome,
            stage=event['stage'], investigation=workflow['key'], evidence='native-task' if task else 'retrospective-narrative')
        write(manifest_path, manifest)
        receipts.append(record)
        print(action_key, outcome, record['id'], flush=True)
        return record
    for workflow in content['workflows']:
        for event in workflow['events']:
            submit(workflow, event)
    followup = dict(stage='follow_up_assigned', day=10, time='11:35', role='Practice care coordinator',
        text=content.get('followup_text', 'Outstanding instruction: Please book a GP symptom and weight review by {follow_up_deadline}. '
             'The practice care coordinator owns the booking. Contact Eleanor by landline; provide step-free access '
             'and avoid Thursday morning. This follows CT report review and communication already documented in '
             'investigation {reference}. Booking and attendance have not yet occurred. This task remains OPEN; '
             'the retrospective CT investigation is complete. No new blood test or CT order is requested.'))
    native_task = submit(content['workflows'][1], followup, task=True)
    # Live create_task preserves title but discards text; keep clinical details in a
    # supported consultation explicitly referencing the single native task.
    linked = dict(followup, key='followup-instruction', title='Follow-up booking instruction', open=True,
                  text=followup['text'] + '\nLinked native open task: ' +
                  (native_task['id'] if native_task else '(returned task ID inserted on apply)') + '.')
    submit(content['workflows'][1], linked)
    write(out / 'payloads.json', prepared)
    if not args.apply:
        print('Prepared', len(prepared), 'actions for', pid, 'in', team['world'], '(no writes)')
        return
    after = fetch_patient(client, patient, team['scopes'])
    write(out / 'after.json', after)
    by_id = {r['id']: r for r in after['resources']}
    for receipt in receipts:
        saved = by_id.get(receipt['id'])
        if (not saved or saved['data'].get('text') != receipt['data'].get('text')
                or saved['patient_id'] != pid):
            raise ValueError('Readback mismatch')
        if saved['kind'] == 'task':
            if saved['source_status'] != 'open':
                raise ValueError('Follow-up native task must remain open')
            continue
        if metadata(saved['native']) is None:
            raise ValueError('Retrospective metadata missing on consultation')
        if saved['clinical_event_at'] != metadata(saved['native'])['clinical_event_at']:
            raise ValueError('Clinical event timestamp normalization failed')
    gp_after = read_gp(client, 'SIM-000009')
    others_after = {r['id']: digest(r) for r in gp_after if r.get('patientId') == 'SIM-000009'}
    if others_before != others_after:
        raise ValueError('Other GP patient resources changed during run; inspect before claiming isolation')
    final_clock = client.get('/api/clock')
    manifest.update(verified_at=now(), verified_resources=len(receipts), sentinel_patient_unchanged='SIM-000009',
                    isolation_basis=f'Every POST constrained to {pid}; neighbouring GP patient snapshot unchanged. Not a whole-world audit.',
                    clock_before=clock['now'], clock_after=final_clock['now'],
                    readback_coverage=after['coverage'], write_routes=['POST /api/sites/gp/actions'])
    manifest['task_api_limitations'] = ['create_task discards text; clinical instruction is in a linked consultation.',
        'Native dueAt uses server defaults; the clinical booking deadline is explicitly stated in the linked note.']
    write(manifest_path, manifest)
    from backend.store import Store
    from backend.engine import presentation
    from backend.export import html
    store = Store()
    store.import_bundle(after)
    view = presentation(after, None)
    write(out / 'presentation.json', view)
    (out / 'patient.html').write_text(html(view), encoding='utf-8')
    if args.analyse:
        from backend.providers import OpenAICompatibleProvider
        os.environ['LLM_API_KEY'] = secrets.get('LLM_API_KEY') or secrets.get('OPENAI_API_KEY', '')
        os.environ['LLM_MODEL'] = args.model or secrets.get('LLM_MODEL') or secrets.get('OPENAI_EXTRACTION_MODEL', '')
        if not os.environ['LLM_API_KEY'] or not os.environ['LLM_MODEL']:
            manifest['analysis'] = dict(status='blocked', reason='Model API key or model is not configured; no live model extraction was performed.')
            write(manifest_path, manifest)
            from report_diagnostic_seed import report
            report(out)
            print('Seed verified. Model analysis blocked: configure the model API key locally.')
            return
        provider = OpenAICompatibleProvider()
        print('Running live MedLatency analysis with', provider.model, flush=True)
        aid, analysis = store.run(pid, provider)
        write(out / 'analysis.json', analysis)
        view = presentation(after, analysis)
        write(out / 'presentation.json', view)
        (out / 'patient.html').write_text(html(view), encoding='utf-8')
        manifest['analysis'] = dict(status='completed', id=aid, provider=analysis['provider'], model=analysis['model'],
                                    task_count=len(analysis['tasks']))
        write(manifest_path, manifest)
    from report_diagnostic_seed import report
    report(out)
    print('Verified', len(receipts), 'resources for', pid, 'in', team['world'])


if __name__ == '__main__':
    main()
