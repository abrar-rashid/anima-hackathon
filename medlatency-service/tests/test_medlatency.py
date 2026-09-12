import copy
import json
import sys
import tempfile
import uuid
import shutil
import io
import threading
import time
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch

from backend.common import ROOT,digest,read,write
from backend.models import validate_bundle,validate_extraction,verify_ref
from backend.providers import ReplayProvider,OpenAICompatibleProvider
from backend.engine import analyse,presentation,match_candidate,task_id
from backend.store import Store
from backend.export import html
from backend.anima import pages,discover_patients,FetchError,fetch_patient,fetch_run,checkpoint_valid
from backend.server import make_server

TEST_TMP=ROOT/'data/test-tmp'
TEST_TMP.mkdir(parents=True,exist_ok=True)
class temporary_directory:
    # Use inherited Windows ACLs; tempfile's 0700 ACL excludes the sandbox identity.
    def __init__(self):
        self.path=TEST_TMP.resolve()/('test-'+uuid.uuid4().hex)
        self.path.mkdir();self.name=str(self.path)
    def __enter__(self):return self.name
    def __exit__(self,*args):self.cleanup()
    def cleanup(self):
        if self.path.resolve().parent!=TEST_TMP.resolve():raise ValueError('Unsafe test cleanup target')
        shutil.rmtree(self.path)

def fixture(n):return read(ROOT/'fixtures/patients'/f'DEMO-{n:03}.json')
def result(n):
    b=fixture(n);p=ReplayProvider();return analyse(b,p.extract(b),p)

