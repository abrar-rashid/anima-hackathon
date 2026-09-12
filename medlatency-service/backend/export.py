import json
from .common import ROOT

def html(packet=None):
    template=(ROOT/'viewer/index.html').read_text(encoding='utf-8')
    # Escaping < prevents source text closing the script tag in offline exports.
    data=json.dumps(packet,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    return template.replace('/*__PATIENT_DATA__*/null',data)
