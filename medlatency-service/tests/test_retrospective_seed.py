import copy
import json
import unittest
from backend.retrospective import MARKER, metadata
from backend.anima import normalize_resource, fetch_patient, FetchError
from backend.common import read, ROOT, instant


class RetrospectiveTests(unittest.TestCase):
    def native(self):
        meta = dict(patient_id='SIM-000006', investigation='ML-SEED-SIM-000006-CT-v1',
                    stage='images_available', clinical_event_at='2026-09-09T10:40:00+00:00',
                    request_resource_id='request-1', evidence_kind='retrospective-narrative',
                    pathway_state='completed')
        return dict(id='event-1', patientId='SIM-000006', kind='encounter', status='saved',
                    createdAt=1789399200000, data={'text': MARKER+'\n'+json.dumps(meta)+'\n\nImages available.'})

    def test_explicit_event_separate_from_audit_and_native_preserved(self):
        native = self.native()
        before = copy.deepcopy(native)
        resource = normalize_resource(native, {'endpoint': '/api/sites/gp/view'}, 'SIM-000006')
        self.assertEqual(resource['clinical_event_at'], '2026-09-09T10:40:00+00:00')
        self.assertEqual(resource['record_created_at'], 1789399200000)
        self.assertEqual(resource['native'], before)
        self.assertEqual(resource['source_locations'][-1]['pointer'], '/data/text')

    def test_bad_dates_cross_patient_and_ordinary_text_do_not_normalize(self):
        for text in ('Ordinary note 2026-09-09', MARKER+'\nnot json',
                     self.native()['data']['text'].replace('+00:00', ''),
                     self.native()['data']['text'].replace('"patient_id": "SIM-000006"', '"patient_id": "SIM-000007"')):
            native = self.native(); native['data']['text'] = text
            self.assertIsNone(metadata(native))
            self.assertIsNone(normalize_resource(native, {}, 'SIM-000006')['clinical_event_at'])

    def test_templates_preserve_distinct_imaging_and_blood_stages(self):
        content = read(ROOT/'fixtures/seed/diagnostic-episode.json')
        templates = read(ROOT/'config/workflow_templates.json')
        for workflow, family in zip(content['workflows'], ('blood_test','ct_imaging')):
            stages = [event['stage'] for event in workflow['events']]
            self.assertEqual(stages, templates[family]['possible_stages'])
            times = [(event['day'], event['time']) for event in workflow['events']]
            self.assertEqual(times, sorted(times))
            self.assertEqual(len(stages), len(set(stages)))

    def test_links_require_matching_investigation_not_just_patient(self):
        def record(identifier, stage, investigation):
            native = self.native(); native['id'] = identifier
            meta = metadata(native)
            meta.update(stage=stage, investigation=investigation)
            native['data']['text'] = MARKER+'\n'+json.dumps(meta)+'\n\nSynthetic clinical evidence.'
            return native
        blood = 'ML-SEED-SIM-000006-BLOOD-v1'
        ct = 'ML-SEED-SIM-000006-CT-v1'
        records = [record('request-1', 'requested', ct), record('ct-image', 'images_available', ct),
                   record('wrong-blood', 'result_available', blood)]
        class Client:
            last_provenance = {'endpoint': '/api/sites/gp/view'}
            def get(self, path, params=None):
                if path.endswith('/view'):
                    return {'resources': records, 'resourceTotal': len(records), 'resourceOffset': 0}
                if path == '/api/clock': return {'now': 1789399200000, 'events': []}
                raise FetchError('Not included in test')
        bundle = fetch_patient(Client(), {'id': 'SIM-000006', 'synthetic': True}, ['gp'])
        self.assertTrue(any(e['from']=='ct-image' and e['to']=='request-1' for e in bundle['links']))
        self.assertFalse(any(e['from']=='wrong-blood' for e in bundle['links']))


if __name__ == '__main__': unittest.main()
