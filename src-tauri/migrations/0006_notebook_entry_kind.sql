ALTER TABLE vocabulary_items ADD COLUMN entry_kind TEXT NOT NULL DEFAULT 'word';

CREATE INDEX IF NOT EXISTS idx_vocabulary_entry_kind
    ON vocabulary_items(entry_kind, updated_at DESC);
