"""SQLite facts, immutable analyses, provider cache, jobs, and append-only human decisions."""
from __future__ import annotations
import copy
import json
import sqlite3
import uuid
from contextlib import contextmanager
import os
from pathlib import Path
from .common import ROOT, digest, now, read
from .models import validate_bundle,validate_extraction,validate,ANALYSIS
from .engine import analyse,resolve,apply_dependencies,stage_counts_as_progress,VERSION
from .providers import PROMPT_VERSION

DDL='''
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS bundles(fingerprint TEXT PRIMARY KEY, patient_id TEXT NOT NULL, imported_at TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS patients(id TEXT PRIMARY KEY, current_bundle TEXT NOT NULL REFERENCES bundles(fingerprint));
CREATE TABLE IF NOT EXISTS analyses(id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, task_id TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')), created_at TEXT NOT NULL, analysis_id TEXT, error TEXT);
CREATE INDEX IF NOT EXISTS analysis_patient ON analyses(patient_id,created_at);
CREATE INDEX IF NOT EXISTS review_patient ON reviews(patient_id,created_at);
'''

class Store:
    def __init__(self,path=None):
        self.path=Path(path or os.environ.get('MEDLATENCY_DB') or ROOT/'data/medlatency.sqlite3');self.path.parent.mkdir(parents=True,exist_ok=True)
        with self.connect() as db:db.executescript(DDL)
    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path,timeout=20);db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:yield db
        finally:db.close()
    def import_bundle(self,bundle):
        validate_bundle(bundle);fp=digest(bundle);pid=bundle['patient']['id']
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO bundles VALUES(?,?,?,?)',(fp,pid,now(),json.dumps(bundle)))
            db.execute('INSERT INTO patients VALUES(?,?) ON CONFLICT(id) DO UPDATE SET current_bundle=excluded.current_bundle',(pid,fp))
        return {'patient_id':pid,'input_fingerprint':fp,'dataset_mode':bundle['dataset']['mode']}
    def bundle(self,pid):
        with self.connect() as db:row=db.execute('SELECT b.body FROM patients p JOIN bundles b ON p.current_bundle=b.fingerprint WHERE p.id=?',(pid,)).fetchone()
        if not row:raise KeyError('Patient not found')
        return json.loads(row['body'])
    def patients(self):
        with self.connect() as db:ids=[r['id'] for r in db.execute('SELECT id FROM patients ORDER BY id')]
        result=[]
        for pid in ids:
            b=self.bundle(pid);a=self.latest(pid)
            result.append(dict(b['patient'],dataset_mode=b['dataset']['mode'],analysis_mode=a['mode'] if a else 'not_analysed',
                               readiness='ready' if a and a['input_fingerprint']==digest(b) else 'needs_analysis'))
        return result
    def latest(self,pid,reviewed=True,current=True):
        sql='SELECT body FROM analyses WHERE patient_id=?'
        if current:sql+=' AND fingerprint=(SELECT current_bundle FROM patients WHERE id=?)'
        sql+=' ORDER BY created_at DESC,rowid DESC LIMIT 1'
        with self.connect() as db:row=db.execute(sql,(pid,pid) if current else (pid,)).fetchone()
        if not row:return None
        analysis=json.loads(row['body'])
        return self.apply_reviews(analysis) if reviewed else analysis
    def run(self,pid,provider):
        b=self.bundle(pid);fp=digest(b)
        config=digest([VERSION,PROMPT_VERSION,provider.name,provider.model,getattr(provider,'base',None),read(ROOT/'config/workflow_templates.json')])
        key=digest([fp,config])
        with self.connect() as db:cached=db.execute('SELECT body FROM cache WHERE key=?',(key,)).fetchone()
        extraction=json.loads(cached['body']) if cached else provider.extract(b)
        validate_extraction(extraction,b)
        result=analyse(b,extraction,provider,config)
        old=self.latest(pid,False,current=False)
        if old:
            previous={t['id']:t for t in old['tasks']}
            for t in result['tasks']:
                prior=previous.pop(t['id'],None)
                if prior and digest(prior)!=digest(t):result['changes'].append({'task_id':t['id'],'change':'evidence_or_interpretation_changed','previous_resolution':prior['resolution'],'resolution':t['resolution']})
                elif not prior:result['changes'].append({'task_id':t['id'],'change':'new_task_instance'})
            result['changes'] += [{'task_id':tid,'change':'mention_not_in_current_extraction'} for tid in previous]
        validate(ANALYSIS,result)
        aid='analysis_'+key[:24]
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO cache VALUES(?,?)',(key,json.dumps(extraction)))
            # Deterministic ID prevents duplicate analyses/tasks on identical re-import.
            db.execute('INSERT OR IGNORE INTO analyses VALUES(?,?,?,?,?)',(aid,pid,fp,result['analysed_at'],json.dumps(result)))
        return aid,self.apply_reviews(result)
    def reviews(self,pid):
        with self.connect() as db:rows=db.execute('SELECT body FROM reviews WHERE patient_id=? ORDER BY created_at,rowid',(pid,)).fetchall()
        return [json.loads(r['body']) for r in rows]
    def review(self,pid,decision):
        a=self.latest(pid)
        if not a:raise ValueError('Analyse patient before reviewing')
        tasks={t['id']:t for t in a['tasks']}
        tid=decision.get('task_id');op=decision.get('operation')
        if tid not in tasks:raise ValueError('Task is not part of this patient')
        if op not in ('accept_match','reject_match','correct','merge','split','dispute'):raise ValueError('Unknown review operation')
        if not isinstance(decision.get('explanation'),str) or not decision['explanation'].strip():raise ValueError('Review explanation required')
        if not isinstance(decision.get('reviewer'),str) or not decision['reviewer'].strip():raise ValueError('Reviewer name required')
        payload=decision.get('payload',{})
        if not isinstance(payload,dict):raise ValueError('Review payload must be an object')
        if op in ('accept_match','reject_match'):
            if payload.get('candidate_id') not in {c['id'] for c in tasks[tid]['candidates']}:raise ValueError('Candidate not part of task')
        if op=='correct':
            if not payload or set(payload)-{'label','outcome','family','responsible','intent'}:raise ValueError('Unsupported correction field')
            for k,v in payload.items():
                if not isinstance(v,str):raise ValueError('Corrections must be strings')
            if 'intent' in payload and payload['intent'] not in ('instruction','commitment','patient_request','conditional','historical','negated','cancellation','preference','inferred_candidate'):raise ValueError('Invalid intent')
        if op=='merge' and (payload.get('other_task_id') not in tasks or payload['other_task_id']==tid):raise ValueError('Merge target must be another task for this patient')
        if op=='split':
            children=payload.get('children')
            if not isinstance(children,list) or len(children)<2:raise ValueError('Split requires at least two children')
            for child in children:
                if set(child)!={'label','outcome','required_stages'} or not isinstance(child['label'],str) or not isinstance(child['outcome'],str) or not isinstance(child['required_stages'],list) or not child['required_stages'] or not all(isinstance(s,str) for s in child['required_stages']):raise ValueError('Invalid split child')
        row=dict(decision,id='review_'+uuid.uuid4().hex,patient_id=pid,created_at=now(),input_fingerprint=a['input_fingerprint'],
                 original_interpretation=copy.deepcopy(tasks[tid]))
        with self.connect() as db:db.execute('INSERT INTO reviews VALUES(?,?,?,?,?)',(row['id'],pid,tid,row['created_at'],json.dumps(row)))
        return row
    def apply_reviews(self,analysis):
        a=copy.deepcopy(analysis);history=self.reviews(a['patient_id']);tasks={t['id']:t for t in a['tasks']}
        templates=read(ROOT/'config/workflow_templates.json')
        for r in history:
            t=tasks.get(r['task_id'])
            if not t:continue
            t.setdefault('original_interpretation',copy.deepcopy(t))
            if r['input_fingerprint']!=a['input_fingerprint']:t['review_flags'].append('Source changed since review; recheck correction against new evidence')
            op=r['operation'];p=r.get('payload',{})
            if op=='correct':
                t.update(p)
                t['resolution'],t['stages']=resolve(t,t['candidates'],templates.get(t['family'],{}))
                t['active']=t['intent'] not in ('historical','negated','preference','cancellation') and t['resolution']['lifecycle'] not in ('cancelled','declined','superseded')
            elif op=='dispute':t['resolution'].update(fulfillment='disputed',assessment='conflicting',next_step='Human review: '+r['explanation'])
            elif op in ('accept_match','reject_match'):
                matched=False
                for c in t['candidates']:
                    if c['id']==p['candidate_id']:
                        matched=True;c.update(accepted=op=='accept_match',review_required=False,decision_origin='human_review')
                        if c['observation'] is None:t['review_flags'].append('Accepted candidate has no validated stage claim; fulfillment unchanged')
                if not matched:t['review_flags'].append('Reviewed candidate no longer exists in current evidence')
                t['resolution'],t['stages']=resolve(t,t['candidates'],templates.get(t['family'],{}))
            elif op=='merge':
                other=tasks.get(p['other_task_id'])
                if other:
                    other['active']=False;other['merged_into']=t['id']
                    t.setdefault('merged_mentions',[]).append(other['source'])
                    for candidate in other['candidates']:
                        if candidate['id'] not in {c['id'] for c in t['candidates']}:t['candidates'].append(copy.deepcopy(candidate))
                    t['required_stages']=list(dict.fromkeys(t['required_stages']+other['required_stages']))
                    t['resolution'],t['stages']=resolve(t,t['candidates'],templates.get(t['family'],{}))
                    t['review_flags'].append('Human merged mentions; verify combined fulfillment criteria')
            elif op=='split':
                t['active']=False
                for i,child in enumerate(p['children']):
                    new=copy.deepcopy(t);new.update(child,id='task_'+digest([r['id'],i])[:24],active=True,parent_id=t['id'],origin='inferred')
                    new['review_flags']=['Human-authored split; stage assignments require review']
                    new['candidates']=[];new['resolution'],new['stages']=resolve(new,[],templates.get(new['family'],{}))
                    new['work_started']=False;new.pop('original_interpretation',None)
                    a['tasks'].append(new);tasks[new['id']]=new
            t['review_flags'].append('Human-reviewed: '+r['explanation'])
        for t in a['tasks']:
            t['work_started']=any(c['accepted'] and c['observation'] and c['observation']['polarity']=='supports' and stage_counts_as_progress(c['observation']['stage'],t['family']) for c in t['candidates'])
        apply_dependencies(a['tasks']);a['review_history']=history
        return a
    def job_create(self,pid):
        self.bundle(pid);jid='job_'+uuid.uuid4().hex
        with self.connect() as db:db.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?)',(jid,pid,'queued',now(),None,None))
        return jid
    def job_update(self,jid,status,aid=None,error=None):
        with self.connect() as db:db.execute('UPDATE jobs SET status=?,analysis_id=?,error=? WHERE id=?',(status,aid,error,jid))
    def job(self,jid):
        with self.connect() as db:row=db.execute('SELECT * FROM jobs WHERE id=?',(jid,)).fetchone()
        if not row:raise KeyError('Job not found')
        return dict(row)
    def recover_jobs(self):
        with self.connect() as db:db.execute("UPDATE jobs SET status='failed',error='Service restarted; resubmit analysis' WHERE status IN ('queued','running')")
