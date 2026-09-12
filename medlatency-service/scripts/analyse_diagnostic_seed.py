"""Analyse the verified seed readback without repeating any Anima writes."""
import _bootstrap
import argparse
import os
from pathlib import Path

from backend.common import ROOT, read, write, digest
from backend.engine import presentation
from backend.export import html
from backend.models import validate_bundle
from backend.providers import OpenAICompatibleProvider
from backend.store import Store
from report_diagnostic_seed import report
from seed_diagnostics import credentials


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--out', type=Path, default=ROOT/'outputs/seed-diagnostics')
    args = parser.parse_args()
    secrets = credentials(args.env_file)
    os.environ['LLM_API_KEY'] = secrets.get('LLM_API_KEY') or secrets.get('OPENAI_API_KEY', '')
    os.environ['LLM_MODEL'] = args.model
    provider = OpenAICompatibleProvider()
    out = args.out.resolve()
    bundle = validate_bundle(read(out/'after.json'))
    manifest = read(out/'manifest.json')
    pid = bundle['patient']['id']
    if pid != manifest['patient_id'] or pid != 'SIM-000006':
        raise ValueError('Patient does not match the verified single-patient seed')
    print('Model key configured. Analysing', pid, 'with', provider.model,
          'from', len(bundle['resources']), 'verified source records.', flush=True)
    # Retain actual returned model JSON for source-span debugging, never credentials.
    original_request = provider.request
    batches = []
    def capture_request(payload):
        print('Model request', len(batches)+1, flush=True)
        output = original_request(payload)
        batches.append(output)
        write(out/'model-batches.json', batches)
        return output
    provider.request = capture_request
    store = Store()
    store.import_bundle(bundle)
    try:
        aid, analysis = store.run(pid, provider)
    except ValueError as exc:
        manifest['analysis'] = dict(status='failed', reason=str(exc), model=provider.model,
                                   input_fingerprint=digest(bundle))
        write(out/'manifest.json', manifest)
        report(out)
        raise
    write(out/'analysis.json', analysis)
    view = presentation(bundle, analysis)
    write(out/'presentation.json', view)
    (out/'patient.html').write_text(html(view), encoding='utf-8')
    manifest['analysis'] = dict(status='completed', id=aid, provider=analysis['provider'],
        model=analysis['model'], task_count=len(analysis['tasks']),
        observation_count=len(analysis['extraction']['observations']), input_fingerprint=digest(bundle),
        citation_pointer_repairs=provider.citation_pointer_repairs)
    write(out/'citation-pointer-repairs.json', provider.citation_pointer_repairs)
    write(out/'manifest.json', manifest)
    report(out)
    print('Completed:', len(analysis['tasks']), 'tasks,',
          len(analysis['extraction']['observations']), 'stage observations.', flush=True)


if __name__ == '__main__':
    main()