class ScenarioTests(unittest.TestCase):
    def test_independent_expected_interpretations(self):
        expected=read(ROOT/'fixtures/expected/scenarios.json')
        for pid,e in expected.items():
            if pid=='label':continue
            with self.subTest(patient=pid):
                a=result(int(pid[-3:]));tasks={t['key']:t for t in a['tasks']}
                self.assertEqual(len(tasks),e['task_count']);self.assertEqual(sum(t['active'] for t in tasks.values()),e['active_count'])
                for key,state in e['fulfillment'].items():self.assertEqual(tasks[key]['resolution']['fulfillment'],state)
                for key,state in e.get('lifecycle',{}).items():self.assertEqual(tasks[key]['resolution']['lifecycle'],state)
                if 'reviewed_must_be_evidenced' in e:
                    self.assertEqual(any(s['stage']=='reviewed' and s['assessment']=='evidenced' for t in tasks.values() for s in t['stages']),e['reviewed_must_be_evidenced'])
                self.assertGreaterEqual(sum(c['review_required'] for t in tasks.values() for c in t['candidates']),e.get('minimum_ambiguous_matches',0))
    def test_completed_encounter_can_contain_outstanding_instruction(self):
        self.assertEqual(fixture(6)['resources'][1]['source_status'],'completed')
        self.assertTrue(all(t['resolution']['fulfillment']=='unknown' for t in result(6)['tasks']))
    def test_sent_document_does_not_close_tasks(self):
        self.assertEqual(fixture(1)['resources'][0]['source_status'],'sent')
        self.assertNotEqual(result(1)['tasks'][0]['resolution']['fulfillment'],'fulfilled')
    def test_reminder_is_not_paperwork(self):
        a=result(2)['tasks'];self.assertEqual(a[0]['resolution']['fulfillment'],'fulfilled');self.assertEqual(a[1]['resolution']['fulfillment'],'unknown');self.assertTrue(a[1]['work_started'])
    def test_result_is_not_review_or_communication(self):
        t=result(4)['tasks'][0];states={s['stage']:s['assessment'] for s in t['stages']}
        self.assertEqual(states['result_available'],'evidenced');self.assertEqual(states['reviewed'],'not_evidenced');self.assertEqual(states['communicated'],'not_evidenced');self.assertEqual(states['ordered'],'not_evidenced')
    def test_old_result_not_new_request(self):
        for t in result(6)['tasks']:
            old=[c for c in t['candidates'] if c['resource_id']=='old-fbc'][0]
            self.assertFalse(old['accepted']);self.assertIn('Evidence predates this request',old['conflicting_attributes'])
    def test_repeat_requests_distinct(self):self.assertEqual(len({t['id'] for t in result(6)['tasks']}),2)
    def test_negation_inactive(self):self.assertFalse(result(7)['tasks'][1]['active'])
    def test_condition_not_fulfilled(self):self.assertIn('Clarify condition',result(7)['tasks'][0]['resolution']['next_step'])
    def test_preferences_not_transport_order(self):
        tasks=result(3)['tasks'];self.assertEqual(tasks[1]['intent'],'preference');self.assertFalse(any('transport' in t['label'] for t in tasks))
    def test_queued_script_is_not_response(self):
        t=result(9)['tasks'][0];self.assertEqual(t['intent'],'commitment');self.assertEqual(t['resolution']['fulfillment'],'explicitly_not_fulfilled')
    def test_coverage_missing_means_unknown(self):
        b=fixture(6);b['coverage']['sources']=[];a=analyse(b,ReplayProvider().extract(fixture(6)),ReplayProvider())
        self.assertEqual(a['tasks'][0]['resolution']['fulfillment'],'unknown')
    def test_reject_fabricated_span(self):
        b=fixture(1);e=ReplayProvider().extract(b);e['tasks'][0]['source']['quote']='fabricated source'
        with self.assertRaises(ValueError):validate_extraction(e,b)
    def test_reject_invalid_pointer_and_snapshot(self):
        b=fixture(1);e=ReplayProvider().extract(b);ref=e['tasks'][0]['source'];ref['pointer']='/does/not/exist'
        with self.assertRaises(ValueError):verify_ref(ref,b)
        ref['snapshot_id']='wrong'
        with self.assertRaises(ValueError):verify_ref(ref,b)
    def test_reject_patient_mixing(self):
        b=fixture(1);b['resources']+=fixture(2)['resources']
        with self.assertRaises(ValueError):validate_bundle(b)
    def test_reject_event_patient_mixing(self):
        b=fixture(1);b['events']=[{'patient_id':'wrong'}]
        with self.assertRaises(ValueError):validate_bundle(b)
    def test_live_cannot_use_fixture_replay(self):
        b=fixture(1);b['dataset']['mode']='live'
        with self.assertRaises(ValueError):ReplayProvider().extract(b)
    def test_changed_fixture_cannot_silently_replay(self):
        b=fixture(1);b['resources'][0]['data']['text']+=' updated'
        with self.assertRaises(ValueError):ReplayProvider().extract(b)
    def test_source_status_not_fulfillment(self):
        b=fixture(5);e=ReplayProvider().extract(b);o=copy.deepcopy(e['observations'][0]);o['source']['pointer']='/source_status';o['source']['quote']='completed'
        self.assertFalse(match_candidate(e['tasks'][0],o,b)['accepted'])
    def test_future_and_clock_conflicts(self):
        b=fixture(5);e=ReplayProvider().extract(b);o=e['observations'][-1];r=next(r for r in b['resources'] if r['id']==o['source']['resource_id']);r['clinical_event_at']='2027-01-01T00:00:00Z'
        self.assertFalse(match_candidate(e['tasks'][0],o,b)['accepted']);r['clock']='wall'
        self.assertFalse(match_candidate(e['tasks'][0],o,b)['accepted'])
    def test_cycle_rejected(self):
        b=fixture(1);e=ReplayProvider().extract(b);edge=copy.deepcopy(e['edges'][0]);edge['from_key'],edge['to_key']=edge['to_key'],edge['from_key'];e['edges'].append(edge)
        with self.assertRaises(ValueError):validate_extraction(e,b)
    def test_identity_survives_version_and_label(self):
        t=result(5)['tasks'][0];old=task_id('DEMO-005',t);t['label']='New wording';t['source']['snapshot_id']='changed';self.assertEqual(task_id('DEMO-005',t),old)
    def test_standalone_safe_embedded_data(self):
        for n in [1,4,5,6,9]:
            b=fixture(n);p=presentation(b,result(n));p['overview']['context'].append('</script><img src=x onerror=alert(1)>');h=html(p)
            self.assertNotIn('</script><img',h);self.assertIn('\\u003c/script',h);self.assertIn('const OFFLINE={',h);self.assertNotIn('src="http',h)
    def test_endpoint_any_and_unknown_family(self):
        b=fixture(5);e=ReplayProvider().extract(b);e['tasks'][0].update(family='novel_family',fulfillment_rule='any',required_stages=['unobserved','result_available'])
        t=analyse(b,e,ReplayProvider())['tasks'][0];self.assertEqual(t['resolution']['fulfillment'],'fulfilled')
    def test_earlier_pending_not_projected_forward(self):
        t=result(1)['tasks'][2];self.assertEqual(t['resolution']['fulfillment'],'fulfilled')
        stage=next(s for s in t['stages'] if s['stage']=='requested');self.assertEqual(len(stage['historical_assertions']),1)
        self.assertTrue(result(1)['tasks'][0]['work_started'])
    def test_same_time_conflicting_snapshots_remain_disputed(self):
        b=fixture(1);e=ReplayProvider().extract(b);b['resources'][1]['clinical_event_at']=b['resources'][0]['clinical_event_at']
        t=analyse(b,e,ReplayProvider())['tasks'][2];self.assertEqual(t['resolution']['fulfillment'],'disputed')
    def test_cancel_after_reopen_wins_by_event_time(self):
        b=fixture(8);e=ReplayProvider().extract(b);b['resources'][1]['clinical_event_at']='2026-09-12T09:00:00Z'
        t=analyse(b,e,ReplayProvider())['tasks'][0];self.assertEqual(t['resolution']['lifecycle'],'cancelled');self.assertFalse(t['active'])
    def test_unsupported_deadline_cannot_make_task_overdue(self):
        b=fixture(6);e=ReplayProvider().extract(b);e['tasks'][0]['deadline']='2026-08-01T00:00:00Z'
        t=analyse(b,e,ReplayProvider())['tasks'][0];self.assertFalse(t['overdue']);self.assertIsNone(t['deadline'])

