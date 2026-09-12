import _bootstrap
import argparse,os
from pathlib import Path
from backend.common import ROOT,load_env
from backend.anima import Client,fetch_run,FetchError
load_env();p=argparse.ArgumentParser(description='GET-only Anima simulation extraction. Never substitutes fixtures.')
g=p.add_mutually_exclusive_group();g.add_argument('--patient-id');g.add_argument('--count',type=int)
p.add_argument('--out',type=Path,default=ROOT/'data/bundles');p.add_argument('--raw',type=Path,default=ROOT/'data/raw');p.add_argument('--resume',action='store_true');p.add_argument('--discovery-only',action='store_true');a=p.parse_args()
if a.count is not None and a.count<1:p.error('--count must be positive')
try:
    client=Client(os.environ.get('ANIMA_API_KEY'),a.raw)
    if a.discovery_only:client.discover();print('Current specification and catalogue saved with hashes and timestamps.')
    else:
        if not a.patient_id and not a.count:p.error('--patient-id or --count required')
        if not client.key:raise FetchError('ANIMA_API_KEY unavailable. Live extraction not run; use scripts/demo.py explicitly for fixtures.')
        m=fetch_run(client,a.out,a.count,a.patient_id,a.resume);print('Live extraction:',m['status'],'saved',m['saved_count'],'of',m['requested_count']);raise SystemExit(0 if m['status']=='complete' else 2)
except ValueError as e:
    print('Extraction failed:',str(e));raise SystemExit(1)
