from __future__ import annotations

import hashlib
import json
from typing import Any


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=True)


def sha256_json(value: Any) -> str:
    return sha256_text(canonical_json(value))


def stable_id(*parts: str, prefix: str = "id", length: int = 16) -> str:
    material = "|".join(parts)
    return f"{prefix}_{sha256_text(material)[:length]}"
