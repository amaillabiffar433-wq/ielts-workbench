CREATE TABLE review_items (
    id TEXT PRIMARY KEY NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('mistake', 'marked', 'vocabulary', 'manual')),
    pack_id TEXT REFERENCES installed_packs(id) ON DELETE RESTRICT,
    test_id TEXT,
    module TEXT CHECK (module IS NULL OR module IN ('reading', 'listening', 'writing')),
    question_id TEXT,
    vocabulary_id TEXT REFERENCES vocabulary_items(id) ON DELETE CASCADE,
    source_session_id TEXT REFERENCES practice_sessions(id) ON DELETE SET NULL,
    source_start_ms INTEGER CHECK (source_start_ms IS NULL OR source_start_ms >= 0),
    interval_days INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0 AND interval_days <= 3650),
    repetitions INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
    due_at TEXT NOT NULL,
    last_reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
        (source_kind = 'vocabulary' AND vocabulary_id IS NOT NULL)
        OR
        (source_kind <> 'vocabulary' AND pack_id IS NOT NULL AND test_id IS NOT NULL AND module IS NOT NULL AND question_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX review_items_question_identity
    ON review_items(source_kind, pack_id, test_id, module, question_id)
    WHERE question_id IS NOT NULL;

CREATE UNIQUE INDEX review_items_vocabulary_identity
    ON review_items(vocabulary_id)
    WHERE vocabulary_id IS NOT NULL;

CREATE INDEX review_items_due
    ON review_items(due_at, source_kind);

CREATE TABLE review_events (
    id TEXT PRIMARY KEY NOT NULL,
    review_item_id TEXT NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
    rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
    previous_interval_days INTEGER NOT NULL CHECK (previous_interval_days >= 0),
    next_interval_days INTEGER NOT NULL CHECK (next_interval_days >= 0),
    reviewed_at TEXT NOT NULL,
    next_due_at TEXT NOT NULL
);

CREATE INDEX review_events_item_time
    ON review_events(review_item_id, reviewed_at DESC);
