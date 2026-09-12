from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

BUNDLE_VERSION = "medlatency.patient.v1"
ANALYSIS_VERSION = "medlatency.analysis.v1"
PROMPT_VERSION = "medlatency.extract.v1"

DatasetMode = Literal["fixture", "live"]
AnalysisMode = Literal["heuristic", "replay", "live_llm"]
ClockDomain = Literal["simulation", "wall", "unknown"]
CoverageStatus = Literal["ok", "partial", "failed", "skipped", "capped"]
EventVisibility = Literal["clinical", "communication", "plan", "record_metadata", "technical"]

IntentKind = Literal[
    "explicit_instruction",
    "explicit_commitment",
    "patient_request",
    "conditional_plan",
    "historical_action",
    "negation",
    "cancellation",
    "preference_constraint",
    "inferred_followup",
]

TaskFamily = Literal[
    "diagnostic_testing",
    "document_follow_up",
    "appointment_coordination",
    "communication",
    "external_document",
    "unknown",
]

EvidenceAssessment = Literal[
    "evidenced",
    "inferred",
    "explicitly_pending",
    "not_evidenced",
    "conflicting",
    "not_applicable",
]
Fulfillment = Literal["fulfilled", "explicitly_not_fulfilled", "unknown", "disputed"]
Disposition = Literal["active", "cancelled", "declined", "superseded", "reopened"]
MatchBasis = Literal["native_id", "explicit_link", "typed_window", "textual_similarity"]
Confidence = Literal["high", "medium", "low", "abstain"]
DependencyKind = Literal[
    "prerequisite",
    "independent",
    "parallel",
    "conditional_branch",
    "alternative",
    "supersedes",
    "cancels",
]
DependencyOrigin = Literal["documented", "template_suggested"]
AnalysisStatus = Literal["queued", "running", "completed", "failed"]
ReviewDecision = Literal[
    "accept_match",
    "reject_match",
    "correct_interpretation",
    "merge",
    "split",
    "dispute",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PatientIdentity(StrictModel):
    id: str
    display_name: str
    synthetic: bool = True
    demographics: dict[str, Any] = Field(default_factory=dict)


class DatasetIntegrity(StrictModel):
    bundle_sha256: str | None = None
    raw_manifest: list[dict[str, Any]] = Field(default_factory=list)


class Dataset(StrictModel):
    mode: DatasetMode
    source: str
    captured_at: datetime
    simulation_as_of: datetime | None = None
    world_id: str | None = None
    integrity: DatasetIntegrity = Field(default_factory=DatasetIntegrity)


class CoverageSource(StrictModel):
    id: str
    kind: str
    status: CoverageStatus
    detail: str = ""
    retrieved_at: datetime | None = None


class Coverage(StrictModel):
    full_history_guaranteed: bool = False
    sources: list[CoverageSource] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class Provenance(StrictModel):
    retrieved_at: datetime
    route: str
    response_sha256: str | None = None
    page_offset: int | None = None


class Resource(StrictModel):
    id: str
    patient_id: str | None
    kind: str
    title: str | None = None
    source_status: str | None = None
    version: int | None = None
    record_created_at: datetime | None = None
    event_time: datetime | None = None
    retrieved_at: datetime | None = None
    clock: ClockDomain = "simulation"
    site: str | None = None
    content_sha256: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    provenance: list[Provenance] = Field(default_factory=list)
    source_locations: list[str] = Field(default_factory=list)


class Event(StrictModel):
    id: str
    kind: str
    title: str | None = None
    at: datetime | None = None
    clock: ClockDomain = "simulation"
    patient_id: str | None = None
    resource_id: str | None = None
    visibility: EventVisibility = "clinical"
    data: dict[str, Any] = Field(default_factory=dict)


class Link(StrictModel):
    from_id: str
    to_id: str
    rel: str
    documented: bool = True


class PatientBundle(StrictModel):
    schema_version: str = BUNDLE_VERSION
    patient: PatientIdentity
    dataset: Dataset
    coverage: Coverage
    resources: list[Resource] = Field(default_factory=list)
    events: list[Event] = Field(default_factory=list)
    links: list[Link] = Field(default_factory=list)
    service_context: list[Resource] = Field(default_factory=list)


class TimingHint(StrictModel):
    text: str | None = None
    at: datetime | None = None
    deadline: datetime | None = None
    condition: str | None = None


class ExtractedMention(StrictModel):
    mention_id: str
    label: str
    intended_outcome: str
    family: TaskFamily
    intent: IntentKind
    quotation: str
    source_resource_id: str
    json_pointer: str
    responsible_role: str | None = None
    timing: TimingHint | None = None
    conditions: list[str] = Field(default_factory=list)
    applicable_preferences: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    documented: bool = True
    parent_mention_id: str | None = None
    dependency_kind: DependencyKind | None = None
    dependency_origin: DependencyOrigin | None = None
    item_key: str | None = None
    evidence_ok: bool = True
    evidence_flags: list[str] = Field(default_factory=list)


class Preference(StrictModel):
    id: str
    text: str
    quotation: str
    source_resource_id: str
    json_pointer: str
    constrains: list[str] = Field(default_factory=list)
    does_not_establish: list[str] = Field(default_factory=list)


class CandidateMatch(StrictModel):
    evidence_id: str
    stage: str
    basis: MatchBasis
    confidence: Confidence
    supporting: list[str] = Field(default_factory=list)
    conflicting: list[str] = Field(default_factory=list)
    review_required: bool = False
    accepted: bool | None = None


class StageResolution(StrictModel):
    stage: str
    assessment: EvidenceAssessment
    match: CandidateMatch | None = None
    origin: DependencyOrigin = "template_suggested"
    note: str = ""


class DependencyNode(StrictModel):
    task_id: str
    kind: DependencyKind
    origin: DependencyOrigin
    label: str


class ResolvedTask(StrictModel):
    id: str
    patient_id: str
    label: str
    intended_outcome: str
    family: TaskFamily
    intent: IntentKind
    documented: bool
    quotation: str
    source_resource_id: str
    json_pointer: str
    responsible_role: str | None = None
    timing: TimingHint | None = None
    conditions: list[str] = Field(default_factory=list)
    preferences: list[str] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    parent_id: str | None = None
    dependencies: list[DependencyNode] = Field(default_factory=list)
    progress: str
    evidence_assessment: EvidenceAssessment
    fulfillment: Fulfillment
    disposition: Disposition = "active"
    next_unresolved_step: str
    stages: list[StageResolution] = Field(default_factory=list)
    candidates: list[CandidateMatch] = Field(default_factory=list)
    item_key: str | None = None
    review_required: bool = False
    instance_key: str


class AnalysisRecord(StrictModel):
    schema_version: str = ANALYSIS_VERSION
    analysis_id: str
    patient_id: str
    dataset_mode: DatasetMode
    analysis_mode: AnalysisMode
    analysis_version: str = ANALYSIS_VERSION
    prompt_version: str = PROMPT_VERSION
    provider: str
    model_id: str | None = None
    input_fingerprint: str
    analysed_at: datetime
    status: AnalysisStatus
    error: str | None = None
    tasks: list[ResolvedTask] = Field(default_factory=list)
    preferences: list[Preference] = Field(default_factory=list)
    coverage_limitations: list[str] = Field(default_factory=list)
    extraction_uncertainties: list[str] = Field(default_factory=list)
    counting_rules: dict[str, str] = Field(default_factory=dict)


class ReviewRecord(StrictModel):
    review_id: str
    patient_id: str
    analysis_id: str
    task_id: str
    decision: ReviewDecision
    explanation: str
    payload: dict[str, Any] = Field(default_factory=dict)
    original: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    reviewer: str = "local"


class CountSummary(StrictModel):
    tasks_identified: int
    subtasks_identified: int
    with_progress_evidence: int
    with_fulfilled_outcomes: int
    with_outstanding_work: int
    with_unknown_fulfillment: int
    ambiguous_matches: int
    rules: dict[str, str]


class TaskCard(StrictModel):
    id: str
    label: str
    intended_outcome: str
    responsible_role: str
    progress: str
    evidence_assessment: EvidenceAssessment
    fulfillment: Fulfillment
    disposition: Disposition
    next_unresolved_step: str
    quotation: str
    documented: bool
    intent: IntentKind
    family: TaskFamily
    review_required: bool
    parent_id: str | None = None


class DemoHighlight(StrictModel):
    task_id: str
    kind: str
    why_useful: str


class EvidenceItem(StrictModel):
    resource_id: str
    json_pointer: str
    quotation: str
    event_time: datetime | None = None
    record_created_at: datetime | None = None
    relevance: str
    interpretation: Literal["supporting", "conflicting", "context"]
    assessment: EvidenceAssessment
    stage: str | None = None


class TimelineItem(StrictModel):
    id: str
    kind: str
    title: str
    at: datetime | None = None
    clock: ClockDomain
    visibility: EventVisibility
    resource_id: str | None = None
    note: str = ""


class PitchView(StrictModel):
    overview: dict[str, Any]
    counts: CountSummary
    tasks: list[TaskCard]
    graphs: dict[str, list[DependencyNode]]
    evidence: dict[str, list[EvidenceItem]]
    timeline: list[TimelineItem]
    highlights: list[DemoHighlight]
    analysis: dict[str, Any]
