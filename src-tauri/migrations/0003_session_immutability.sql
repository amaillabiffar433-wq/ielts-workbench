CREATE TRIGGER IF NOT EXISTS trg_answers_insert_in_progress
BEFORE INSERT ON answers
WHEN NOT EXISTS (
    SELECT 1 FROM practice_sessions
    WHERE id = NEW.session_id AND status = 'in-progress'
)
BEGIN
    SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS');
END;

CREATE TRIGGER IF NOT EXISTS trg_answers_update_in_progress
BEFORE UPDATE ON answers
WHEN NOT EXISTS (
    SELECT 1 FROM practice_sessions
    WHERE id = NEW.session_id AND status = 'in-progress'
)
BEGIN
    SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS');
END;

CREATE TRIGGER IF NOT EXISTS trg_annotations_insert_in_progress
BEFORE INSERT ON annotations
WHEN NOT EXISTS (
    SELECT 1 FROM practice_sessions
    WHERE id = NEW.session_id AND status = 'in-progress'
)
BEGIN
    SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS');
END;

CREATE TRIGGER IF NOT EXISTS trg_annotations_update_in_progress
BEFORE UPDATE ON annotations
WHEN NOT EXISTS (
    SELECT 1 FROM practice_sessions
    WHERE id = NEW.session_id AND status = 'in-progress'
)
BEGIN
    SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS');
END;

CREATE TRIGGER IF NOT EXISTS trg_writing_drafts_insert_in_progress
BEFORE INSERT ON writing_drafts
WHEN NOT EXISTS (
    SELECT 1 FROM practice_sessions
    WHERE id = NEW.session_id AND status = 'in-progress'
)
BEGIN
    SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS');
END;

CREATE TRIGGER IF NOT EXISTS trg_writing_drafts_update_in_progress
BEFORE UPDATE ON writing_drafts
WHEN NOT EXISTS (
    SELECT 1 FROM practice_sessions
    WHERE id = NEW.session_id AND status = 'in-progress'
)
BEGIN
    SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS');
END;

CREATE TRIGGER IF NOT EXISTS trg_writing_versions_insert_in_progress
BEFORE INSERT ON writing_versions
WHEN NOT EXISTS (
    SELECT 1 FROM practice_sessions
    WHERE id = NEW.session_id AND status = 'in-progress'
)
BEGIN
    SELECT RAISE(ABORT, 'SESSION_NOT_IN_PROGRESS');
END;
