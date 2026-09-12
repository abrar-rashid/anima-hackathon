import _bootstrap
from generate_fixtures import generate
from backend.common import ROOT,write
from backend.store import Store
from backend.providers import ReplayProvider
from backend.engine import presentation
from backend.export import html
store=Store()
for f in generate():
    store.import_bundle(f.bundle);_,a=store.run(f.pid,ReplayProvider());packet=presentation(f.bundle,a)
    write(ROOT/'outputs/analyses'/(f.pid+'.json'),a);write(ROOT/'outputs/analyses'/(f.pid+'.presentation.json'),packet)
    out=ROOT/'outputs/pitch'/(f.pid+'.html');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(html(packet),encoding='utf-8')
print('Nine fixture/replay demonstrations imported, analysed and exported. Start: python -m backend.server')
