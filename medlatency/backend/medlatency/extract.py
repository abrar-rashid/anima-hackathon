from __future__ import annotations

import json
import re
from typing import Any

from .hashing import stable_id
from .index import EvidenceIndex, resource_as_document
from .llm import LLMProvider, LLMUnavailable
from .models import ExtractedMention, IntentKind, PatientBundle, Preference, Resource, TaskFamily, TimingHint
from .pointers import extract_text_at, pointer_exists, resolve_pointer

PROMPT_VERSION = "medlatency.extract.v1"

NEGATION_MARKERS = (
    "no prescription required",
    "no referral required",
    "do not prescribe",
    "not required",
    "not indicated",
)
CONDITIONAL_MARKERS = ("consider ", "if symptoms persist", "if not already", "if needed", "should symptoms")
PREFERENCE_MARKERS = ("prefer", "locally", "ground-floor", "accessible", "cannot use stairs")
COMMITMENT_MARKERS = ("i will ", "we will ", "plan to ", "i am going to ")
REQUEST_MARKERS = ("please ", "kindly ", "arrange ", "request ", "book ", "match ", "call ")
PATIENT_REQUEST_MARKERS = ("i would like", "please book", "can you book", "i need an appointment")
HISTORICAL_MARKERS = ("was completed", "already done", "previously arranged", "last result")
CANCEL_MARKERS = ("cancelled", "canceled", "superseded", "replaced by", "do not proceed")

FAMILY_HINTS: list[tuple[TaskFamily, tuple[str, ...]]] = [
    ("diagnostic_testing", ("blood", "fbc", "panel", "tsh", "thyroid", "result", "pathology", "ct", "mri", "x-ray")),
    ("appointment_coordination", ("appointment", "book", "clinic", "follow-up", "follow up")),
    ("communication", ("reminder", "message", "call", "telephone", "script", "letter sent")),
    ("external_document", ("medicines note", "document", "note", "report")),
    ("document_follow_up", ("document task", "close this", "discharge")),
]

EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["mentions", "preferences"],
    "properties": {
        "mentions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "label",
                    "intended_outcome",
                    "family",
                    "intent",
                    "quotation",
                    "source_resource_id",
                    "json_pointer",
                ],
                "properties": {
                    "label": {"type": "string"},
                    "intended_outcome": {"type": "string"},
                    "family": {
                        "type": "string",
                        "enum": [
                            "diagnostic_testing",
                            "document_follow_up",
                            "appointment_coordination",
                            "communication",
                            "external_document",
                            "unknown",
                        ],
                    },
                    "intent": {
                        "type": "string",
                        "enum": [
                            "explicit_instruction",
                            "explicit_commitment",
                            "patient_request",
                            "conditional_plan",
                            "historical_action",
                            "negation",
                            "cancellation",
                            "preference_constraint",
                            "inferred_followup",
                        ],
                    },
                    "quotation": {"type": "string"},
                    "source_resource_id": {"type": "string"},
                    "json_pointer": {"type": "string"},
                    "responsible_role": {"type": ["string", "null"]},
                    "condition": {"type": ["string", "null"]},
                    "item_key": {"type": ["string", "null"]},
                    "parent_label": {"type": ["string", "null"]},
                    "dependency_kind": {"type": ["string", "null"]},
                },
            },
        },
        "preferences": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["text", "quotation", "source_resource_id", "json_pointer"],
                "properties": {
                    "text": {"type": "string"},
                    "quotation": {"type": "string"},
                    "source_resource_id": {"type": "string"},
                    "json_pointer": {"type": "string"},
                    "does_not_establish": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
    },
}


def infer_family(text: str, hinted: str | None = None) -> TaskFamily:
    if hinted in {
        "diagnostic_testing",
        "document_follow_up",
        "appointment_coordination",
        "communication",
        "external_document",
        "unknown",
    }:
        return hinted  # type: ignore[return-value]
    lowered = text.lower()
    for family, tokens in FAMILY_HINTS:
        if any(token in lowered for token in tokens):
            return family
    return "unknown"


