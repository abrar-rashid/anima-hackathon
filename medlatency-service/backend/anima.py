"""Spec-checked GET-only Anima adapter with exact raw bytes, checkpoints and honest coverage."""
from __future__ import annotations
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from .common import ROOT,digest,now,read,write,leaves
from .models import validate,validate_bundle
from .retrospective import metadata as retrospective_metadata

ORIGIN='https://sim.animahacks.com'
SITES=('gp','hospital','community','pharmacy','diagnostics','referrals','wearables')
WORKSPACES=('/api/sites/gp/messaging-workspace','/api/sites/gp/documents','/api/sites/hospital/documents',
            '/api/sites/hospital/attendances','/api/sites/pharmacy/pharmacy-workspace')
LIMITATIONS=['Full clinical history is not guaranteed by successful API responses.',
 'Clock supplies up to 100 visible recent events, not full history.',
 'Legacy browser-only content is not extracted.',
 'GET-only retrieval is not an atomic snapshot; simulation remains untouched.',
 'Workspace coverage is limited to returned snapshots; unavailable scopes are reported.',
 'Optional NHS projections are not requested; some are capped. Canonical site views are paginated.',
 'Clinical event timestamps are retained when explicitly identified; record creation is metadata.',
 'Telephone scripts are not transcripts; telephone clock domains may differ.']

class FetchError(ValueError):pass
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise FetchError('Anima redirect refused')

class Client:
    def __init__(self,key=None,raw_dir=None,timeout=25,retries=2):
        self.key=key or '';self.raw_dir=Path(raw_dir or ROOT/'data/raw');self.timeout=timeout;self.retries=retries
        self.spec=None;self.last_provenance=None;self.opener=urllib.request.build_opener(NoRedirect())
    def operation(self,path):
        paths=self.spec.get('paths',{}) if self.spec else {}
        route=path
        if route not in paths and re.fullmatch(r'/api/sites/[^/]+/(patients|view)',path):
            route='/api/sites/{site}/'+path.rsplit('/',1)[1]
        operation=paths.get(route,{}).get('get')
        if not operation:raise FetchError('GET route absent from current specification: '+path)
        return route,operation
    def get(self,path,params=None,discovery=False):
        if not path.startswith('/api/') or '?' in path or '#' in path:raise FetchError('Only fixed API paths allowed')
        if not discovery:
            _,operation=self.operation(path)
            allowed={p['name']:p for p in operation.get('parameters',[]) if p.get('in')=='query'}
            for k,v in (params or {}).items():
                if k not in allowed:raise FetchError('Undocumented query parameter: '+k)
                validate(allowed[k].get('schema',{}),v)
        url=ORIGIN+path+('?' + urllib.parse.urlencode(params) if params else '')
        headers={'Accept':'application/json','User-Agent':'medlatency-demo/1.0'}
        if self.key:headers['Authorization']='Bearer '+self.key
        req=urllib.request.Request(url,headers=headers,method='GET')
        for attempt in range(self.retries+1):
            try:
                with self.opener.open(req,timeout=self.timeout) as response:body=response.read()
                break
            except urllib.error.HTTPError as exc:
                code=exc.code;retry=exc.headers.get('Retry-After');exc.close()
                if code not in (429,500,502,503,504) or attempt==self.retries:raise FetchError('Anima HTTP '+str(code)) from None
                if retry:
                    try:delay=float(retry)
                    except ValueError:raise FetchError('Server requested delayed retry; resume later') from None
                    if not 0<=delay<=10:raise FetchError('Server requested delayed retry; resume later')
                else:delay=2**attempt
                time.sleep(delay)
            except (urllib.error.URLError,TimeoutError,OSError):
                if attempt==self.retries:raise FetchError('Anima network unavailable') from None
                time.sleep(2**attempt)
        sha=hashlib.sha256(body).hexdigest();self.raw_dir.mkdir(parents=True,exist_ok=True)
        (self.raw_dir/(sha+'.json')).write_bytes(body)
        self.last_provenance={'endpoint':path,'query':params or {},'retrieved_at':now(),'sha256':sha,'raw_file':str((self.raw_dir/(sha+'.json')).resolve())}
        write(self.raw_dir/(sha+'.'+digest(self.last_provenance)[:12]+'.meta.json'),self.last_provenance)
        try:payload=json.loads(body)
        except ValueError:raise FetchError('Invalid API JSON') from None
        if not discovery:
            schema=operation['responses']['200']['content']['application/json']['schema']
            validate(dict(schema,components=self.spec.get('components',{})),payload)
        return payload
    def discover(self):
        self.spec=self.get('/api/openapi.json',discovery=True);spec_meta=dict(self.last_provenance)
        catalogue=self.get('/api/catalogue',discovery=True);cat_meta=dict(self.last_provenance)
        audit={'retrieved_at':now(),'spec':spec_meta,'catalogue':cat_meta,'version':self.spec.get('info',{}).get('version'),
               'get_routes':[{ 'path':p,'summary':v['get'].get('summary'),'parameters':v['get'].get('parameters',[]),
                               'response_schema':v['get'].get('responses',{}).get('200',{})}
                              for p,v in self.spec.get('paths',{}).items() if 'get' in v]}
        write(self.raw_dir/'api-contract-audit.json',audit)
        return catalogue

