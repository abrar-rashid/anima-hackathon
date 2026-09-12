import _bootstrap
import argparse
from pathlib import Path
from backend.common import read
from backend.store import Store
p=argparse.ArgumentParser();p.add_argument('bundle',type=Path);p.add_argument('--db',type=Path);a=p.parse_args()
print(Store(a.db).import_bundle(read(a.bundle)))
