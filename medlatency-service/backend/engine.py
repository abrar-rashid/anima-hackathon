"""Evidence indexing, candidate nomination and conservative deterministic stage resolution."""
from __future__ import annotations
from dataclasses import asdict
import re
from .common import ROOT, digest, now, read, leaves, instant
from .models import Resolution, validate_bundle, validate_extraction, verify_ref, validate, ANALYSIS
from .providers import PROMPT_VERSION

VERSION='1.0.4'
INACTIVE={'negated','historical','preference','cancellation'}

def stage_counts_as_progress(stage,family):
    initial={'diagnostic':{'requested'},'external_document':{'needed'},'document_followup':{'instruction_identified'},
             'appointment':{'requested'},'communication':{'prepared'}}
    return stage not in initial.get(family,{'requested','needed','instruction_identified','prepared'})

def task_id(patient_id,t):
    return 'task_'+digest([patient_id,t['source']['resource_id'],t['source']['pointer'],t['action_key']])[:24]

def index_evidence(bundle):
    return [{'resource_id':r['id'],'snapshot_id':r['snapshot_id'],'pointer':p,'value':v,
             'clinical_event_at':r['clinical_event_at'],'record_created_at':r['record_created_at'],
             'clock':r['clock'],'provenance':r['provenance']}
            for r in bundle['resources'] for p,v in leaves(r['data'],'/data')]

def timeline(bundle,extraction=None):
    rows=[]
    planned_ids={t['source']['resource_id'] for t in (extraction or {}).get('tasks',[]) if t['intent'] in ('instruction','commitment','conditional')}
    for r in bundle['resources']:
        for field,kind in [('clinical_event_at','clinical_event'),('record_created_at','record_metadata')]:
            if r[field] is not None:
                event_kind=('plan' if r['source_status']=='queued' else 'communication' if r['kind'] in ('communication','message') else kind) if kind=='clinical_event' else kind
                if kind=='clinical_event' and r['id'] in planned_ids and event_kind=='clinical_event':event_kind='plan'
                rows.append({'id':'event_'+digest([r['snapshot_id'],field])[:20],'resource_id':r['id'],
                    'snapshot_id':r['snapshot_id'],'time':r[field],'clock':r['clock'],'kind':event_kind,
                    'label':r['title'] if kind=='clinical_event' else 'Record created: '+r['title'],
                    'pointer':'/'+field,'hidden_by_default':kind=='record_metadata'})
    for e in bundle['events']:
        rows.append(dict(e,id=e.get('id','event_'+digest(e)[:20]),hidden_by_default=e.get('kind') in ('audit','record_metadata')))
    return sorted(rows,key=lambda r:(r.get('clock','unknown'),str(r.get('time','')),r['id']))

def reachable(bundle,start,end):
    # Directed native relationship path; never join merely by patient or specialty.
    edges={}
    for e in bundle['links']:
        if e['relation'] not in ('patient','service','context'): edges.setdefault(e['from'],[]).append(e['to'])
    todo=[start];seen=set()
    while todo:
        x=todo.pop()
        if x==end:return True
        if x not in seen: seen.add(x);todo.extend(edges.get(x,[]))
    return False

def match_candidate(task,obs,bundle):
    r=verify_ref(obs['source'],bundle);origin=verify_ref(task['source'],bundle)
    conflicts=[];supports=[]
    native=reachable(bundle,r['id'],origin['id'])
    same=r['id']==origin['id']
    if native: supports.append('Same source or explicit documented resource relationship path')
    if task['item'].casefold()==obs['item'].casefold(): supports.append('Matching interpreted item')
    else: conflicts.append('Different interpreted item')
    # Source metadata is never an endpoint for an embedded action.
    if obs['source']['pointer'] in ('/source_status','/record_created_at','/version'):
        conflicts.append('Source record metadata is not task fulfillment evidence')
    a=instant(origin['clinical_event_at']);b=instant(r['clinical_event_at']);cutoff=instant(bundle['dataset']['simulation_as_of'])
    if not same and a and b and origin['clock']==r['clock'] and b<a:
        conflicts.append('Evidence predates this request')
    if b and cutoff and r['clock']=='simulation' and b>cutoff: conflicts.append('Evidence is after clinical as-of time')
    if not same and origin['clock']!=r['clock']: conflicts.append('Incomparable clock domains')
    documented=any(e['from']==r['id'] and e['relation']=='documented_request' for e in bundle['links'])
    basis=('documented_relationship' if documented else 'native_relationship') if native else 'semantic_candidate'
    accepted=native and not conflicts
    return {'id':'match_'+digest([task['key'],obs])[:22], 'observation':obs,'resource_id':r['id'],
            'snapshot_id':r['snapshot_id'],'basis':basis,'confidence':'strong' if accepted else 'uncertain',
            'event_time':r['clinical_event_at'],'clock':r['clock'],
            'supporting_attributes':supports,'conflicting_attributes':conflicts,
            'review_required':not accepted,'accepted':accepted,'decision_origin':'deterministic_rules'}