def pages(client,path,params,items_key,total_key,max_pages=1000):
    offset=0;expected=None;seen=set();ids=set()
    for _ in range(max_pages):
        payload=client.get(path,dict(params,offset=offset));items=payload.get(items_key);total=payload.get(total_key)
        if not isinstance(items,list) or type(total)is not int or total<0:raise FetchError('Invalid pagination shape')
        if expected is not None and expected!=total:raise FetchError('Inconsistent pagination totals')
        if payload.get('resourceOffset',payload.get('offset',offset))!=offset:raise FetchError('Pagination offset mismatch')
        if offset+len(items)>total:raise FetchError('Pagination exceeds total')
        expected=total;fingerprint=digest(items)
        if items and fingerprint in seen:raise FetchError('Repeated pagination page')
        seen.add(fingerprint)
        for r in items:
            if not isinstance(r,dict) or not isinstance(r.get('id'),str):raise FetchError('Invalid paginated resource')
            if r['id'] in ids:raise FetchError('Repeated resource across pages')
            ids.add(r['id'])
        yield items,payload,dict(client.last_provenance or {})
        offset+=len(items)
        if offset>=total:return
        if not items:raise FetchError('Empty page before total reached')
    raise FetchError('Pagination limit reached')

def discover_patients(client,site,count=None,patient_id=None):
    patients=[]
    params={'q':patient_id} if patient_id else {}
    for items,_,_ in pages(client,f'/api/sites/{site}/patients',params,'items','total'):
        for patient in items:
            if patient_id is None or patient['id']==patient_id:patients.append(patient)
        if count and len(patients)>=count:return patients[:count]
        if patient_id and patients:return patients
    if patient_id and not patients:raise FetchError('Requested patient not found in directory')
    if count and len(patients)<count:raise FetchError(f'Requested {count} patients; directory contains only {len(patients)}')
    return patients

def normalize_resource(native,provenance,pid):
    data=native.get('data',{})
    # Known explicit event fields; all other timestamps stay in native data for semantic inspection.
    event=next((data[k] for k in ('occurredAt','observedAt','collectedAt','sentAt','receivedAt') if k in data),None)
    retrospective=retrospective_metadata(native)
    locations=[{'endpoint':provenance.get('endpoint'),'native_id':native['id']}]
    if retrospective and event is None:
        event=retrospective['clinical_event_at']
        locations.append({'field':'clinical_event_at','pointer':'/data/text',
                          'basis':'explicit retrospective narrative timestamp; not server audit time'})
    clock='wall' if 'telephone' in native.get('kind','').lower() or 'call' in native.get('kind','').lower() else 'simulation'
    return {'id':native['id'],'snapshot_id':'snap_'+digest(native),'patient_id':pid,'kind':native['kind'],
        'title':native.get('title',''),'source_status':native.get('status'),'version':native.get('version'),
        'record_created_at':native.get('createdAt'),'clinical_event_at':event,'clock':clock,'data':data,
        'provenance':[provenance],'source_locations':locations,'native':native}

