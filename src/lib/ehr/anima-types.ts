/** Shapes from the Anima simulator export, schema `anima.patient.timeline.v1`. */

export interface AnimaTime {
  raw: number;
  source_field: string;
  clock: string;
  iso_utc: string;
  epoch_ms: number;
  precision: string;
  issue: string | null;
}

export interface AnimaActor {
  kind: string;
  name: string;
}

export interface AnimaProvenanceEntry {
  time: number;
  actor: AnimaActor;
  action: string;
  source: string;
  version: number;
}

export interface AnimaResource {
  resource_id: string;
  patient_id: string;
  source_kind: string;
  category: string;
  title: string;
  source_status_current: string;
  /** The site that owns the record. Maps onto a rail lane. */
  owner: string;
  /** The sites permitted to SEE it. This is where invisibility is provable. */
  visible_to: string[];
  priority: string;
  created_at: AnimaTime | null;
  due_at: AnimaTime | null;
  text_fields: { path: string; text: string }[];
  data: Record<string, unknown>;
  provenance: { created?: AnimaProvenanceEntry; changes: AnimaProvenanceEntry[] };
  workflow_id: string | null;
  sources: { endpoint: string; captured_at: string; simulation_now: number }[];
}

export interface AnimaEvent {
  event_id: string;
  resource_id: string | null;
  event_type: string;
  event_group: string;
  occurred_at: string;
  actor: AnimaActor | null;
  source_status_at_event: string | null;
  evidence: Record<string, unknown>;
  text_fields: { path: string; text: string }[];
}

export interface AnimaWorkflow {
  workflow_id: string;
  basis: string;
  resource_ids: string[];
  event_ids: string[];
  /** The simulator does NOT infer clinical tasks. Always "not_inferred". */
  clinical_task_status: string;
}

export interface AnimaBundle {
  schema_version: string;
  patient_id: string;
  patient: {
    id: string;
    name: string;
    birthDate: string;
    conditions?: string[];
    needs?: string[];
    goals?: string[];
    localIds?: Record<string, string>;
    synthetic?: boolean;
  };
  extraction: {
    source_api: string;
    world: string;
    team: string;
    team_scopes: string[];
    simulation_clock_start: { now: number; paused: boolean; speed: number };
    site_contexts: { endpoint: string; context: { now: number } }[];
  };
  resources: AnimaResource[];
  events: AnimaEvent[];
  workflows: AnimaWorkflow[];
  statistics: Record<string, number>;
}