def retrieve_candidates(task,bundle,observed):
    """Lexical retrieval nominates additional unclassified records. It cannot fulfill stages."""
    words=set(re.findall(r'[a-z0-9]+',task['item'].lower()))-{'the','a','and','of','for'}
    rows=[]
    for r in bundle['resources']:
        if r['snapshot_id'] in observed or r['id']==task['source']['resource_id']:continue
        text=' '.join(str(v) for _,v in leaves(r['data']))+' '+r['title']
        tokens=set(re.findall(r'[a-z0-9]+',text.lower()))
        if words and len(words&tokens)/len(words)>=.6:
            rows.append({'id':'match_'+digest([task['key'],r['snapshot_id']])[:22], 'observation':None,
                'resource_id':r['id'],'snapshot_id':r['snapshot_id'],'basis':'textual_similarity',
                'confidence':'uncertain','supporting_attributes':['Overlapping item terms'],
                'conflicting_attributes':['No validated stage observation; similarity cannot establish fulfillment'],
                'review_required':True,'accepted':False,'decision_origin':'candidate_retrieval'})
    return rows[:20]

def resolve(task,candidates,template):
    stages=list(dict.fromkeys(template.get('possible_stages',[])+task['required_stages']+
                            [c['observation']['stage'] for c in candidates if c['observation']]))
    accepted_candidates=[c for c in candidates if c['accepted'] and c['observation']]
    accepted=[c['observation'] for c in accepted_candidates]
    states=[]
    for stage in stages:
        stage_candidates=[c for c in accepted_candidates if c['observation']['stage']==stage]
        facts=[c['observation'] for c in stage_candidates]
        current=facts
        times=[instant(c.get('event_time')) for c in stage_candidates]
        # Earlier pending assertions stay in the evidence panel, but do not override
        # a later explicit outcome at a comparable clinical time. Never use creation time.
        if times and all(times) and len({c.get('clock') for c in stage_candidates})==1:
            latest=max(times)
            current=[c['observation'] for c,at in zip(stage_candidates,times) if at==latest]
        polarities={o['polarity'] for o in current}
        assessment=('conflicting' if 'conflicts' in polarities or {'supports','pending'}<=polarities else
                    'explicitly_pending' if 'pending' in polarities else 'evidenced' if 'supports' in polarities else
                    'not_applicable' if 'not_applicable' in polarities else 'not_evidenced')
        states.append({'stage':stage,'assessment':assessment,'required':stage in task['required_stages'],
                       'expectation_origin':'task_interpretation' if stage in task['required_stages'] else 'template_suggestion',
                       'evidence':[o['source'] for o in facts],
                       'historical_assertions':[o['source'] for o in facts if o not in current]})
    status={s['stage']:s['assessment'] for s in states}
    required=[status[s] for s in task['required_stages']]
    fulfilled=(all(s in ('evidenced','not_applicable') for s in required) if task['fulfillment_rule']=='all' else any(s=='evidenced' for s in required))
    lifecycle_candidates=[c for c in accepted_candidates if c['observation']['lifecycle']!='active']
    times=[instant(c.get('event_time')) for c in lifecycle_candidates]
    if times and all(times) and len({c.get('clock') for c in lifecycle_candidates})==1:
        latest=max(times);lifecycle_candidates=[c for c,at in zip(lifecycle_candidates,times) if at==latest]
    lifecycle_values={c['observation']['lifecycle'] for c in lifecycle_candidates}
    lifecycle='active'
    if len(lifecycle_values)==1:lifecycle=next(iter(lifecycle_values))
    elif len(lifecycle_values)>1:lifecycle='conflicting'
    conflict='conflicting' in required or lifecycle=='conflicting'
    conditional=task['intent']=='conditional'
    inactive=task['intent'] in INACTIVE
    assessment=('not_applicable' if inactive else 'conflicting' if conflict else
                'explicitly_pending' if 'explicitly_pending' in required else 'evidenced' if fulfilled else 'not_evidenced')
    outcome='disputed' if conflict else 'fulfilled' if fulfilled and not conditional and not inactive else 'explicitly_not_fulfilled' if 'explicitly_pending' in required else 'unknown'
    if lifecycle in ('cancelled','declined','superseded','reopened'): outcome='unknown'
    done=[s['stage'] for s in states if s['assessment']=='evidenced']
    unresolved=[s for s in task['required_stages'] if status[s] not in ('evidenced','not_applicable')]
    step=('Clarify condition: '+str(task['condition']) if conditional else 'No active instruction' if inactive else
          'Clarify conflicting evidence' if conflict else 'Establish evidence: '+unresolved[0].replace('_',' ') if unresolved else 'No unresolved fulfillment criterion')
    if lifecycle in ('cancelled','declined','superseded'):step='No active next step; '+lifecycle+' decision recorded'
    if lifecycle=='reopened':step='Reconfirm fulfillment after reopening'
    progress=' / '.join(done) if done else 'not established'
    return asdict(Resolution(progress,assessment,outcome,lifecycle,step)),states

