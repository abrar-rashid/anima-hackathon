"""Published validation contracts and typed core entities. Source facts remain untouched."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Literal
from jsonschema import Draft202012Validator
from .common import ROOT, pointer, digest, write

@dataclass(frozen=True)
class EvidenceRef:
    resource_id: str
    snapshot_id: str
    pointer: str
    quote: str

@dataclass(frozen=True)
class Resolution:
    progress: str
    assessment: Literal['evidenced','inferred','explicitly_pending','not_evidenced','conflicting','not_applicable']
    fulfillment: Literal['fulfilled','explicitly_not_fulfilled','unknown','disputed']
    lifecycle: str
    next_step: str

def obj(properties, required=None):
    return {'type':'object','properties':properties,'required':list(properties) if required is None else required,'additionalProperties':False}
S = {'type':'string'}
N = {'type':['string','null']}
def enum(*values): return {'type':'string','enum':list(values)}
def arr(items): return {'type':'array','items':items}
REF = obj({'resource_id':S,'snapshot_id':S,'pointer':S,'quote':S})
EDGE = obj({'from_key':S,'to_key':S,'kind':enum('prerequisite','parallel','conditional','alternative','supersedes'), 'origin':enum('documented','template'), 'condition':N, 'source':REF})
TASK = obj({'key':S,'action_key':S,'label':S,'outcome':S,'family':S,
            'intent':enum('instruction','commitment','patient_request','conditional','historical','negated','cancellation','preference','inferred_candidate'),
            'origin':enum('documented','inferred'),'source':REF,'responsible':N,'condition':N,'deadline':N,
            'preferences':arr(S),'uncertainties':arr(S),'item':S,'parent_key':N,
            'required_stages':arr(S),'fulfillment_rule':enum('all','any')})
OBS = obj({'task_key':S,'stage':S,'source':REF,'item':S,
           'polarity':enum('supports','pending','conflicts','not_applicable'),
           'lifecycle':enum('active','cancelled','declined','superseded','reopened'),
           'explanation':S})
EXTRACTION = obj({'tasks':arr(TASK),'observations':arr(OBS),'edges':arr(EDGE),'context':arr(S)})
RESOURCE = obj({'id':S,'snapshot_id':S,'patient_id':S,'kind':S,'title':S,'source_status':{},'version':{},
                'record_created_at':{},'clinical_event_at':{},'clock':enum('simulation','wall','unknown'),
                'data':{'type':'object'},'provenance':arr({}),'source_locations':arr({}),'native':{'type':'object'}})
BUNDLE = obj({'schema_version':{'const':'medlatency.patient.v1'},
              'patient':obj({'id':{'type':'string','pattern':'^[A-Za-z0-9_-]{1,100}$'},'display_name':S,'synthetic':{'type':'boolean'}}),
              'dataset':obj({'mode':enum('fixture','live'),'source':S,'captured_at':S,'simulation_as_of':{},'label':S}),
              'coverage':obj({'full_history_guaranteed':{'type':'boolean'},'sources':arr({}),'limitations':arr(S)}),
              'resources':arr(RESOURCE),'events':arr({'type':'object'}),'links':arr(obj({'from':S,'to':S,'relation':S,'pointer':S})),
              'shared_context':arr({})})
ANALYSIS = obj({'schema_version':{'const':'medlatency.analysis.v1'},'patient_id':S,'analysis_version':S,'prompt_version':S,
                'provider':S,'model':S,'mode':enum('fixture_replay','model'),'input_fingerprint':S,'configuration_fingerprint':S,
                'analysed_at':S,'extraction':EXTRACTION,'tasks':arr({'type':'object'}),'timeline':arr({'type':'object'}),
                'review_history':arr({'type':'object'}),'changes':arr({'type':'object'})})

def validate(schema, value):
    errors = list(Draft202012Validator(schema).iter_errors(value))
    if errors:
        e=errors[0]
        # Error text excludes payload values (which may contain sensitive source text).
        raise ValueError('Schema validation failed at /'+'/'.join(map(str,e.absolute_path))+' ('+str(e.validator)+')')

def validate_bundle(bundle):
    validate(BUNDLE,bundle)
    pid=bundle['patient']['id']; seen=set()
    for r in bundle['resources']:
        if r['patient_id'] != pid: raise ValueError('Cross-patient resource rejected')
        if r['native'].get('patientId',pid)!=pid: raise ValueError('Cross-patient native resource rejected')
        if r['snapshot_id'] in seen: raise ValueError('Duplicate snapshot ID')
        seen.add(r['snapshot_id'])
    ids={r['id'] for r in bundle['resources']}
    for e in bundle['events']:
        if e.get('patient_id',e.get('patientId',pid)) != pid: raise ValueError('Cross-patient event rejected')
    for e in bundle['links']:
        if e['from'] not in ids or e['to'] not in ids: raise ValueError('Dangling relationship')
    for shared in bundle['shared_context']:
        native=shared.get('native',shared) if isinstance(shared,dict) else {}
        if native.get('patientId') or native.get('patient_id'):raise ValueError('Patient-specific data cannot be shared service context')
    if bundle['dataset']['mode']=='fixture' and not bundle['patient']['synthetic']:
        raise ValueError('Fixture identity must be synthetic')
    return bundle

def verify_ref(ref,bundle):
    validate(REF,ref)
    resource=next((r for r in bundle['resources'] if r['snapshot_id']==ref['snapshot_id'] and r['id']==ref['resource_id']),None)
    if not resource: raise ValueError('Evidence resource or snapshot not found')
    try: value=pointer(resource,ref['pointer'])
    except (KeyError,IndexError,TypeError,ValueError): raise ValueError('Evidence field not found') from None
    if not ref['quote'] or (ref['quote'] not in value if isinstance(value,str) else ref['quote'] != __import__('json').dumps(value,ensure_ascii=False)):
        raise ValueError('Fabricated or empty evidence quotation')
    return resource

def validate_extraction(extraction,bundle):
    validate(EXTRACTION,extraction)
    keys=[t['key'] for t in extraction['tasks']]
    if len(set(keys))!=len(keys): raise ValueError('Duplicate task key')
    identities=set()
    for t in extraction['tasks']:
        verify_ref(t['source'],bundle)
        if t['deadline']:
            # Conservative deadline guard: arbitrary dueAt metadata and unsupported
            # model-normalised dates never cause an overdue label.
            supported=t['deadline'][:10] in t['source']['quote'] and t['source']['pointer'].rsplit('/',1)[-1] not in ('dueAt','createdAt','record_created_at')
            if not supported:
                t['uncertainties'].append('Deadline not independently supported by the quoted instruction; overdue assessment withheld.')
                t['deadline']=None
        identity=(t['source']['resource_id'],t['source']['pointer'],t['action_key'])
        if identity in identities: raise ValueError('Duplicate task instance anchor')
        identities.add(identity)
        if t['parent_key'] and t['parent_key'] not in keys: raise ValueError('Unknown parent')
        if not t['required_stages']: raise ValueError('Task needs an explicit fulfillment criterion')
    for o in extraction['observations']:
        verify_ref(o['source'],bundle)
        if o['task_key'] not in keys: raise ValueError('Observation references unknown task')
    adjacency={k:[] for k in keys}
    for t in extraction['tasks']:
        if t['parent_key']: adjacency[t['key']].append(t['parent_key'])
    for e in extraction['edges']:
        verify_ref(e['source'],bundle)
        if e['from_key'] not in keys or e['to_key'] not in keys: raise ValueError('Unknown graph node')
        if e['kind']=='prerequisite': adjacency[e['from_key']].append(e['to_key'])
    def visit(k,stack):
        if k in stack: raise ValueError('Cyclic task dependencies')
        for child in adjacency[k]: visit(child,stack|{k})
    for k in keys: visit(k,set())
    return extraction

def publish():
    for name,schema in [('patient_bundle',BUNDLE),('extraction',EXTRACTION),('analysis',ANALYSIS)]:
        write(ROOT/'schemas'/f'{name}.schema.json',dict(schema,**{'$schema':'https://json-schema.org/draft/2020-12/schema'}))

if __name__=='__main__': publish()
