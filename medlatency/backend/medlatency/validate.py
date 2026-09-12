from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from jsonschema import Draft202012Validator

from .models import PatientBundle
from .paths import SCHEMAS_DIR


@lru_cache(maxsize=2)
def _validator(name: str) -> Draft202012Validator:
    schema = json.loads((SCHEMAS_DIR / name).read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


def validate_bundle_dict(payload: dict[str, Any]) -> list[str]:
    errors = sorted(_validator("patient_bundle.schema.json").iter_errors(payload), key=lambda e: list(e.path))
    return [f"{'/'.join(str(p) for p in error.path) or '<root>'}: {error.message}" for error in errors]


def parse_bundle(payload: dict[str, Any]) -> PatientBundle:
    problems = validate_bundle_dict(payload)
    if problems:
        raise ValueError("Invalid patient bundle:\n" + "\n".join(problems[:20]))
    return PatientBundle.model_validate(payload)
