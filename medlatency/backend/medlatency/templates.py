from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from .paths import CONFIG_DIR


@lru_cache(maxsize=1)
def load_templates() -> dict[str, Any]:
    path = CONFIG_DIR / "workflow_templates.json"
    return json.loads(path.read_text(encoding="utf-8"))


def family_template(family: str) -> dict[str, Any]:
    families = load_templates()["families"]
    return families.get(family, families["unknown"])


def family_stages(family: str) -> list[str]:
    return list(family_template(family)["stages"])


def fulfillment_stage(family: str) -> str:
    return str(family_template(family)["fulfillment_stage"])