class PersistenceTests(unittest.TestCase):
    def setUp(self):self.tmp=temporary_directory();self.store=Store(Path(self.tmp.name)/'test.sqlite3');self.store.import_bundle(fixture(6));self.aid,self.a=self.store.run('DEMO-006',ReplayProvider())
    def tearDown(self):self.tmp.cleanup()
    def decision(self,op,payload={},tid=None):return self.store.review('DEMO-006',{'task_id':tid or self.a['tasks'][0]['id'],'operation':op,'payload':payload,'reviewer':'Synthetic reviewer','explanation':'Test local decision'})
    def test_idempotent_preserves_review_history(self):
        self.decision('correct',{'responsible':'GP team'});self.store.import_bundle(fixture(6));aid,a=self.store.run('DEMO-006',ReplayProvider());self.assertEqual(aid,self.aid);self.assertEqual(len(a['tasks']),2);self.assertEqual(a['tasks'][0]['responsible'],'GP team');self.assertEqual(len(a['review_history']),1)
        with self.store.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM analyses').fetchone()[0],1)
    def test_accept_reject_candidate_persist(self):
        c=next(c for c in self.a['tasks'][0]['candidates'] if c['resource_id']=='old-fbc');self.decision('reject_match',{'candidate_id':c['id']});t=self.store.latest('DEMO-006')['tasks'][0]
        self.assertFalse(next(x for x in t['candidates'] if x['id']==c['id'])['review_required'])
    def test_dispute(self):self.decision('dispute');self.assertEqual(self.store.latest('DEMO-006')['tasks'][0]['resolution']['fulfillment'],'disputed')
    def test_merge_retains_original(self):
        self.decision('merge',{'other_task_id':self.a['tasks'][1]['id']});a=self.store.latest('DEMO-006');self.assertFalse(a['tasks'][1]['active']);self.assertIn('original_interpretation',a['tasks'][0]);self.assertEqual(len(a['tasks'][0]['merged_mentions']),1)
    def test_split_usable_without_invented_evidence(self):
        self.decision('split',{'children':[{'label':'Arrange','outcome':'Order test','required_stages':['ordered']},{'label':'Review','outcome':'Review result','required_stages':['reviewed']}]})
        a=self.store.latest('DEMO-006');self.assertEqual(len(a['tasks']),4);self.assertFalse(a['tasks'][0]['active']);self.assertEqual(a['tasks'][-1]['resolution']['fulfillment'],'unknown')
    def test_changed_sources_flag_corrections(self):
        self.decision('correct',{'family':'external_document'});b=fixture(6);b['dataset']['captured_at']='2026-09-13T12:00:00Z';self.store.import_bundle(b)
        class Stub(ReplayProvider):
            def extract(self,bundle):return ReplayProvider().extract(fixture(6))
        _,a=self.store.run('DEMO-006',Stub());self.assertEqual(a['tasks'][0]['family'],'external_document');self.assertTrue(any('Source changed' in f for f in a['tasks'][0]['review_flags']))
    def test_review_cross_patient_rejected(self):
        with self.assertRaises(ValueError):self.decision('merge',{'other_task_id':result(1)['tasks'][0]['id']})
    def test_invalid_output_not_cached(self):
        class Bad(ReplayProvider):
            model='invalid'
            def extract(self,b):e=super().extract(b);e['tasks'][0]['source']['quote']='invented';return e
        with self.assertRaises(ValueError):self.store.run('DEMO-006',Bad())
        with self.store.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM cache').fetchone()[0],1)
    def test_new_import_does_not_show_stale_analysis(self):
        b=fixture(6);b['dataset']['captured_at']='2026-09-13T00:00:00Z';self.store.import_bundle(b)
        self.assertIsNone(self.store.latest('DEMO-006'));self.assertEqual(self.store.patients()[0]['readiness'],'needs_analysis')
    def test_correct_intent_changes_active_membership(self):
        self.decision('correct',{'intent':'negated'});self.assertFalse(self.store.latest('DEMO-006')['tasks'][0]['active'])

