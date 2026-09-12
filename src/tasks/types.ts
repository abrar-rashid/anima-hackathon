export type CitationRef = {
  resourceId: string
  resourceVersion: number
  fieldPath: string
}

export type SourceSuppliedProvenance = {
  kind: 'source-supplied'
  citation: CitationRef
}

export type DerivedProvenance = {
  kind: 'derived'
  rule: string
  from: readonly CitationRef[]
}

export type NotSuppliedProvenance = {
  kind: 'not-supplied-by-source'
}

export type FieldProvenance = SourceSuppliedProvenance | DerivedProvenance | NotSuppliedProvenance

export type Provenanced<T> = {
  value: T
  provenance: FieldProvenance
}

/** A string value is allowed only when a source field is cited. */
export type SourceOnlyNullable<T extends string = string> =
  | { value: T; provenance: SourceSuppliedProvenance }
  | { value: null; provenance: NotSuppliedProvenance }

/** Present values must cite a source field or carry the derivation rule that produced them. */
export type NullableCited<T> =
  | { value: T; provenance: SourceSuppliedProvenance }
  | { value: T; provenance: DerivedProvenance }
  | { value: null; provenance: NotSuppliedProvenance }

export type ClinicalPriorityValue = 'emergency' | 'urgent' | 'standard'

export type ClinicalPriorityField = SourceOnlyNullable<ClinicalPriorityValue>

export type TaskStatus =
  | 'proposed'
  | 'open'
  | 'accepted'
  | 'in_progress'
  | 'overdue'
  | 'unavailable'
  | 'stale'
  | 'failed'
  | 'cancelled'
  | 'closed'
  | 'reopened'

export type TaskKindId = string

export type ActorAttribution = 'source-team' | 'app-side'

export type AccountableOwnerValue = {
  teamId: string
  actorId: string | null
  actorAttribution: ActorAttribution
}

export type AccountableOwner = {
  value: AccountableOwnerValue
  provenance: SourceSuppliedProvenance | DerivedProvenance
}

export type ActorIdentityValue = {
  teamId: string
  actorId: string | null
  actorAttribution: ActorAttribution
}

export type ActorIdentityField = NullableCited<ActorIdentityValue>

export type TaskCitation =
  | {
      kind: 'source-record'
      resourceId: string
      resourceVersion: number
      fieldPath: string
    }
  | {
      kind: 'structural-gap'
      resourceId: string
      resourceVersion: number
      ruleText: string
    }
  | {
      kind: 'free-text'
      resourceId: string
      resourceVersion: number
      quotedSpan: string
    }

export type ExtractionAttribution =
  | {
      method: 'structural-gap'
      extractorId: string
      ruleText: string
    }
  | {
      method: 'free-text'
      label: 'agent-extracted'
      acceptance: 'proposal'
    }
  | {
      method: 'source-observed'
      ruleText: string
    }

export type ClosureEvidenceKind =
  | 'transfer-accepted'
  | 'clinical-review-recorded'
  | 'plan-recorded'
  | 'patient-contact-evidenced'
  | 'readback-visible'
  | 'activity-evidenced'
  | 'outcome-evidenced'
  | 'matching-result-visible'
  | 'appointment-visible'
  | 'source-task-completed'

export type ClosureEvidence = {
  kind: ClosureEvidenceKind
  citation: CitationRef
}

/**
 * An observation of a task at one simulator time. There is no update and no delete;
 * current state is derived by replaying these entries.
 */
export type TaskLedgerEntry = {
  entryId: string
  timestamp: number
  taskId: Provenanced<string>
  patientId: Provenanced<string>
  kindId: Provenanced<TaskKindId>
  status: Provenanced<TaskStatus>
  owner: AccountableOwner
  note: NullableCited<string>
  deadline: NullableCited<number>
  clinicalPriority: ClinicalPriorityField
  snomedId: SourceOnlyNullable<string>
  performedBy: ActorIdentityField
  sampleId: SourceOnlyNullable<string>
  requestedBy: ActorIdentityField
  episodeId: NullableCited<string>
  citation: TaskCitation
  extraction: ExtractionAttribution | null
  closureEvidence: readonly ClosureEvidence[]
}

