"""Local stdlib HTTP service. Bind loopback only; no Anima mutations."""
from __future__ import annotations
import argparse
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit,unquote,parse_qs
from .common import ROOT,load_env,read
from .engine import presentation,index_evidence
from .export import html
from .providers import provider
from .store import Store

def make_server(store,host='127.0.0.1',port=8765):
    pool=ThreadPoolExecutor(max_workers=2)
    slots=threading.BoundedSemaphore(10)
    def work(jid,pid,name):
        try:
            store.job_update(jid,'running')
            aid,_=store.run(pid,provider(name));store.job_update(jid,'completed',aid)
        except Exception as e:
            # Do not persist arbitrary provider responses or credentials as errors.
            store.job_update(jid,'failed',error=str(e) if isinstance(e,ValueError) else type(e).__name__)
        finally:slots.release()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def respond(self,value,status=200,content_type='application/json; charset=utf-8'):
            body=(json.dumps(value,ensure_ascii=False) if content_type.startswith('application/json') else value).encode('utf-8')
            self.send_response(status);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(body)))
            self.send_header('X-Content-Type-Options','nosniff');self.send_header('Cache-Control','no-store')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'")
            self.end_headers();self.wfile.write(body)
        def do_GET(self):self.route(False)
        def do_POST(self):self.route(True)
        def route(self,mutation):
            try:
                host_header=self.headers.get('Host','').split(':')[0]
                if host_header not in ('127.0.0.1','localhost'):return self.respond({'error':'Loopback Host required'},403)
                if mutation:
                    origin=self.headers.get('Origin')
                    if origin and urlsplit(origin).netloc!=self.headers.get('Host'):return self.respond({'error':'Cross-origin writes refused'},403)
                    if not self.headers.get('Content-Type','').startswith('application/json'):return self.respond({'error':'JSON content required'},415)
                    size=int(self.headers.get('Content-Length','0'))
                    if size<1 or size>8_000_000:return self.respond({'error':'Body must be 1..8 MB'},413)
                    body=json.loads(self.rfile.read(size))
                else:body=None
                parsed=urlsplit(self.path);path=[unquote(x) for x in parsed.path.strip('/').split('/') if x];query=parse_qs(parsed.query)
                if not mutation and not path:return self.respond(html(),content_type='text/html; charset=utf-8')
                if not mutation and path==['api','health']:return self.respond({'status':'ok','service':'MedLatency','anima_access':'GET only, separate CLI'})
                if not mutation and path==['api','patients']:return self.respond({'patients':store.patients()})
                if mutation and path==['api','bundles']:return self.respond(store.import_bundle(body),201)
                if not mutation and len(path)==3 and path[:2]==['api','jobs']:return self.respond(store.job(path[2]))
                if len(path)>=3 and path[:2]==['api','patients']:
                    pid=path[2];bundle=store.bundle(pid);analysis=store.latest(pid)
                    packet=presentation(bundle,analysis);tail=path[3:]
                    if not mutation and tail in ([],['overview']):return self.respond(packet)
                    if mutation and tail==['analyses']:
                        name=body.get('provider',os.environ.get('MEDLATENCY_PROVIDER','replay'))
                        if name not in ('replay','openai'):raise ValueError('Unknown provider')
                        if not slots.acquire(blocking=False):return self.respond({'error':'Analysis queue full'},429)
                        jid=store.job_create(pid);pool.submit(work,jid,pid,name)
                        return self.respond({'job_id':jid,'status':'queued','poll':'/api/jobs/'+jid},202)
                    if not mutation and tail==['tasks']:
                        tasks=packet['tasks']
                        if query.get('filter')==['unresolved']:tasks=[t for t in tasks if t['active'] and t['resolution']['fulfillment']!='fulfilled']
                        if query.get('filter')==['ambiguous']:tasks=[t for t in tasks if any(c['review_required'] for c in t['candidates'])]
                        if 'family' in query:tasks=[t for t in tasks if t['family']==query['family'][0]]
                        return self.respond({'patient_id':pid,'tasks':tasks})
                    if not mutation and len(tail)>=2 and tail[0]=='tasks':
                        task=next((t for t in packet['tasks'] if t['id']==tail[1]),None)
                        if not task:raise KeyError('Task not found for this patient')
                        return self.respond({'task_id':task['id'],'edges':task['edges'],'stages':task['stages']} if tail[2:]==['graph'] else task)
                    if not mutation and tail==['evidence']:return self.respond({'resources':bundle['resources'],'index':index_evidence(bundle)})
                    if not mutation and len(tail)==2 and tail[0]=='evidence':
                        rows=[r for r in bundle['resources'] if r['id']==tail[1] or r['snapshot_id']==tail[1]]
                        if not rows:raise KeyError('Evidence not found')
                        return self.respond({'resources':rows})
                    if not mutation and tail==['timeline']:return self.respond({'events':packet['timeline']})
                    if not mutation and tail==['reviews']:return self.respond({'reviews':store.reviews(pid)})
                    if mutation and tail==['reviews']:return self.respond(store.review(pid,body),201)
                    if not mutation and tail==['export']:return self.respond(html(packet),content_type='text/html; charset=utf-8')
                return self.respond({'error':'Route not found'},404)
            except KeyError:return self.respond({'error':'Patient, task, job or evidence not found'},404)
            except (ValueError,TypeError) as e:return self.respond({'error':str(e) if isinstance(e,ValueError) else 'Invalid request shape'},400)
            except Exception:return self.respond({'error':'Internal service error'},500)
    server=ThreadingHTTPServer((host,port),Handler)
    server.worker_pool=pool
    return server

def main():
    load_env();p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--db',default=os.environ.get('MEDLATENCY_DB',str(ROOT/'data/medlatency.sqlite3')));args=p.parse_args()
    store=Store(args.db);store.recover_jobs();server=make_server(store,port=args.port)
    print(f'MedLatency local viewer: http://127.0.0.1:{args.port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();server.worker_pool.shutdown(wait=False,cancel_futures=True)
if __name__=='__main__':main()