class ProviderTests(unittest.TestCase):
    def test_structured_model_adapter_validates_output(self):
        extraction=ReplayProvider().extract(fixture(5));captured=[]
        class Opener:
            def open(self,request,timeout):
                captured.append(json.loads(request.data))
                return io.BytesIO(json.dumps({'choices':[{'finish_reason':'stop','message':{'content':json.dumps(extraction)}}]}).encode())
        with patch.dict('os.environ',{'LLM_API_KEY':'test-key-not-real','LLM_MODEL':'test-model','LLM_BASE_URL':'https://api.openai.com/v1'}),patch('urllib.request.build_opener',return_value=Opener()):
            provider=OpenAICompatibleProvider();output=provider.extract(fixture(5))
        self.assertEqual(captured[0]['response_format']['type'],'json_schema');self.assertTrue(captured[0]['response_format']['json_schema']['strict']);self.assertEqual(output['tasks'][0]['key'],'b0_fbc-workflow');self.assertNotIn('test-key-not-real',json.dumps(output))
    def test_model_refusal_is_explicit_failure(self):
        class Opener:
            def open(self,*args,**kwargs):return io.BytesIO(b'{"choices":[{"finish_reason":"stop","message":{"refusal":"refused"}}]}')
        with patch.dict('os.environ',{'LLM_API_KEY':'test','LLM_MODEL':'test-model'}),patch('urllib.request.build_opener',return_value=Opener()):
            with self.assertRaisesRegex(ValueError,'refused'):OpenAICompatibleProvider().extract(fixture(5))

class FakeClient:
    def __init__(self,responses):self.responses=iter(responses);self.last_provenance={'endpoint':'fake','retrieved_at':'2026-09-12T12:00:00Z'};self.queries=[]
    def get(self,path,params=None):self.queries.append((path,params));return next(self.responses)

