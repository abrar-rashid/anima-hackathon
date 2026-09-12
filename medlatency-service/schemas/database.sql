
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS bundles(fingerprint TEXT PRIMARY KEY, patient_id TEXT NOT NULL, imported_at TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS patients(id TEXT PRIMARY KEY, current_bundle TEXT NOT NULL REFERENCES bundles(fingerprint));
CREATE TABLE IF NOT EXISTS analyses(id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, task_id TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')), created_at TEXT NOT NULL, analysis_id TEXT, error TEXT);
CREATE INDEX IF NOT EXISTS analysis_patient ON analyses(patient_id,created_at);
CREATE INDEX IF NOT EXISTS review_patient ON reviews(patient_id,created_at);