def classify_intent(text: str, hinted: str | None = None) -> IntentKind:
    if hinted in {
        "explicit_instruction",
        "explicit_commitment",
        "patient_request",
        "conditional_plan",
        "historical_action",
        "negation",
        "cancellation",
        "preference_constraint",
        "inferred_followup",
    }:
        return hinted  # type: ignore[return-value]
    lowered = text.lower()
    if any(marker in lowered for marker in NEGATION_MARKERS):
        return "negation"
    if any(marker in lowered for marker in CANCEL_MARKERS) and "please" not in lowered:
        return "cancellation"
    if any(marker in lowered for marker in CONDITIONAL_MARKERS):
        return "conditional_plan"
    if any(marker in lowered for marker in PREFERENCE_MARKERS) and not any(m in lowered for m in REQUEST_MARKERS):
        return "preference_constraint"
    if any(marker in lowered for marker in HISTORICAL_MARKERS):
        return "historical_action"
    if any(marker in lowered for marker in PATIENT_REQUEST_MARKERS):
        return "patient_request"
    if any(marker in lowered for marker in COMMITMENT_MARKERS):
        return "explicit_commitment"
    if any(marker in lowered for marker in REQUEST_MARKERS):
        return "explicit_instruction"
    return "inferred_followup"


def verify_mention(bundle: PatientBundle, mention: ExtractedMention) -> ExtractedMention:
    resource = next((item for item in bundle.resources if item.id == mention.source_resource_id), None)
    flags: list[str] = []
    ok = True
    if resource is None:
        return mention.model_copy(update={"evidence_ok": False, "evidence_flags": ["missing_source_resource"]})
    document = resource_as_document(resource)
    if not pointer_exists(document, mention.json_pointer):
        ok = False
        flags.append("missing_json_pointer")
        haystack = json.dumps(resource.data)
    else:
        haystack = extract_text_at(document, mention.json_pointer) or json.dumps(resolve_pointer(document, mention.json_pointer), default=str)
    if mention.quotation.strip() and mention.quotation not in haystack:
        ok = False
        flags.append("quotation_not_found")
    return mention.model_copy(update={"evidence_ok": ok, "evidence_flags": flags})


def _mention(
    resource: Resource,
    label: str,
    quotation: str,
    pointer: str,
    intent: IntentKind,
    family: TaskFamily,
    outcome: str,
    role: str | None = None,
    item_key: str | None = None,
    conditions: list[str] | None = None,
    parent: str | None = None,
    dependency_kind: str | None = None,
    documented: bool = True,
) -> ExtractedMention:
    mention_id = stable_id(resource.patient_id or "", resource.id, pointer, label, prefix="mention")
    return ExtractedMention(
        mention_id=mention_id,
        label=label,
        intended_outcome=outcome,
        family=family,
        intent=intent,
        quotation=quotation,
        source_resource_id=resource.id,
        json_pointer=pointer,
        responsible_role=role,
        timing=None,
        conditions=conditions or [],
        item_key=item_key,
        parent_mention_id=parent,
        dependency_kind=dependency_kind,  # type: ignore[arg-type]
        dependency_origin="documented" if documented else "template_suggested",
        documented=documented and intent != "inferred_followup",
    )


def _structured_actions(resource: Resource) -> list[ExtractedMention]:
    mentions: list[ExtractedMention] = []
    actions = resource.data.get("requested_actions") or []
    if not isinstance(actions, list):
        return mentions
    parent_ids: dict[str, str] = {}
    for index, action in enumerate(actions):
        if not isinstance(action, dict):
            continue
        label = str(action.get("action") or action.get("label") or "").strip()
        if not label:
            continue
        quotation = str(action.get("text") or resource.data.get("text") or label)
        pointer = f"/data/requested_actions/{index}/action"
        intent = classify_intent(str(action.get("intent_text") or label), action.get("intent"))
        family = infer_family(f"{label} {action.get('family', '')}", action.get("family"))
        mention = _mention(
            resource,
            label=label,
            quotation=label if label in quotation or True else quotation,
            pointer=pointer,
            intent=intent,
            family=family,
            outcome=str(action.get("intended_outcome") or f"Complete: {label}"),
            role=action.get("role"),
            item_key=action.get("item") or action.get("item_key"),
            conditions=[str(action["condition"])] if action.get("condition") else [],
            documented=True,
        )
        if mention.quotation not in quotation and mention.quotation not in (resource.data.get("text") or ""):
            mention = mention.model_copy(update={"quotation": label})
        mentions.append(mention)
        parent_ids[label.lower()] = mention.mention_id
    for mention in mentions:
        action = next(
            (
                item
                for item in actions
                if isinstance(item, dict) and str(item.get("action") or "").strip().lower() == mention.label.lower()
            ),
            {},
        )
        after = action.get("after") or []
        if isinstance(after, list) and after:
            # parent is the later action; prerequisites already extracted
            pass
    # Wire documented prerequisites: later actions with after[] become parents
    by_label = {item.label.lower(): item for item in mentions}
    for action in actions:
        if not isinstance(action, dict):
            continue
        child_label = str(action.get("action") or "").strip().lower()
        after = action.get("after") or []
        if child_label not in by_label or not isinstance(after, list):
            continue
        parent = by_label[child_label]
        for prereq in after:
            key = str(prereq).strip().lower()
            if key in by_label:
                dep = by_label[key]
                idx = mentions.index(dep)
                mentions[idx] = dep.model_copy(
                    update={
                        "parent_mention_id": parent.mention_id,
                        "dependency_kind": "prerequisite",
                        "dependency_origin": "documented",
                    }
                )
    return mentions