class AdapterTests(unittest.TestCase):
    def test_offset_pages(self):
        c=FakeClient([{'items':[{'id':'A'}],'total':2},{'items':[{'id':'B'}],'total':2}]);self.assertEqual(len(list(pages(c,'/api/test',{},'items','total'))),2);self.assertEqual(c.queries[-1][1]['offset'],1)
    def test_repeated_pages_rejected(self):
        c=FakeClient([{'items':[{'id':'A'}],'total':3}]*3)
        with self.assertRaises(FetchError):list(pages(c,'/api/test',{},'items','total'))
    def test_changed_total_rejected(self):
        c=FakeClient([{'items':[{'id':'A'}],'total':3},{'items':[{'id':'B'}],'total':4}])
        with self.assertRaises(FetchError):list(pages(c,'/api/test',{},'items','total'))
    def test_short_cohort_not_success(self):
        c=FakeClient([{'items':[{'id':'A'}],'total':1}])
        with self.assertRaises(FetchError):discover_patients(c,'gp',count=100)
    def test_empty_partial_page_rejected(self):
        c=FakeClient([{'items':[],'total':1}])
        with self.assertRaises(FetchError):list(pages(c,'/api/test',{},'items','total'))
    def test_partial_scope_and_no_patient_mixing(self):
        class C:
            last_provenance={'endpoint':'fake','retrieved_at':'today'}
            def get(self,path,params=None):
                if path.endswith('/view'):
                    records=[{'id':'own','patientId':'P','kind':'note','data':{}},{'id':'other','patientId':'Q','kind':'note','data':{}},{'id':'shared','kind':'service','data':{}}]
                    return {'resources':records,'resourceTotal':3,'resourceOffset':0}
                if path=='/api/clock':return {'now':1234567890000,'events':[]}
                raise FetchError('Unavailable')
        b=fetch_patient(C(),{'id':'P','synthetic':True},['gp']);self.assertEqual([r['id'] for r in b['resources']],['own']);self.assertEqual(len(b['shared_context']),1);self.assertFalse(all(c['complete'] for c in b['coverage']['sources']))
    def test_resume_skips_valid_complete_and_retries_partial(self):
        class C:
            def discover(self):pass
            def get(self,path):return {'scopes':['gp'],'team':'T','world':'W'}
        with temporary_directory() as tmp:
            b=fixture(1);b['dataset']['mode']='live';b['coverage']['sources']=[{'complete':True}]
            with patch('backend.anima.discover_patients',return_value=[b['patient']]),patch('backend.anima.fetch_patient',return_value=b) as fetch:
                m=fetch_run(C(),tmp,count=1);self.assertEqual(m['saved_count'],1);fetch_run(C(),tmp,count=1,resume=True);self.assertEqual(fetch.call_count,1)
                m['patients']['DEMO-001']['status']='partial';write(Path(tmp)/'manifest.json',m);fetch_run(C(),tmp,count=1,resume=True);self.assertEqual(fetch.call_count,2)
    def test_resume_detects_tampering(self):
        with temporary_directory() as tmp:
            p=Path(tmp)/'b.json';b=fixture(1);b['dataset']['mode']='live';write(p,b);self.assertTrue(checkpoint_valid(p,{'fingerprint':digest(b)}));self.assertFalse(checkpoint_valid(p,{'fingerprint':'wrong'}))

class APITests(unittest.TestCase):
    def setUp(self):
        self.tmp=temporary_directory();self.store=Store(Path(self.tmp.name)/'api.sqlite3')
        for n in (1,5,6):self.store.import_bundle(fixture(n));self.store.run(f'DEMO-{n:03}',ReplayProvider())
        self.server=make_server(self.store,port=0);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start();self.base='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):self.server.shutdown();self.server.server_close();self.server.worker_pool.shutdown();self.thread.join();self.tmp.cleanup()
    def get(self,path):
        with urllib.request.urlopen(self.base+path,timeout=5) as r:return json.load(r)
    def test_patient_switching_and_complete_presentation(self):
        self.assertEqual(len(self.get('/api/patients')['patients']),3)
        for pid in ('DEMO-001','DEMO-005','DEMO-006'):
            p=self.get('/api/patients/'+pid+'/overview');self.assertEqual(p['overview']['patient']['id'],pid);self.assertTrue(all(r['patient_id']==pid for r in p['evidence']))
    def test_task_detail_graph_evidence_and_filter(self):
        root='/api/patients/DEMO-001';t=self.get(root+'/tasks')['tasks'][0];self.assertTrue(self.get(root+'/tasks/'+t['id']+'/graph')['edges']);self.assertTrue(self.get(root+'/evidence')['index'])
        self.assertEqual(self.get('/api/patients/DEMO-005/tasks?filter=unresolved')['tasks'],[])
        with self.assertRaises(urllib.error.HTTPError):self.get('/api/patients/DEMO-005/tasks/'+t['id'])
    def test_export_and_async_job(self):
        with urllib.request.urlopen(self.base+'/api/patients/DEMO-005/export') as r:self.assertIn(b'const OFFLINE={',r.read())
        req=urllib.request.Request(self.base+'/api/patients/DEMO-005/analyses',data=b'{"provider":"replay"}',headers={'Content-Type':'application/json'},method='POST')
        with urllib.request.urlopen(req) as r:self.assertEqual(r.status,202);job=json.load(r)
        for _ in range(50):
            state=self.get('/api/jobs/'+job['job_id'])
            if state['status'] in ('completed','failed'):break
            time.sleep(.02)
        self.assertEqual(state['status'],'completed')
    def test_cross_origin_write_rejected(self):
        req=urllib.request.Request(self.base+'/api/bundles',data=json.dumps(fixture(2)).encode(),headers={'Content-Type':'application/json','Origin':'https://other.example'},method='POST')
        with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(req)
        self.assertEqual(e.exception.code,403)

if __name__=='__main__':unittest.main()