export type TaskStepLatency = {
  fromStatus: TaskStatus
  toStatus: TaskStatus
  fromTimestamp: number
  toTimestamp: number
  durationMs: number
}

export type TaskState = {
  taskId: string
  patientId: string
  kindId: TaskKindId
  status: TaskStatus
  owner: AccountableOwnerValue
  note: string | null
  deadline: number | null
  clinicalPriority: ClinicalPriorityValue | null
  snomedId: string | null
  performedBy: ActorIdentityValue | null
  sampleId: string | null
  requestedBy: ActorIdentityValue | null
  episodeId: string | null
  episodeDerivationRule: string | null
  citation: TaskCitation
  extraction: ExtractionAttribution | null
  closureEvidence: readonly ClosureEvidence[]
  lastEntryId: string
  lastTimestamp: number
  historyEntryIds: string[]
  stepLatencies: TaskStepLatency[]
}

export const TEAM_SCHEMA_FIELDS = [
  'taskId',
  'patientId',
  'kindId',
  'status',
  'owner',
  'note',
  'deadline',
  'clinicalPriority',
  'snomedId',
  'performedBy',
  'sampleId',
  'requestedBy',
  'episodeId',
] as const

export const NO_PRIORITY_SUPPLIED_LABEL = 'no priority supplied by source'

export function sourceSupplied<T>(
  value: T,
  citation: CitationRef,
): { value: T; provenance: SourceSuppliedProvenance } {
  return { value, provenance: { kind: 'source-supplied', citation } }
}

export function derived<T>(
  value: T,
  rule: string,
  from: readonly CitationRef[],
): { value: T; provenance: DerivedProvenance } {
  return { value, provenance: { kind: 'derived', rule, from } }
}

export function notSupplied(): { value: null; provenance: NotSuppliedProvenance } {
  return { value: null, provenance: { kind: 'not-supplied-by-source' } }
}

export function sourceOnly<T extends string>(
  value: T,
  citation: CitationRef,
): { value: T; provenance: SourceSuppliedProvenance } {
  return sourceSupplied(value, citation)
}

export function isHonestSourceCode(field: SourceOnlyNullable<string>): boolean {
  if (field.value == null) return field.provenance.kind === 'not-supplied-by-source'
  return (
    field.provenance.kind === 'source-supplied' && field.provenance.citation.fieldPath.trim().length > 0
  )
}

function hasProvenance(field: unknown): field is { value: unknown; provenance: FieldProvenance } {
  if (field == null || typeof field !== 'object') return false
  if (!('value' in field) || !('provenance' in field)) return false
  const provenance = (field as { provenance: unknown }).provenance
  if (provenance == null || typeof provenance !== 'object' || !('kind' in provenance)) return false
  const kind = (provenance as { kind: unknown }).kind
  return kind === 'source-supplied' || kind === 'derived' || kind === 'not-supplied-by-source'
}

export function populatedFieldsHaveProvenance(entry: TaskLedgerEntry): boolean {
  for (const key of TEAM_SCHEMA_FIELDS) {
    const field = entry[key]
    if (!hasProvenance(field)) return false
    if (field.value != null && field.provenance.kind === 'not-supplied-by-source') return false
    if (field.provenance.kind === 'derived' && field.provenance.rule.trim().length === 0) return false
    if (
      field.provenance.kind === 'source-supplied' &&
      (field.provenance.citation.resourceId.length === 0 ||
        field.provenance.citation.fieldPath.trim().length === 0)
    ) {
      return false
    }
  }
  return true
}

export function clinicalPriorityDisplay(field: ClinicalPriorityField): string {
  return field.value == null ? NO_PRIORITY_SUPPLIED_LABEL : field.value
}

export function clinicalPriorityFromSource(
  priority: string | null | undefined,
  citation: CitationRef,
): ClinicalPriorityField {
  if (priority === 'emergency' || priority === 'urgent' || priority === 'standard') {
    return sourceOnly(priority, citation)
  }
  return notSupplied()
}
