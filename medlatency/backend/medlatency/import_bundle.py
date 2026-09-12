from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .hashing import sha256_json, sha256_text
from .models import PatientBundle, Resource
from .paths import BUNDLES_DIR, PATIENT_FIXTURES_DIR
from .validate import parse_bundle


class ImportError_(ValueError):
    pass


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _resource_payload(resource: Resource) -> dict[str, Any]:
    return {
        "id": resource.id,
        "version": resource.version,
        "kind": resource.kind,
        "source_status": resource.source_status,
        "data": resource.data,
        "event_time": resource.event_time.isoformat() if resource.event_time else None,
    }


def annotate_bundle(bundle: PatientBundle) -> PatientBundle:
    resources: list[Resource] = []
    for resource in bundle.resources:
        if resource.patient_id not in (None, bundle.patient.id):
            raise ImportError_(
                f"Resource {resource.id} belongs to {resource.patient_id}, not {bundle.patient.id}"
            )
        stamped = resource.model_copy(
            update={
                "patient_id": resource.patient_id or bundle.patient.id,
                "content_sha256": resource.content_sha256 or sha256_json(_resource_payload(resource)),
                "record_created_at": _as_utc(resource.record_created_at),
                "event_time": _as_utc(resource.event_time),
                "retrieved_at": _as_utc(resource.retrieved_at),
            }
        )
        resources.append(stamped)
    context = []
    for resource in bundle.service_context:
        context.append(
            resource.model_copy(update={"content_sha256": resource.content_sha256 or sha256_json(_resource_payload(resource))})
        )
    fingerprint_material = {
        "patient_id": bundle.patient.id,
        "resources": [r.content_sha256 for r in resources],
        "links": [link.model_dump() for link in bundle.links],
        "events": [event.id for event in bundle.events],
    }
    integrity = bundle.dataset.integrity.model_copy(update={"bundle_sha256": sha256_json(fingerprint_material)})
    return bundle.model_copy(update={"resources": resources, "service_context": context, "dataset": bundle.dataset.model_copy(update={"integrity": integrity})})


def load_bundle_file(path: Path) -> PatientBundle:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return annotate_bundle(parse_bundle(payload))


def discover_bundle_files() -> list[Path]:
    files: list[Path] = []
    for folder in (PATIENT_FIXTURES_DIR, BUNDLES_DIR):
        if folder.exists():
            files.extend(sorted(folder.glob("*.json")))
    return files


def input_fingerprint(bundle: PatientBundle) -> str:
    annotated = annotate_bundle(bundle)
    return annotated.dataset.integrity.bundle_sha256 or sha256_text(bundle.patient.id)
