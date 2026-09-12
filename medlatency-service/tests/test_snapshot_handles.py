import unittest
import copy
import json
from unittest.mock import patch
from backend.providers import restore_snapshot_handles, resource_groups, resolve_unique_quote_pointers, OpenAICompatibleProvider, ReplayProvider
from backend.common import ROOT, read


class SnapshotHandleTests(unittest.TestCase):
    def output(self, resource='r-1', snapshot='source_0'):
        return {'tasks': [{'source': {'resource_id': resource, 'snapshot_id': snapshot,
                                     'pointer': '/data/text', 'quote': 'exact source'}}],
                'observations': [], 'edges': []}

    def test_exact_handle_restores_snapshot_without_changing_quote(self):
        output = restore_snapshot_handles(self.output(), {'source_0': ('r-1', 'snap_immutable')})
        self.assertEqual(output['tasks'][0]['source']['snapshot_id'], 'snap_immutable')
        self.assertEqual(output['tasks'][0]['source']['quote'], 'exact source')

    def test_handle_cannot_be_used_for_another_resource_or_unknown_snapshot(self):
        for output in (self.output(resource='r-2'), self.output(snapshot='source_99'),
                       self.output(snapshot='snap_guessed')):
            with self.assertRaises(ValueError):
                restore_snapshot_handles(output, {'source_0': ('r-1', 'snap_immutable')})

    def test_multiple_versions_of_one_resource_remain_distinct(self):
        output = restore_snapshot_handles(self.output(snapshot='source_1'),
            {'source_0': ('r-1', 'snap_old'), 'source_1': ('r-1', 'snap_new')})
        self.assertEqual(output['tasks'][0]['source']['snapshot_id'], 'snap_new')

    def test_invalid_citations_trigger_one_model_repair_and_still_require_exact_source(self):
        bundle = read(ROOT/'fixtures/patients/DEMO-005.json')
        valid = ReplayProvider().extract(bundle)
        bad = copy.deepcopy(valid)
        bad['tasks'][0]['source']['pointer'] = '/data/nonexistent'
        bad['tasks'][0]['source']['quote'] = 'This quotation was never present in the source.'
        handles = {f'source_{i}': (r['id'], r['snapshot_id']) for i,r in enumerate(bundle['resources'])}
        with patch.dict('os.environ', {'LLM_API_KEY':'test', 'LLM_MODEL':'test'}):
            provider = OpenAICompatibleProvider()
        with patch.object(provider, 'request', side_effect=[bad, valid]) as request:
            output = provider.validated_request('{}', bundle, handles)
            self.assertEqual(output, valid)
            self.assertIn('validation_feedback', json.loads(request.call_args.args[0]))
        with patch.object(provider, 'request', side_effect=[bad, bad]) as request:
            with self.assertRaisesRegex(ValueError, 'remain invalid'):
                provider.validated_request('{}', bundle, handles)
            self.assertEqual(request.call_count, 2)

    def test_linked_episodes_are_kept_together_without_losing_unlinked_records(self):
        views = [{'id': key, 'snapshot_id': str(i)} for i,key in enumerate(('a','x','b','y','a','z'))]
        groups = resource_groups(views, [{'from':'a','to':'b','relation':'documented_request'}])
        self.assertEqual([[r['id'] for r in group] for group in groups], [['a','b','a'],['x','y','z']])
        self.assertEqual(sum(map(len, groups)), len(views))

    def test_invalid_pointer_resolves_only_unique_exact_text_in_same_snapshot(self):
        output = self.output(snapshot='snap_1')
        ref = output['tasks'][0]['source']
        ref.update(pointer='/data/missing', quote='Exact unchanged source quotation')
        bundle={'resources':[{'id':'r-1','snapshot_id':'snap_1','data':{'script':ref['quote']}}]}
        repairs=resolve_unique_quote_pointers(output,bundle)
        self.assertEqual(ref['pointer'],'/data/script')
        self.assertEqual(repairs[0]['original_pointer'],'/data/missing')
        ref['pointer']='/data/missing'
        bundle['resources'][0]['data']['duplicate']=ref['quote']
        self.assertEqual(resolve_unique_quote_pointers(output,bundle),[])
        self.assertEqual(ref['pointer'],'/data/missing')
        del bundle['resources'][0]['data']['duplicate']
        ref['snapshot_id']='snap_other'
        self.assertEqual(resolve_unique_quote_pointers(output,bundle),[])
