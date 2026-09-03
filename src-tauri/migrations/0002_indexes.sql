CREATE INDEX IF NOT EXISTS idx_sessions_pack_updated
    ON practice_sessions(pack_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_answers_session_updated
    ON answers(session_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_annotations_session_block
    ON annotations(session_id, block_id, start_offset);

CREATE INDEX IF NOT EXISTS idx_writing_versions_session_task
    ON writing_versions(session_id, task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vocabulary_normalized_term
    ON vocabulary_items(normalized_term);