def _narrative_mentions(resource: Resource) -> tuple[list[ExtractedMention], list[Preference]]:
    text = ""
    pointer = "/data/text"
    if isinstance(resource.data.get("text"), str) and resource.data["text"].strip():
        text = resource.data["text"]
    elif isinstance(resource.data.get("body"), str):
        text = resource.data["body"]
        pointer = "/data/body"
    elif isinstance(resource.data.get("script"), str):
        text = resource.data["script"]
        pointer = "/data/script"
    mentions: list[ExtractedMention] = []
    preferences: list[Preference] = []
    if not text:
        return mentions, preferences

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    skip_if_structured = bool(resource.data.get("requested_actions"))
    for sentence in sentences:
        intent = classify_intent(sentence)
        if intent == "preference_constraint" or (
            any(marker in sentence.lower() for marker in PREFERENCE_MARKERS)
            and intent not in {"explicit_instruction", "patient_request"}
        ):
            pref_id = stable_id(resource.id, sentence, prefix="pref")
            preferences.append(
                Preference(
                    id=pref_id,
                    text=sentence,
                    quotation=sentence,
                    source_resource_id=resource.id,
                    json_pointer=pointer,
                    constrains=["appointment_coordination"],
                    does_not_establish=["transport order", "booking", "clinical instruction"],
                )
            )
            if intent == "preference_constraint":
                continue
        if skip_if_structured and intent in {"explicit_instruction", "explicit_commitment", "patient_request"}:
            continue
        if intent == "inferred_followup" and not any(marker in sentence.lower() for marker in REQUEST_MARKERS + CONDITIONAL_MARKERS + NEGATION_MARKERS):
            continue
        family = infer_family(sentence)
        mentions.append(
            _mention(
                resource,
                label=_label_from_sentence(sentence),
                quotation=sentence,
                pointer=pointer,
                intent=intent,
                family=family,
                outcome=_outcome_for(intent, sentence),
                conditions=[sentence] if intent == "conditional_plan" else [],
            )
        )
    return mentions, preferences


def _label_from_sentence(sentence: str) -> str:
    cleaned = re.sub(r"^(please|kindly)\s+", "", sentence.strip(), flags=re.I)
    cleaned = cleaned.rstrip(".")
    if len(cleaned) > 90:
        cleaned = cleaned[:87] + "..."
    return cleaned[0].upper() + cleaned[1:] if cleaned else sentence


def _outcome_for(intent: IntentKind, sentence: str) -> str:
    if intent == "negation":
        return "Do not create an active task from this negation"
    if intent == "conditional_plan":
        return "Remain conditional until the stated condition is evidenced"
    if intent == "preference_constraint":
        return "Constrain how work is done; do not create a new order"
    if intent == "historical_action":
        return "Record a past action; do not treat as a new request"
    if intent == "cancellation":
        return "Stop or replace the referenced task"
    return f"Carry out the documented action: {sentence.rstrip('.')}"


def heuristic_extract(bundle: PatientBundle, index: EvidenceIndex) -> tuple[list[ExtractedMention], list[Preference], list[str]]:
    mentions: list[ExtractedMention] = []
    preferences: list[Preference] = []
    uncertainties: list[str] = [
        "Heuristic extraction is labelled and is not live LLM analysis.",
        "A source record status is not the status of every task mentioned inside it.",
    ]
    for resource in bundle.resources:
        mentions.extend(_structured_actions(resource))
        extra, prefs = _narrative_mentions(resource)
        mentions.extend(extra)
        preferences.extend(prefs)
        if resource.kind == "telephone_script" or resource.data.get("queued") is True:
            uncertainties.append(f"{resource.id}: queued script is not a transcript or completed conversation.")
    verified = [verify_mention(bundle, mention) for mention in mentions]
    return verified, preferences, uncertainties


