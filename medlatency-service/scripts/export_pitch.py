import _bootstrap
import argparse
from pathlib import Path
from backend.common import ROOT
from backend.store import Store
from backend.engine import presentation
from backend.export import html
p=argparse.ArgumentParser();p.add_argument('--patient-id',required=True);p.add_argument('--out',type=Path,default=ROOT/'outputs/pitch');p.add_argument('--db',type=Path);a=p.parse_args();store=Store(a.db)
packet=presentation(store.bundle(a.patient_id),store.latest(a.patient_id));a.out.mkdir(parents=True,exist_ok=True)
path=a.out/(a.patient_id+'.html');path.write_text(html(packet),encoding='utf-8');print(path.resolve())
