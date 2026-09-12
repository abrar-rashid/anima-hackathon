/**
 * Versioned SQLite schema for the durable store.
 * v1 is the initial layout. Later stages add a new MIGRATIONS entry and bump SCHEMA_VERSION;
 * applyMigrations runs only versions not yet recorded, so existing rows are not wiped.
 */
export const SCHEMA_VERSION = 1

export const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY
) STRICT;

CREATE TABLE cases (
  case_id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  owner_team_id TEXT NOT NULL,
  ownership_state TEXT NOT NULL,
  closure_state TEXT NOT NULL,
  accepting_actor_id TEXT,
  ack_deadline_at INTEGER,
  updated_at INTEGER NOT NULL,
  case_json TEXT NOT NULL
) STRICT;

CREATE TABLE case_events (
  case_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  PRIMARY KEY (case_id, seq),
  FOREIGN KEY (case_id) REFERENCES cases(case_id)
) STRICT;

CREATE TABLE audit_entries (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL UNIQUE,
  case_id TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  simulator_time INTEGER NOT NULL,
  actor_id TEXT,
  actor_json TEXT NOT NULL,
  action TEXT NOT NULL,
  subject_json TEXT NOT NULL,
  detail TEXT NOT NULL
) STRICT;

CREATE TABLE protocols (
  protocol_id TEXT PRIMARY KEY,
  protocol_json TEXT NOT NULL
) STRICT;

CREATE INDEX idx_cases_patient ON cases(patient_id);
CREATE INDEX idx_cases_owner ON cases(owner_team_id);
CREATE INDEX idx_cases_ownership ON cases(ownership_state);
CREATE INDEX idx_cases_closure ON cases(closure_state);
CREATE INDEX idx_cases_overdue ON cases(ack_deadline_at, ownership_state)
  WHERE accepting_actor_id IS NULL AND ack_deadline_at IS NOT NULL;
CREATE INDEX idx_events_case_seq ON case_events(case_id, seq);
CREATE INDEX idx_audit_case ON audit_entries(case_id, seq);
CREATE INDEX idx_audit_actor ON audit_entries(actor_id, seq);
CREATE INDEX idx_audit_recorded ON audit_entries(recorded_at, seq);

CREATE TRIGGER audit_entries_no_update
BEFORE UPDATE ON audit_entries
BEGIN
  SELECT RAISE(ABORT, 'audit log is append-only');
END;

CREATE TRIGGER audit_entries_no_delete
BEFORE DELETE ON audit_entries
BEGIN
  SELECT RAISE(ABORT, 'audit log is append-only');
END;
`,
  },
]
