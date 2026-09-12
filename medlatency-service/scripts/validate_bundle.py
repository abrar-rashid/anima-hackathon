import _bootstrap
import argparse
from pathlib import Path
from backend.common import read
from backend.models import validate_bundle
p=argparse.ArgumentParser();p.add_argument('bundle',type=Path);args=p.parse_args()
b=validate_bundle(read(args.bundle));print('Valid:',b['patient']['id'],b['dataset']['mode'],len(b['resources']),'snapshots')