def analyse(bundle,extraction,provider,configuration_fingerprint=None):
    validate_bundle(bundle);validate_extraction(extraction,bundle)
    templates=read(ROOT/'config/workflow_templates.json')
    key_ids={t['key']:task_id(bundle['patient']['id'],t) for t in extraction['tasks']}
    tasks=[]
    for t in extraction['tasks']:
        matches=[match_candidate(t,o,bundle) for o in extraction['observations'] if o['task_key']==t['key']]
        matches+=retrieve_candidates(t,bundle,{m['snapshot_id'] for m in matches})
        resolution,stages=resolve(t,matches,templates.get(t['family'],{}))
        source=verify_ref(t['source'],bundle)
        deadline=instant(t['deadline']);asof=instant(bundle['dataset']['simulation_as_of'])
        tasks.append(dict(t,id=key_ids[t['key']],parent_id=key_ids.get(t['parent_key']),
            active=t['intent'] not in INACTIVE and resolution['lifecycle'] not in ('cancelled','declined','superseded'),
            resolution=resolution,stages=stages,candidates=matches,
            work_started=any(s['assessment']=='evidenced' and stage_counts_as_progress(s['stage'],t['family']) for s in stages),
            overdue=bool(deadline and asof and source['clock']=='simulation' and deadline<asof and resolution['fulfillment']!='fulfilled' and t['intent'] not in INACTIVE),
            edges=[dict(e,from_id=key_ids[e['from_key']],to_id=key_ids[e['to_key']]) for e in extraction['edges'] if t['key'] in (e['from_key'],e['to_key'])],
            review_flags=[]))
    apply_dependencies(tasks)
    result={'schema_version':'medlatency.analysis.v1','patient_id':bundle['patient']['id'],'analysis_version':VERSION,
        'prompt_version':PROMPT_VERSION,'provider':provider.name,'model':provider.model,'mode':provider.mode,
        'input_fingerprint':digest(bundle),'configuration_fingerprint':configuration_fingerprint or digest(templates),
        'analysed_at':now(),'extraction':extraction,'tasks':tasks,'timeline':timeline(bundle,extraction),'review_history':[],'changes':[]}
    validate(ANALYSIS,result)
    return result

def apply_dependencies(tasks):
    byid={t['id']:t for t in tasks}
    for _ in range(len(tasks)):
        for t in tasks:
            children=[child for child in tasks if child['parent_id']==t['id']]
            if any(child['work_started'] for child in children):
                t['work_started']=True
                if t['resolution']['progress']=='not established':t['resolution']['progress']='subtask progress evidenced'
            deps=[byid[e['from_id']] for e in t['edges'] if e['kind']=='prerequisite' and e['origin']=='documented' and e['to_id']==t['id']]
            unresolved=[d for d in deps if d['resolution']['fulfillment']!='fulfilled']
            if unresolved:
                if t['resolution']['fulfillment']=='fulfilled':t['resolution']['fulfillment']='disputed'
                t['resolution']['next_step']='Prerequisite: '+unresolved[0]['label']

def presentation(bundle,analysis):
    tasks=analysis['tasks'] if analysis else []
    parents=[t for t in tasks if t['active'] and not t['parent_id'] and t['origin']=='documented']
    counts={'tasks_identified':len(parents),'with_progress':sum(t['work_started'] for t in parents),
        'fulfilled':sum(t['resolution']['fulfillment']=='fulfilled' for t in parents),
        'explicitly_outstanding':sum(t['resolution']['fulfillment']=='explicitly_not_fulfilled' for t in parents),
        'unknown_fulfillment':sum(t['resolution']['fulfillment']=='unknown' for t in parents),
        'ambiguous_matches':sum(c['review_required'] for t in tasks for c in t['candidates']),
        'subtasks':sum(t['parent_id'] is not None for t in tasks),
        'inferred_candidates':sum(t['active'] and t['origin']=='inferred' for t in tasks)}
    return {'overview':{'patient':bundle['patient'],'clinical_as_of':bundle['dataset']['simulation_as_of'],
        'dataset':bundle['dataset'],'analysis_mode':analysis['mode'] if analysis else 'not_analysed',
        'analysis_version':analysis['analysis_version'] if analysis else None,'context':analysis['extraction']['context'] if analysis else [],
        'coverage':bundle['coverage']},'summary':counts,
        'counting_rules':'Parent totals count active documented task instances, including conditional plans. Subtasks, inferred candidates, preferences, historical and negated mentions are separate. Progress and fulfillment overlap; ambiguous matches count candidate records across all mentions.',
        'tasks':tasks,'evidence':bundle['resources'],'timeline':analysis['timeline'] if analysis else timeline(bundle),
        'demo_highlights':[{'task_id':t['id'],'label':t['label'],'why':('Authored outcome demonstration; not observed in Anima.' if bundle['dataset']['mode']=='fixture' and t['resolution']['fulfillment']=='fulfilled' else t['resolution']['next_step'])} for t in parents[:4]],
        'analysis':{k:v for k,v in analysis.items() if k not in ('tasks','extraction','timeline')} if analysis else None}
