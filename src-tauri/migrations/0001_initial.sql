CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installed_packs (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    source_label TEXT NOT NULL,
    edition TEXT,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    install_path TEXT NOT NULL UNIQUE,
    manifest_json TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    installed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practice_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    pack_id TEXT REFERENCES installed_packs(id) ON DELETE RESTRICT,
    test_id TEXT,
    module TEXT CHECK (module IS NULL OR module IN ('reading', 'listening', 'writing')),
    mode TEXT NOT NULL DEFAULT 'study' CHECK (mode IN ('study', 'exam', 'review')),
    status TEXT NOT NULL DEFAULT 'in-progress' CHECK (status IN ('in-progress', 'submitted', 'abandoned')),
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0)
);

CREATE TABLE IF NOT EXISTS answers (
    session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    answer_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (session_id, question_id)
);

CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('highlight', 'underline')),
    color TEXT,
    block_id TEXT NOT NULL,
    start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
    end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
    quote TEXT NOT NULL,
    prefix TEXT NOT NULL DEFAULT '',
    suffix TEXT NOT NULL DEFAULT '',
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS writing_drafts (
    session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER NOT NULL CHECK (word_count >= 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (session_id, task_id)
);

CREATE TABLE IF NOT EXISTS writing_versions (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('manual', 'submitted')),
    content TEXT NOT NULL,
    word_count INTEGER NOT NULL CHECK (word_count >= 0),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vocabulary_items (
    id TEXT PRIMARY KEY NOT NULL,
    term TEXT NOT NULL,
    normalized_term TEXT NOT NULL,
    source_pack_id TEXT,
    source_test_id TEXT,
    source_module TEXT,
    source_block_id TEXT,
    context TEXT,
    meaning_json TEXT,
    learning_state TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_runs (
    id TEXT PRIMARY KEY NOT NULL,
    action TEXT NOT NULL,
    provider_id TEXT,
    input_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    token_metadata_json TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error_code TEXT
);