def fetch_patient(client,patient,scopes):
    pid=patient['id'];resources={};shared={};coverage=[];events={};asof=None
    def ingest(items,provenance):
        for native in items:
            if native.get('patientId') is None:
                shared.setdefault(digest(native),{'native':native,'provenance':[]})['provenance'].append(provenance);continue
            if native.get('patientId')!=pid:continue
            r=normalize_resource(native,provenance,pid);sid=r['snapshot_id']
            if sid in resources:resources[sid]['provenance'].append(provenance)
            else:resources[sid]=r
    def collect_events(payload):
        nonlocal asof
        if payload.get('now') is not None:asof=payload['now']
        for e in payload.get('events',[]):
            if e.get('patientId')==pid:
                events[digest(e)]=dict(e,patient_id=pid,kind='audit',clock='simulation',time=e.get('time'),native=e)
    for site in SITES:
        path=f'/api/sites/{site}/view';row={'endpoint':path,'complete':False,'pages':0};coverage.append(row)
        if site not in scopes:row['error']='scope unavailable';continue
        try:
            for items,payload,prov in pages(client,path,{'patient':pid,'limit':500},'resources','resourceTotal'):
                ingest(items,prov);collect_events(payload);row['pages']+=1
            row['complete']=True
        except ValueError as e:row['error']=str(e)
    for path in WORKSPACES:
        row={'endpoint':path,'complete':False};coverage.append(row)
        if path.split('/')[3] not in scopes:row['error']='scope unavailable';continue
        try:
            payload=client.get(path);ingest(payload['resources'],dict(client.last_provenance));collect_events(payload)
            row.update(complete=True,coverage_basis='returned workspace snapshot, not full history')
        except ValueError as e:row['error']=str(e)
    for endpoint in ('devices','readings'):
        path='/api/sites/wearables/'+endpoint;row={'endpoint':path,'complete':False};coverage.append(row)
        if 'wearables' not in scopes:row['error']='scope unavailable';continue
        try:
            for items,payload,prov in pages(client,path,{'patient':pid,'limit':500},'items','total'):
                ingest(items,prov);collect_events(payload)
            row['complete']=True
        except ValueError as e:row['error']=str(e)
    row={'endpoint':'/api/clock','complete':False};coverage.append(row)
    try:collect_events(client.get('/api/clock'));row['complete']=True
    except ValueError as e:row['error']=str(e)
    ids={r['id'] for r in resources.values()};links=[]
    reference_fields={'requestId','orderId','resultId','documentId','sourceId','referralId','appointmentId','parentId','replacesId'}
    for r in resources.values():
        for path,value in leaves(r['data'],'/data'):
            if path.rsplit('/',1)[-1] in reference_fields and isinstance(value,str) and value in ids:
                links.append({'from':r['id'],'to':value,'relation':path.rsplit('/',1)[-1],'pointer':path})
        meta=retrospective_metadata(r['native'])
        if meta and meta['request_resource_id'] in ids:
            targets=[x for x in resources.values() if x['id']==meta['request_resource_id']]
            # A free-text ID alone is insufficient: require matching explicit episode metadata.
            if any((target_meta:=retrospective_metadata(x['native'])) and
                   target_meta['investigation']==meta['investigation'] and
                   target_meta['stage']=='requested' for x in targets):
                links.append({'from':r['id'],'to':meta['request_resource_id'],
                              'relation':'documented_request','pointer':'/data/text'})
    conflicts=len(ids)!=len(resources)
    b={'schema_version':'medlatency.patient.v1','patient':{'id':pid,'display_name':patient.get('name',pid),'synthetic':patient.get('synthetic',True)},
       'dataset':{'mode':'live','source':ORIGIN,'captured_at':now(),'simulation_as_of':asof,'label':'Imported Anima simulation evidence; authored retrospective notes remain labelled'},
       'coverage':{'full_history_guaranteed':False,'sources':coverage,'limitations':LIMITATIONS+(['Differing snapshots preserved; conflict review required.'] if conflicts else [])},
       'resources':list(resources.values()),'events':list(events.values()),'links':links,'shared_context':list(shared.values())}
    return validate_bundle(b)

def checkpoint_valid(path,row):
    try:
        b=validate_bundle(read(path))
        return digest(b)==row.get('fingerprint') and b['dataset']['mode']=='live'
    except (ValueError,OSError):return False

def fetch_run(client,out,count=None,patient_id=None,resume=False):
    out=Path(out);out.mkdir(parents=True,exist_ok=True);manifest_path=out/'manifest.json'
    client.discover();team=client.get('/api/team');scopes=team.get('scopes',[])
    sites=[s for s in SITES if s in scopes]
    if not sites:raise FetchError('No supported service scopes')
    request={'count':count,'patient_id':patient_id,'origin':ORIGIN,'world':team.get('world'),'team':team.get('team')}
    if resume and manifest_path.exists():
        manifest=read(manifest_path)
        if manifest['request']!=request:raise FetchError('Resume request or team/world differs from checkpoint')
        selected=manifest['selected']
    else:
        if manifest_path.exists():raise FetchError('Output manifest exists; use --resume or a new directory')
        selected=discover_patients(client,sites[0],count,patient_id)
        manifest={'request':request,'selected':selected,'patients':{},'requested_count':count or 1,'status':'running','started_at':now()};write(manifest_path,manifest)
    for patient in selected:
        pid=patient['id']
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',pid):raise FetchError('Unsafe patient ID')
        path=out/(pid+'.json');old=manifest['patients'].get(pid,{})
        if resume and old.get('status')=='complete' and checkpoint_valid(path,old):continue
        try:
            bundle=fetch_patient(client,patient,scopes);write(path,bundle)
            complete=all(s['complete'] for s in bundle['coverage']['sources'])
            manifest['patients'][pid]={'status':'complete' if complete else 'partial','fingerprint':digest(bundle),'path':path.name,'saved_at':now()}
        except ValueError as e:manifest['patients'][pid]={'status':'failed','error':str(e)}
        write(manifest_path,manifest)
    saved=sum(r['status'] in ('complete','partial') for r in manifest['patients'].values())
    complete=sum(r['status']=='complete' for r in manifest['patients'].values())
    manifest.update(saved_count=saved,complete_count=complete,status='complete' if complete==manifest['requested_count'] else 'partial',finished_at=now());write(manifest_path,manifest)
    return manifest
