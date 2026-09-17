ALTER TABLE vocabulary_items ADD COLUMN source_book_title TEXT;
ALTER TABLE vocabulary_items ADD COLUMN source_test_title TEXT;
ALTER TABLE vocabulary_items ADD COLUMN source_section_id TEXT;
ALTER TABLE vocabulary_items ADD COLUMN source_section_title TEXT;
ALTER TABLE vocabulary_items ADD COLUMN source_question_id TEXT;
ALTER TABLE vocabulary_items ADD COLUMN source_question_number INTEGER;
ALTER TABLE vocabulary_items ADD COLUMN sentence TEXT NOT NULL DEFAULT '';
ALTER TABLE vocabulary_items ADD COLUMN context_before TEXT NOT NULL DEFAULT '';
ALTER TABLE vocabulary_items ADD COLUMN context_after TEXT NOT NULL DEFAULT '';
ALTER TABLE vocabulary_items ADD COLUMN note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_vocabulary_source
    ON vocabulary_items(source_pack_id, source_test_id, source_section_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vocabulary_learning_state
    ON vocabulary_items(learning_state, updated_at DESC);
