from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from .models import Link, PatientBundle, Resource
from .pointers import walk_text_fields


@dataclass
class IndexedResource:
    resource: Resource
    texts: list[tuple[str, str]]
    item_keys: set[str]


@dataclass
class EvidenceIndex:
    bundle: PatientBundle
    by_id: dict[str, Resource]
    by_kind: dict[str, list[Resource]]
    by_item: dict[str, list[Resource]]
    links_from: dict[str, list[Link]]
    links_to: dict[str, list[Link]]
    resources: list[IndexedResource] = field(default_factory=list)

    def get(self, resource_id: str) -> Resource | None:
        return self.by_id.get(resource_id)

    def related(self, resource_id: str, rel: str | None = None) -> list[Resource]:
        found: list[Resource] = []
        for link in self.links_from.get(resource_id, []) + self.links_to.get(resource_id, []):
            if rel and link.rel != rel:
                continue
            other = link.to_id if link.from_id == resource_id else link.from_id
            resource = self.by_id.get(other)
            if resource:
                found.append(resource)
        return found


def _item_keys(resource: Resource) -> set[str]:
    data = resource.data
    keys: set[str] = set()
    for field_name in ("item_key", "test_code", "panel_id", "document_type", "appointment_type", "order_id"):
        value = data.get(field_name)
        if isinstance(value, str) and value.strip():
            keys.add(value.strip().lower())
    requested = data.get("requested_actions") or data.get("instructions") or []
    if isinstance(requested, list):
        for action in requested:
            if isinstance(action, dict):
                item = action.get("item") or action.get("item_key")
                if isinstance(item, str) and item.strip():
                    keys.add(item.strip().lower())
    return keys


def build_index(bundle: PatientBundle) -> EvidenceIndex:
    by_id = {resource.id: resource for resource in bundle.resources}
    by_kind: dict[str, list[Resource]] = defaultdict(list)
    by_item: dict[str, list[Resource]] = defaultdict(list)
    indexed: list[IndexedResource] = []
    for resource in bundle.resources:
        by_kind[resource.kind].append(resource)
        keys = _item_keys(resource)
        for key in keys:
            by_item[key].append(resource)
        indexed.append(
            IndexedResource(
                resource=resource,
                texts=walk_text_fields(resource.data) + ([("/title", resource.title)] if resource.title else []),
                item_keys=keys,
            )
        )
    links_from: dict[str, list[Link]] = defaultdict(list)
    links_to: dict[str, list[Link]] = defaultdict(list)
    for link in bundle.links:
        links_from[link.from_id].append(link)
        links_to[link.to_id].append(link)
    return EvidenceIndex(
        bundle=bundle,
        by_id=by_id,
        by_kind=dict(by_kind),
        by_item=dict(by_item),
        links_from=dict(links_from),
        links_to=dict(links_to),
        resources=indexed,
    )


def resource_as_document(resource: Resource) -> dict[str, Any]:
    return {"id": resource.id, "title": resource.title, "data": resource.data}
