import _bootstrap
import argparse
from pathlib import Path
from backend.common import ROOT,load_env,read,write
from backend.store import Store
from backend.providers import provider
from backend.engine import presentation
load_env();p=argparse.ArgumentParser();p.add_argument('--bundle',type=Path);p.add_argument('--patient-id');p.add_argument('--provider',choices=['replay','openai']);p.add_argument('--db',type=Path);p.add_argument('--out',type=Path,default=ROOT/'outputs/analyses');a=p.parse_args()
store=Store(a.db)
if a.bundle:pid=store.import_bundle(read(a.bundle))['patient_id']
elif a.patient_id:pid=a.patient_id
else:p.error('--bundle or --patient-id required')
aid,result=store.run(pid,provider(a.provider));write(a.out/(pid+'.json'),result);write(a.out/(pid+'.presentation.json'),presentation(store.bundle(pid),result))
print(pid,result['mode'],aid)