def _llm_prompt(bundle: PatientBundle) -> str:
    excerpts = []
    for resource in bundle.resources:
        excerpts.append(
            {
                "id": resource.id,
                "kind": resource.kind,
                "title": resource.title,
                "source_status": resource.source_status,
                "event_time": resource.event_time.isoformat() if resource.event_time else None,
                "data": resource.data,
            }
        )
    return (
        "Patient records follow. Extract documented actions, commitments, patient requests, "
        "conditional plans, historical actions, negations, cancellations, and preferences. "
        "Keep those categories distinct. Do not invent follow-up work. "
        "Do not treat a source_status as completion of embedded tasks. "
        "Preferences constrain tasks; they are not transport or booking orders. "
        "Copy quotations exactly and cite resource id plus JSON pointer from /data or /title.\n\n"
        + json.dumps({"patient_id": bundle.patient.id, "resources": excerpts}, default=str)
    )


def llm_extract(bundle: PatientBundle, provider: LLMProvider) -> tuple[list[ExtractedMention], list[Preference], list[str]]:
    raw = provider.complete_json(_llm_prompt(bundle), EXTRACTION_SCHEMA)
    mentions: list[ExtractedMention] = []
    for item in raw.get("mentions", []):
        resource = next((r for r in bundle.resources if r.id == item["source_resource_id"]), None)
        if resource is None:
            mention = ExtractedMention(
                mention_id=stable_id(bundle.patient.id, json.dumps(item, sort_keys=True), prefix="mention"),
                label=item["label"],
                intended_outcome=item["intended_outcome"],
                family=item["family"],
                intent=item["intent"],
                quotation=item["quotation"],
                source_resource_id=item["source_resource_id"],
                json_pointer=item["json_pointer"],
                evidence_ok=False,
                evidence_flags=["missing_source_resource"],
            )
            mentions.append(mention)
            continue
        mentions.append(
            verify_mention(
                bundle,
                _mention(
                    resource,
                    label=item["label"],
                    quotation=item["quotation"],
                    pointer=item["json_pointer"],
                    intent=item["intent"],
                    family=item["family"],
                    outcome=item["intended_outcome"],
                    role=item.get("responsible_role"),
                    item_key=item.get("item_key"),
                    conditions=[item["condition"]] if item.get("condition") else [],
                    documented=item["intent"] != "inferred_followup",
                ),
            )
        )
    preferences = [
        Preference(
            id=stable_id(item["source_resource_id"], item["text"], prefix="pref"),
            text=item["text"],
            quotation=item["quotation"],
            source_resource_id=item["source_resource_id"],
            json_pointer=item["json_pointer"],
            does_not_establish=item.get("does_not_establish") or ["transport order"],
        )
        for item in raw.get("preferences", [])
    ]
    return mentions, preferences, ["Live LLM extraction; quotations were span-checked."]


def extract_tasks(
    bundle: PatientBundle,
    index: EvidenceIndex,
    provider: LLMProvider | None = None,
    replay: dict[str, Any] | None = None,
) -> tuple[list[ExtractedMention], list[Preference], list[str], str]:
    if replay is not None:
        mentions = [ExtractedMention.model_validate(item) for item in replay.get("mentions", [])]
        preferences = [Preference.model_validate(item) for item in replay.get("preferences", [])]
        mentions = [verify_mention(bundle, mention) for mention in mentions]
        return mentions, preferences, ["Replay analysis loaded from a labelled fixture; not live LLM analysis."], "replay"
    if provider is not None and getattr(provider, "name", "disabled") != "disabled":
        try:
            mentions, preferences, notes = llm_extract(bundle, provider)
            return mentions, preferences, notes, "live_llm"
        except LLMUnavailable:
            pass
        except Exception as exc:  # noqa: BLE001
            mentions, preferences, notes = heuristic_extract(bundle, index)
            notes.append(f"LLM extraction failed; fell back to labelled heuristic: {exc}")
            return mentions, preferences, notes, "heuristic"
    mentions, preferences, notes = heuristic_extract(bundle, index)
    return mentions, preferences, notes, "heuristic"
