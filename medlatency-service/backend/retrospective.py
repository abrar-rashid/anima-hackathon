"""Explicit metadata in authored synthetic notes; never infer dates from clinical prose."""
import json
from .common import instant

MARKER = 'MEDLATENCY SYNTHETIC RETROSPECTIVE EVENT v1'
STAGES = {
    'requested', 'ordered', 'phlebotomy_booked', 'collected', 'dispatched',
    'received', 'analysed', 'validated', 'result_available', 'reviewed',
    'communicated', 'closed', 'awaiting_vetting', 'approved', 'booked',
    'safety_checked', 'scan_completed', 'images_available', 'report_available',
    'follow_up_assigned',
}

def metadata(native):
    text = native.get('data', {}).get('text')
    if not isinstance(text, str) or not text.startswith(MARKER + '\n'):
        return None
    try:
        meta = json.loads(text.split('\n', 2)[1])
        if not isinstance(meta, dict):
            return None
        if (meta.get('patient_id') != native.get('patientId')
                or meta.get('evidence_kind') != 'retrospective-narrative'
                or meta.get('stage') not in STAGES
                or meta.get('pathway_state') not in ('completed', 'open')
                or not isinstance(meta.get('investigation'), str)
                or not meta['investigation'].startswith('ML-SEED-')
                or not isinstance(meta.get('request_resource_id'), str)
                or not isinstance(meta.get('clinical_event_at'), str)
                or instant(meta['clinical_event_at']) is None):
            return None
        return meta
    except (ValueError, TypeError, IndexError):
        return None
