CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0),
  project_json TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  project_id TEXT NOT NULL REFERENCES projects(id), revision INTEGER NOT NULL,
  project_json TEXT NOT NULL, at TEXT NOT NULL, source TEXT NOT NULL, summary TEXT NOT NULL,
  PRIMARY KEY(project_id, revision)
);
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  base_revision INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),
  summary TEXT NOT NULL, operations_json TEXT NOT NULL, changes_json TEXT NOT NULL,
  candidate_json TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL,
  decided_at TEXT, applied_revision INTEGER
);
CREATE INDEX IF NOT EXISTS project_owners ON projects(owner_id, updated_at);
CREATE INDEX IF NOT EXISTS project_proposals ON proposals(project_id, created_at);
