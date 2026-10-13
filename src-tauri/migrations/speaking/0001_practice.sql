CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT INTO schema_migrations VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE speaking_sessions (
 id TEXT PRIMARY KEY NOT NULL, topic_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('in-progress','completed')),
 elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_seconds >= 0), notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX speaking_topic_recent ON speaking_sessions(topic_id,updated_at);
CREATE TABLE speaking_favorites(topic_id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE speaking_recordings(
 id TEXT PRIMARY KEY NOT NULL,session_id TEXT NOT NULL REFERENCES speaking_sessions(id),
 relative_path TEXT NOT NULL,sha256 TEXT NOT NULL,byte_length INTEGER NOT NULL,mime_type TEXT NOT NULL,created_at TEXT NOT NULL
);
