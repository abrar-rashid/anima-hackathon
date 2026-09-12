"""Report extraction, matching and resolution separately; replay tests are not LLM accuracy."""
import _bootstrap
from backend.common import ROOT,read,write
from backend.providers import ReplayProvider
from backend.engine import analyse

expected=read(ROOT/'fixtures/expected/scenarios.json');report={'mode':'authored_fixture_replay','claim':'Contract/scenario evaluation only; no clinical or generalized model accuracy claim.','patients':[]}
for pid,e in expected.items():
    if pid=='label':continue
    b=read(ROOT/'fixtures/patients'/(pid+'.json'));p=ReplayProvider();a=analyse(b,p.extract(b),p);tasks={t['key']:t for t in a['tasks']}
    matches=[c for t in tasks.values() for c in t['candidates']]
    report['patients'].append({'patient_id':pid,'extraction':{'actual_mentions':len(tasks),'expected_mentions':e['task_count'],'count_pass':len(tasks)==e['task_count']},
        'matching':{'accepted_candidates':sum(c['accepted'] for c in matches),'review_candidates':sum(c['review_required'] for c in matches),
                    'unsafe_old_result_matches':sum(c['accepted'] and 'Evidence predates this request' in c['conflicting_attributes'] for c in matches)},
        'stage_resolution':{'checks':len(e['fulfillment']),'passed':sum(tasks[k]['resolution']['fulfillment']==v for k,v in e['fulfillment'].items())}})
write(ROOT/'outputs/evaluation.json',report)
print('Extraction counts:',sum(x['extraction']['count_pass'] for x in report['patients']),'/ 9')
print('Matching unsafe old-result acceptances:',sum(x['matching']['unsafe_old_result_matches'] for x in report['patients']))
print('Resolution checks:',sum(x['stage_resolution']['passed'] for x in report['patients']),'/',sum(x['stage_resolution']['checks'] for x in report['patients']))
