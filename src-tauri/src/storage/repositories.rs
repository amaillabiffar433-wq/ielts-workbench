use chrono::{Duration, SecondsFormat, Utc};
use rusqlite::{
    params, types::Type, Connection, OptionalExtension, Row, TransactionBehavior,
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    error::{BackendError, Result},
    models::{
        AnnotationRecord, AnswerRecord, CreateSessionInput, CreateWritingVersionInput,
        InstalledPackRecord, PackManifest, PracticeSessionRecord, SaveAnnotationInput,
        SaveAnswerInput, SaveWritingDraftInput, SessionSnapshot, SettingRecord, TextAnchor,
        SaveVocabularyItemInput, UpdateVocabularyItemInput, VocabularyItemRecord,
        ReviewItemRecord, SaveReviewItemInput,
        WritingDraftRecord, WritingVersionRecord,
    },
};

const MAX_JSON_BYTES: usize = 256 * 1024;
const MAX_WRITING_BYTES: usize = 2 * 1024 * 1024;
const MAX_NOTE_BYTES: usize = 16 * 1024;
const MAX_VOCABULARY_TERM_CHARS: usize = 160;
const MAX_VOCABULARY_SENTENCE_CHARS: usize = 4_000;
const MAX_VOCABULARY_CONTEXT_CHARS: usize = 1_000;

pub fn create_session(
    connection: &Connection,
    input: CreateSessionInput,
) -> Result<PracticeSessionRecord> {
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    validate_stable_id(&id, "session ID")?;
    if let Some(pack_id) = &input.pack_id {
        validate_stable_id(pack_id, "pack ID")?;
        let pack = get_installed_pack(connection, pack_id)?.ok_or_else(|| {
            BackendError::NotFound("The selected pack is not installed.".to_string())
        })?;
        let test_id = input.test_id.as_deref().ok_or_else(|| {
            BackendError::InvalidInput(
                "A pack-backed session requires a test ID.".to_string(),
            )
        })?;
        let module = input.module.as_deref().ok_or_else(|| {
            BackendError::InvalidInput(
                "A pack-backed session requires a module type.".to_string(),
            )
        })?;
        let test_exists = pack
            .manifest
            .get("tests")
            .and_then(Value::as_array)
            .is_some_and(|tests| {
                tests.iter().any(|test| {
                    test.get("id").and_then(Value::as_str) == Some(test_id)
                })
            });
        let module_exists = pack
            .manifest
            .get("modules")
            .and_then(Value::as_array)
            .is_some_and(|modules| {
                modules
                    .iter()
                    .any(|candidate| candidate.as_str() == Some(module))
            });
        if !test_exists || !module_exists {
            return Err(BackendError::NotFound(
                "The selected test or module is not part of this pack.".to_string(),
            ));
        }
    }
    if let Some(test_id) = &input.test_id {
        validate_stable_id(test_id, "test ID")?;
    }
    if let Some(module) = &input.module {
        if !matches!(module.as_str(), "reading" | "listening" | "writing") {
            return Err(BackendError::InvalidInput(
                "Session module is not supported.".to_string(),
            ));
        }
    }
    if !matches!(input.mode.as_str(), "study" | "exam" | "review") {
        return Err(BackendError::InvalidInput(
            "Session mode is not supported.".to_string(),
        ));
    }
    if get_session(connection, &id)?.is_some() {
        return Err(BackendError::Conflict(
            "A session with this ID already exists.".to_string(),
        ));
    }

    let now = now_iso();
    connection.execute(
        "INSERT INTO practice_sessions(
            id, pack_id, test_id, module, mode, status, started_at, updated_at,
            completed_at, elapsed_seconds
         ) VALUES (?1, ?2, ?3, ?4, ?5, 'in-progress', ?6, ?6, NULL, 0)",
        params![id, input.pack_id, input.test_id, input.module, input.mode, now],
    )?;
    get_session(connection, &id)?.ok_or_else(|| {
        BackendError::Database(rusqlite::Error::QueryReturnedNoRows)
    })
}

pub fn load_session(connection: &Connection, session_id: &str) -> Result<Option<SessionSnapshot>> {
    validate_stable_id(session_id, "session ID")?;
    let session = get_session(connection, session_id)?;
    if session.is_none() {
        return Ok(None);
    }
    Ok(Some(SessionSnapshot {
        session_id: session_id.to_string(),
        session,
        answers: list_answers(connection, session_id)?,
        annotations: list_annotations(connection, session_id)?,
    }))
}

pub fn list_recent_sessions(connection: &Connection) -> Result<Vec<PracticeSessionRecord>> {
    let mut statement = connection.prepare(
        "SELECT id, pack_id, test_id, module, mode, status, started_at, updated_at,
                completed_at, elapsed_seconds
         FROM practice_sessions
         ORDER BY updated_at DESC, id DESC",
    )?;
    let rows = statement.query_map([], session_from_row)?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}

pub fn submit_session(
    connection: &mut Connection,
    session_id: &str,
) -> Result<SessionSnapshot> {
    validate_stable_id(session_id, "session ID")?;
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let current_status = transaction
        .query_row(
            "SELECT status FROM practice_sessions WHERE id = ?1",
            [session_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    match current_status.as_deref() {
        None => {
            return Err(BackendError::NotFound(
                "The requested practice session does not exist.".to_string(),
            ));
        }
        Some("in-progress") => {}
        Some("submitted") => {
            let snapshot = load_session(&transaction, session_id)?.ok_or_else(|| {
                BackendError::Database(rusqlite::Error::QueryReturnedNoRows)
            })?;
            transaction.commit()?;
            return Ok(snapshot);
        }
        Some(_) => {
            return Err(BackendError::Conflict(
                "Only an in-progress practice session can be submitted.".to_string(),
            ));
        }
    }

    let completed_at = now_iso();
    let changed = transaction.execute(
        "UPDATE practice_sessions
         SET status = 'submitted', completed_at = ?2, updated_at = ?2
         WHERE id = ?1 AND status = 'in-progress'",
        params![session_id, completed_at],
    )?;
    if changed != 1 {
        return Err(BackendError::Conflict(
            "The practice session changed before it could be submitted.".to_string(),
        ));
    }

    let snapshot = load_session(&transaction, session_id)?.ok_or_else(|| {
        BackendError::Database(rusqlite::Error::QueryReturnedNoRows)
    })?;
    transaction.commit()?;
    Ok(snapshot)
}

pub fn update_session_elapsed(
    connection: &Connection,
    session_id: &str,
    elapsed_seconds: u64,
) -> Result<PracticeSessionRecord> {
    validate_stable_id(session_id, "session ID")?;
    if elapsed_seconds > 9_007_199_254_740_991 {
        return Err(BackendError::InvalidInput(
            "Elapsed time must be a JavaScript-safe integer.".to_string(),
        ));
    }
    require_in_progress_session(connection, session_id)?;
    let updated_at = now_iso();
    connection.execute(
        "UPDATE practice_sessions
         SET elapsed_seconds = MAX(elapsed_seconds, ?2), updated_at = ?3
         WHERE id = ?1 AND status = 'in-progress'",
        params![session_id, elapsed_seconds as i64, updated_at],
    )?;
    get_session(connection, session_id)?.ok_or_else(|| {
        BackendError::Database(rusqlite::Error::QueryReturnedNoRows)
    })
}

pub fn save_answer(connection: &Connection, input: SaveAnswerInput) -> Result<AnswerRecord> {
    validate_stable_id(&input.session_id, "session ID")?;
    validate_stable_id(&input.question_id, "question ID")?;
    validate_answer_value(&input.answer)?;
    let answer_json = serialize_limited(&input.answer, MAX_JSON_BYTES, "answer")?;
    require_in_progress_session(connection, &input.session_id)?;
    let updated_at = now_iso();
    connection.execute(
        "INSERT INTO answers(session_id, question_id, answer_json, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(session_id, question_id) DO UPDATE SET
            answer_json = excluded.answer_json,
            updated_at = excluded.updated_at",
        params![input.session_id, input.question_id, answer_json, updated_at],
    )?;
    touch_session(connection, &input.session_id, &updated_at)?;
    Ok(AnswerRecord {
        session_id: input.session_id,
        question_id: input.question_id,
        answer: input.answer,
        updated_at,
    })
}

pub fn save_annotation(
    connection: &Connection,
    input: SaveAnnotationInput,
) -> Result<AnnotationRecord> {
    validate_stable_id(&input.session_id, "session ID")?;
    validate_annotation(&input)?;
    require_in_progress_session(connection, &input.session_id)?;

    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    validate_stable_id(&id, "annotation ID")?;
    let existing = connection
        .query_row(
            "SELECT session_id, created_at FROM annotations WHERE id = ?1",
            [&id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;
    if let Some((existing_session, _)) = &existing {
        if existing_session != &input.session_id {
            return Err(BackendError::Conflict(
                "An annotation ID cannot be moved to another session.".to_string(),
            ));
        }
    }

    let now = now_iso();
    let created_at = existing.map(|(_, created_at)| created_at).unwrap_or_else(|| now.clone());
    connection.execute(
        "INSERT INTO annotations(
            id, session_id, kind, color, block_id, start_offset, end_offset,
            quote, prefix, suffix, note, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind,
            color = excluded.color,
            block_id = excluded.block_id,
            start_offset = excluded.start_offset,
            end_offset = excluded.end_offset,
            quote = excluded.quote,
            prefix = excluded.prefix,
            suffix = excluded.suffix,
            note = excluded.note,
            updated_at = excluded.updated_at",
        params![
            id,
            input.session_id,
            input.kind,
            input.color,
            input.anchor.block_id,
            i64::from(input.anchor.start_offset),
            i64::from(input.anchor.end_offset),
            input.anchor.quote,
            input.anchor.prefix,
            input.anchor.suffix,
            input.note,
            created_at,
            now,
        ],
    )?;
    touch_session(connection, &input.session_id, &now)?;

    Ok(AnnotationRecord {
        id,
        session_id: input.session_id,
        kind: input.kind,
        color: input.color,
        anchor: input.anchor,
        note: input.note,
        created_at,
        updated_at: now,
    })
}

pub fn delete_annotation(connection: &Connection, annotation_id: &str) -> Result<bool> {
    validate_stable_id(annotation_id, "annotation ID")?;
    let status = connection
        .query_row(
            "SELECT practice_sessions.status
             FROM annotations
             JOIN practice_sessions ON practice_sessions.id = annotations.session_id
             WHERE annotations.id = ?1",
            [annotation_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    match status.as_deref() {
        None => Ok(false),
        Some("in-progress") => {
            let changed = connection.execute(
                "DELETE FROM annotations
                 WHERE id = ?1
                   AND session_id IN (
                     SELECT id FROM practice_sessions WHERE status = 'in-progress'
                   )",
                [annotation_id],
            )?;
            if changed == 1 {
                Ok(true)
            } else {
                Err(BackendError::Conflict(
                    "The practice session changed before the annotation could be deleted."
                        .to_string(),
                ))
            }
        }
        Some(_) => Err(BackendError::Conflict(
            "Submitted or abandoned session annotations are immutable.".to_string(),
        )),
    }
}

pub fn get_setting(connection: &Connection, key: &str) -> Result<Option<SettingRecord>> {
    validate_setting_key(key)?;
    connection
        .query_row(
            "SELECT key, value_json, updated_at FROM app_settings WHERE key = ?1",
            [key],
            setting_from_row,
        )
        .optional()
        .map_err(Into::into)
}

pub fn set_setting(connection: &Connection, key: &str, value: Value) -> Result<SettingRecord> {
    validate_setting_key(key)?;
    let value_json = serialize_limited(&value, MAX_JSON_BYTES, "setting")?;
    let updated_at = now_iso();
    connection.execute(
        "INSERT INTO app_settings(key, value_json, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at",
        params![key, value_json, updated_at],
    )?;
    Ok(SettingRecord {
        key: key.to_string(),
        value,
        updated_at,
    })
}

pub fn load_writing_draft(
    connection: &Connection,
    session_id: &str,
    task_id: &str,
) -> Result<Option<WritingDraftRecord>> {
    validate_stable_id(session_id, "session ID")?;
    validate_stable_id(task_id, "task ID")?;
    connection
        .query_row(
            "SELECT session_id, task_id, content, word_count, updated_at
             FROM writing_drafts WHERE session_id = ?1 AND task_id = ?2",
            params![session_id, task_id],
            writing_draft_from_row,
        )
        .optional()
        .map_err(Into::into)
}

pub fn save_writing_draft(
    connection: &Connection,
    input: SaveWritingDraftInput,
) -> Result<WritingDraftRecord> {
    validate_stable_id(&input.session_id, "session ID")?;
    validate_stable_id(&input.task_id, "task ID")?;
    validate_writing(&input.content)?;
    require_in_progress_session(connection, &input.session_id)?;
    let word_count = count_words(&input.content);
    let updated_at = now_iso();
    connection.execute(
        "INSERT INTO writing_drafts(session_id, task_id, content, word_count, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(session_id, task_id) DO UPDATE SET
            content = excluded.content,
            word_count = excluded.word_count,
            updated_at = excluded.updated_at",
        params![
            input.session_id,
            input.task_id,
            input.content,
            i64::from(word_count),
            updated_at
        ],
    )?;
    touch_session(connection, &input.session_id, &updated_at)?;
    Ok(WritingDraftRecord {
        session_id: input.session_id,
        task_id: input.task_id,
        content: input.content,
        word_count,
        updated_at,
    })
}

pub fn create_writing_version(
    connection: &Connection,
    input: CreateWritingVersionInput,
) -> Result<WritingVersionRecord> {
    validate_stable_id(&input.session_id, "session ID")?;
    validate_stable_id(&input.task_id, "task ID")?;
    validate_writing(&input.content)?;
    if !matches!(input.kind.as_str(), "manual" | "submitted") {
        return Err(BackendError::InvalidInput(
            "Writing version kind must be 'manual' or 'submitted'.".to_string(),
        ));
    }
    require_in_progress_session(connection, &input.session_id)?;
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    validate_stable_id(&id, "writing version ID")?;
    let word_count = count_words(&input.content);
    let created_at = now_iso();
    let changed = connection.execute(
        "INSERT INTO writing_versions(
            id, session_id, task_id, kind, content, word_count, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            id,
            input.session_id,
            input.task_id,
            input.kind,
            input.content,
            i64::from(word_count),
            created_at
        ],
    );
    if let Err(rusqlite::Error::SqliteFailure(error, _)) = &changed {
        if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_PRIMARYKEY
            || error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
        {
            return Err(BackendError::Conflict(
                "A writing version with this ID already exists.".to_string(),
            ));
        }
    }
    changed?;
    touch_session(connection, &input.session_id, &created_at)?;
    Ok(WritingVersionRecord {
        id,
        session_id: input.session_id,
        task_id: input.task_id,
        kind: input.kind,
        content: input.content,
        word_count,
        created_at,
    })
}

pub fn list_writing_versions(
    connection: &Connection,
    session_id: &str,
    task_id: &str,
) -> Result<Vec<WritingVersionRecord>> {
    validate_stable_id(session_id, "session ID")?;
    validate_stable_id(task_id, "task ID")?;
    let mut statement = connection.prepare(
        "SELECT id, session_id, task_id, kind, content, word_count, created_at
         FROM writing_versions
         WHERE session_id = ?1 AND task_id = ?2
         ORDER BY created_at ASC, id ASC",
    )?;
    let rows = statement.query_map(params![session_id, task_id], writing_version_from_row)?;
    rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn list_vocabulary_items(connection: &Connection) -> Result<Vec<VocabularyItemRecord>> {
    let mut statement = connection.prepare(
        "SELECT id, term, normalized_term, sentence, context_before, context_after,
                source_pack_id, source_test_id, source_module, source_block_id,
                source_book_title, source_test_title, source_section_id, source_section_title,
                source_question_id, source_question_number, note, learning_state, created_at, updated_at
         FROM vocabulary_items
         ORDER BY created_at DESC, id DESC",
    )?;
    let rows = statement.query_map([], vocabulary_item_from_row)?;
    rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn save_vocabulary_item(
    connection: &Connection,
    input: SaveVocabularyItemInput,
) -> Result<VocabularyItemRecord> {
    validate_vocabulary_input(&input)?;
    let existing_id: Option<String> = connection.query_row(
        "SELECT id FROM vocabulary_items
         WHERE normalized_term = ?1
           AND COALESCE(source_pack_id, '') = COALESCE(?2, '')
           AND COALESCE(source_test_id, '') = COALESCE(?3, '')
           AND COALESCE(source_block_id, '') = COALESCE(?4, '')
           AND sentence = ?5
         ORDER BY created_at ASC LIMIT 1",
        params![
            input.normalized_term,
            input.source_pack_id,
            input.source_test_id,
            input.source_block_id,
            input.sentence,
        ],
        |row| row.get(0),
    ).optional()?;
    if let Some(requested_id) = input.id.as_deref() {
        if get_vocabulary_item(connection, requested_id)?.is_some()
            && existing_id.as_deref() != Some(requested_id)
        {
            return Err(BackendError::Conflict(
                "A vocabulary item ID cannot overwrite a different source selection; use the update command.".to_string(),
            ));
        }
    }
    let id = existing_id.or(input.id).unwrap_or_else(|| Uuid::new_v4().to_string());
    validate_stable_id(&id, "vocabulary item ID")?;
    let timestamp = now_iso();
    connection.execute(
        "INSERT INTO vocabulary_items(
            id, term, normalized_term, source_pack_id, source_test_id, source_module,
            source_block_id, context, learning_state, created_at, updated_at,
            source_book_title, source_test_title, source_section_id, source_section_title,
            source_question_id, source_question_number, sentence, context_before, context_after, note
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10,
            ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
         )
         ON CONFLICT(id) DO UPDATE SET
            term = excluded.term,
            normalized_term = excluded.normalized_term,
            source_pack_id = excluded.source_pack_id,
            source_test_id = excluded.source_test_id,
            source_module = excluded.source_module,
            source_block_id = excluded.source_block_id,
            context = excluded.context,
            source_book_title = excluded.source_book_title,
            source_test_title = excluded.source_test_title,
            source_section_id = excluded.source_section_id,
            source_section_title = excluded.source_section_title,
            source_question_id = excluded.source_question_id,
            source_question_number = excluded.source_question_number,
            sentence = excluded.sentence,
            context_before = excluded.context_before,
            context_after = excluded.context_after,
            note = CASE WHEN vocabulary_items.note = '' THEN excluded.note ELSE vocabulary_items.note END,
            updated_at = excluded.updated_at",
        params![
            id,
            input.term,
            input.normalized_term,
            input.source_pack_id,
            input.source_test_id,
            input.source_module,
            input.source_block_id,
            format!("{}{}{}", input.context_before, input.term, input.context_after),
            input.learning_state,
            timestamp,
            input.source_book_title,
            input.source_test_title,
            input.source_section_id,
            input.source_section_title,
            input.source_question_id,
            input.source_question_number.map(i64::from),
            input.sentence,
            input.context_before,
            input.context_after,
            input.note,
        ],
    )?;
    get_vocabulary_item(connection, &id)?.ok_or_else(|| {
        BackendError::NotFound("The saved vocabulary item could not be read back.".to_string())
    })
}

pub fn update_vocabulary_item(
    connection: &Connection,
    input: UpdateVocabularyItemInput,
) -> Result<VocabularyItemRecord> {
    validate_stable_id(&input.id, "vocabulary item ID")?;
    validate_vocabulary_state(&input.learning_state)?;
    if input.note.chars().count() > 2_000 {
        return Err(BackendError::InvalidInput("Vocabulary note is too long.".to_string()));
    }
    let changed = connection.execute(
        "UPDATE vocabulary_items SET note = ?2, learning_state = ?3, updated_at = ?4 WHERE id = ?1",
        params![input.id, input.note, input.learning_state, now_iso()],
    )?;
    if changed == 0 {
        return Err(BackendError::NotFound("The vocabulary item does not exist.".to_string()));
    }
    get_vocabulary_item(connection, &input.id)?.ok_or_else(|| {
        BackendError::NotFound("The vocabulary item does not exist.".to_string())
    })
}

pub fn delete_vocabulary_item(connection: &Connection, item_id: &str) -> Result<bool> {
    validate_stable_id(item_id, "vocabulary item ID")?;
    Ok(connection.execute("DELETE FROM vocabulary_items WHERE id = ?1", [item_id])? > 0)
}

pub fn list_review_items(connection: &Connection) -> Result<Vec<ReviewItemRecord>> {
    let mut statement = connection.prepare(
        "SELECT id, source_kind, pack_id, test_id, module, question_id, vocabulary_id,
                source_session_id, source_start_ms, interval_days, repetitions, due_at, last_reviewed_at,
                created_at, updated_at
         FROM review_items
         ORDER BY due_at ASC, created_at ASC, id ASC",
    )?;
    let rows = statement.query_map([], review_item_from_row)?;
    rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn save_review_item(
    connection: &Connection,
    input: SaveReviewItemInput,
) -> Result<ReviewItemRecord> {
    validate_review_input(&input)?;
    let existing_id: Option<String> = if input.source_kind == "vocabulary" {
        connection.query_row(
            "SELECT id FROM review_items WHERE vocabulary_id = ?1 LIMIT 1",
            params![input.vocabulary_id.as_deref()],
            |row| row.get(0),
        ).optional()?
    } else {
        connection.query_row(
            "SELECT id FROM review_items
             WHERE source_kind = ?1 AND pack_id = ?2 AND test_id = ?3
               AND module = ?4 AND question_id = ?5 LIMIT 1",
            params![
                &input.source_kind,
                input.pack_id.as_deref(),
                input.test_id.as_deref(),
                input.module_type.as_deref(),
                input.question_id.as_deref(),
            ],
            |row| row.get(0),
        ).optional()?
    };
    let id = existing_id.or(input.id.clone()).unwrap_or_else(|| Uuid::new_v4().to_string());
    validate_stable_id(&id, "review item ID")?;
    let timestamp = now_iso();
    connection.execute(
        "INSERT INTO review_items(
            id, source_kind, pack_id, test_id, module, question_id, vocabulary_id,
            source_session_id, source_start_ms, interval_days, repetitions, due_at, last_reviewed_at,
            created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 0, ?10, NULL, ?10, ?10)
         ON CONFLICT(id) DO UPDATE SET
            source_session_id = excluded.source_session_id,
            source_start_ms = COALESCE(excluded.source_start_ms, review_items.source_start_ms),
            due_at = MIN(review_items.due_at, excluded.due_at),
            updated_at = excluded.updated_at",
        params![
            id,
            input.source_kind,
            input.pack_id,
            input.test_id,
            input.module_type,
            input.question_id,
            input.vocabulary_id,
            input.source_session_id,
            input.source_start_ms,
            timestamp,
        ],
    )?;
    get_review_item(connection, &id)?.ok_or_else(|| {
        BackendError::NotFound("The saved review item could not be read back.".to_string())
    })
}

pub fn grade_review_item(
    connection: &mut Connection,
    item_id: &str,
    rating: &str,
) -> Result<ReviewItemRecord> {
    validate_stable_id(item_id, "review item ID")?;
    if !matches!(rating, "again" | "hard" | "good" | "easy") {
        return Err(BackendError::InvalidInput("Unsupported review rating.".to_string()));
    }
    let current = get_review_item(connection, item_id)?.ok_or_else(|| {
        BackendError::NotFound("The review item does not exist.".to_string())
    })?;
    let interval_days = match rating {
        "again" | "hard" => 1,
        "good" => match current.repetitions { 0 => 1, 1 => 3, 2 => 7, _ => 14 },
        "easy" => match current.repetitions { 0 => 3, 1 => 7, _ => 14 },
        _ => unreachable!(),
    };
    let repetitions = if rating == "again" { 0 } else { current.repetitions.saturating_add(1) };
    let reviewed_at = Utc::now();
    let due_at = reviewed_at + Duration::days(i64::from(interval_days));
    let reviewed_at_iso = reviewed_at.to_rfc3339_opts(SecondsFormat::Millis, true);
    let due_at_iso = due_at.to_rfc3339_opts(SecondsFormat::Millis, true);
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    transaction.execute(
        "UPDATE review_items
         SET interval_days = ?2, repetitions = ?3, due_at = ?4,
             last_reviewed_at = ?5, updated_at = ?5
         WHERE id = ?1",
        params![item_id, i64::from(interval_days), i64::from(repetitions), due_at_iso, reviewed_at_iso],
    )?;
    transaction.execute(
        "INSERT INTO review_events(
            id, review_item_id, rating, previous_interval_days,
            next_interval_days, reviewed_at, next_due_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            Uuid::new_v4().to_string(),
            item_id,
            rating,
            i64::from(current.interval_days),
            i64::from(interval_days),
            reviewed_at_iso,
            due_at_iso,
        ],
    )?;
    transaction.commit()?;
    get_review_item(connection, item_id)?.ok_or_else(|| {
        BackendError::NotFound("The graded review item could not be read back.".to_string())
    })
}

fn get_review_item(connection: &Connection, item_id: &str) -> Result<Option<ReviewItemRecord>> {
    connection.query_row(
        "SELECT id, source_kind, pack_id, test_id, module, question_id, vocabulary_id,
                source_session_id, source_start_ms, interval_days, repetitions, due_at, last_reviewed_at,
                created_at, updated_at
         FROM review_items WHERE id = ?1",
        [item_id],
        review_item_from_row,
    ).optional().map_err(Into::into)
}

fn validate_review_input(input: &SaveReviewItemInput) -> Result<()> {
    if !matches!(input.source_kind.as_str(), "mistake" | "marked" | "vocabulary" | "manual") {
        return Err(BackendError::InvalidInput("Unsupported review source kind.".to_string()));
    }
    if let Some(id) = &input.id { validate_stable_id(id, "review item ID")?; }
    if let Some(id) = &input.source_session_id { validate_stable_id(id, "source session ID")?; }
    if input.source_start_ms.is_some_and(|value| value > 9_007_199_254_740_991) {
        return Err(BackendError::InvalidInput("Review audio timestamp must be a JavaScript-safe integer.".to_string()));
    }
    if input.source_kind == "vocabulary" {
        let vocabulary_id = input.vocabulary_id.as_deref().ok_or_else(|| {
            BackendError::InvalidInput("Vocabulary review requires a vocabulary ID.".to_string())
        })?;
        validate_stable_id(vocabulary_id, "vocabulary item ID")?;
        return Ok(());
    }
    for (value, label) in [
        (input.pack_id.as_deref(), "pack ID"),
        (input.test_id.as_deref(), "test ID"),
        (input.question_id.as_deref(), "question ID"),
    ] {
        validate_stable_id(value.ok_or_else(|| BackendError::InvalidInput(format!("Question review requires {label}.")))?, label)?;
    }
    let module = input.module_type.as_deref().ok_or_else(|| {
        BackendError::InvalidInput("Question review requires a module type.".to_string())
    })?;
    if !matches!(module, "reading" | "listening" | "writing") {
        return Err(BackendError::InvalidInput("Unsupported review module type.".to_string()));
    }
    Ok(())
}

fn get_vocabulary_item(connection: &Connection, item_id: &str) -> Result<Option<VocabularyItemRecord>> {
    connection.query_row(
        "SELECT id, term, normalized_term, sentence, context_before, context_after,
                source_pack_id, source_test_id, source_module, source_block_id,
                source_book_title, source_test_title, source_section_id, source_section_title,
                source_question_id, source_question_number, note, learning_state, created_at, updated_at
         FROM vocabulary_items WHERE id = ?1",
        [item_id],
        vocabulary_item_from_row,
    ).optional().map_err(Into::into)
}

fn validate_vocabulary_input(input: &SaveVocabularyItemInput) -> Result<()> {
    let term = input.term.trim();
    if term.is_empty() || term.chars().count() > MAX_VOCABULARY_TERM_CHARS {
        return Err(BackendError::InvalidInput("Vocabulary term is empty or too long.".to_string()));
    }
    if input.normalized_term.trim().is_empty() || input.normalized_term.chars().count() > MAX_VOCABULARY_TERM_CHARS {
        return Err(BackendError::InvalidInput("Normalized vocabulary term is empty or too long.".to_string()));
    }
    if input.sentence.chars().count() > MAX_VOCABULARY_SENTENCE_CHARS
        || input.context_before.chars().count() > MAX_VOCABULARY_CONTEXT_CHARS
        || input.context_after.chars().count() > MAX_VOCABULARY_CONTEXT_CHARS
        || input.note.chars().count() > 2_000
    {
        return Err(BackendError::InvalidInput("Vocabulary context is too long.".to_string()));
    }
    validate_vocabulary_state(&input.learning_state)?;
    let source_identity_count = [
        input.source_pack_id.is_some(),
        input.source_test_id.is_some(),
        input.source_module.is_some(),
        input.source_block_id.is_some(),
    ].into_iter().filter(|present| *present).count();
    if source_identity_count != 0 && source_identity_count != 4 {
        return Err(BackendError::InvalidInput(
            "Vocabulary source identity must include pack, test, module, and block together.".to_string(),
        ));
    }
    for (value, label) in [
        (&input.source_pack_id, "source pack ID"),
        (&input.source_test_id, "source test ID"),
        (&input.source_block_id, "source block ID"),
        (&input.source_section_id, "source section ID"),
        (&input.source_question_id, "source question ID"),
    ] {
        if let Some(value) = value { validate_stable_id(value, label)?; }
    }
    if input.source_module.as_deref().is_some_and(|value| value != "reading") {
        return Err(BackendError::InvalidInput("Vocabulary source module must be Reading.".to_string()));
    }
    Ok(())
}

fn validate_vocabulary_state(value: &str) -> Result<()> {
    if matches!(value, "new" | "learning" | "familiar" | "mastered") {
        Ok(())
    } else {
        Err(BackendError::InvalidInput("Unsupported vocabulary learning state.".to_string()))
    }
}

pub fn list_installed_packs(connection: &Connection) -> Result<Vec<InstalledPackRecord>> {
    let mut statement = connection.prepare(
        "SELECT id, title, source_label, edition, schema_version, install_path,
                manifest_json, source_hash, installed_at
         FROM installed_packs ORDER BY title COLLATE NOCASE, id",
    )?;
    let rows = statement.query_map([], installed_pack_from_row)?;
    rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get_installed_pack(
    connection: &Connection,
    pack_id: &str,
) -> Result<Option<InstalledPackRecord>> {
    validate_stable_id(pack_id, "pack ID")?;
    connection
        .query_row(
            "SELECT id, title, source_label, edition, schema_version, install_path,
                    manifest_json, source_hash, installed_at
             FROM installed_packs WHERE id = ?1",
            [pack_id],
            installed_pack_from_row,
        )
        .optional()
        .map_err(Into::into)
}

pub fn register_installed_pack(
    connection: &Connection,
    manifest: &PackManifest,
    manifest_json: &Value,
    install_path: &str,
    source_hash: &str,
) -> Result<InstalledPackRecord> {
    if get_installed_pack(connection, &manifest.id)?.is_some() {
        return Err(BackendError::Conflict(
            "A pack with this ID is already installed.".to_string(),
        ));
    }
    let raw_manifest = serialize_limited(manifest_json, MAX_JSON_BYTES, "pack manifest")?;
    let installed_at = now_iso();
    connection.execute(
        "INSERT INTO installed_packs(
            id, title, source_label, edition, schema_version, install_path,
            manifest_json, source_hash, installed_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            manifest.id,
            manifest.title,
            manifest.source_label,
            manifest.edition,
            i64::from(manifest.schema_version),
            install_path,
            raw_manifest,
            source_hash,
            installed_at,
        ],
    )?;
    get_installed_pack(connection, &manifest.id)?.ok_or_else(|| {
        BackendError::Database(rusqlite::Error::QueryReturnedNoRows)
    })
}

fn get_session(connection: &Connection, session_id: &str) -> Result<Option<PracticeSessionRecord>> {
    connection
        .query_row(
            "SELECT id, pack_id, test_id, module, mode, status, started_at, updated_at,
                    completed_at, elapsed_seconds
             FROM practice_sessions WHERE id = ?1",
            [session_id],
            session_from_row,
        )
        .optional()
        .map_err(Into::into)
}

fn list_answers(connection: &Connection, session_id: &str) -> Result<Vec<AnswerRecord>> {
    let mut statement = connection.prepare(
        "SELECT session_id, question_id, answer_json, updated_at
         FROM answers WHERE session_id = ?1 ORDER BY question_id",
    )?;
    let rows = statement.query_map([session_id], answer_from_row)?;
    rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
}

fn list_annotations(connection: &Connection, session_id: &str) -> Result<Vec<AnnotationRecord>> {
    let mut statement = connection.prepare(
        "SELECT id, session_id, kind, color, block_id, start_offset, end_offset,
                quote, prefix, suffix, note, created_at, updated_at
         FROM annotations WHERE session_id = ?1
         ORDER BY block_id, start_offset, created_at, id",
    )?;
    let rows = statement.query_map([session_id], annotation_from_row)?;
    rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
}

fn require_in_progress_session(connection: &Connection, session_id: &str) -> Result<()> {
    validate_stable_id(session_id, "session ID")?;
    let status = connection
        .query_row(
            "SELECT status FROM practice_sessions WHERE id = ?1",
            [session_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    match status.as_deref() {
        None => Err(BackendError::NotFound(
            "The requested practice session does not exist.".to_string(),
        )),
        Some("in-progress") => Ok(()),
        Some(_) => Err(BackendError::Conflict(
            "Submitted or abandoned practice sessions are immutable.".to_string(),
        )),
    }
}

fn touch_session(connection: &Connection, session_id: &str, updated_at: &str) -> Result<()> {
    connection.execute(
        "UPDATE practice_sessions SET updated_at = ?2 WHERE id = ?1",
        params![session_id, updated_at],
    )?;
    Ok(())
}

fn validate_annotation(input: &SaveAnnotationInput) -> Result<()> {
    if !matches!(input.kind.as_str(), "highlight" | "underline") {
        return Err(BackendError::InvalidInput(
            "Annotation kind must be 'highlight' or 'underline'.".to_string(),
        ));
    }
    if let Some(color) = &input.color {
        if !matches!(color.as_str(), "yellow" | "green" | "blue" | "pink") {
            return Err(BackendError::InvalidInput(
                "Annotation color is not supported.".to_string(),
            ));
        }
    }
    if input.kind == "highlight" && input.color.is_none() {
        return Err(BackendError::InvalidInput(
            "A highlight requires a color.".to_string(),
        ));
    }
    validate_stable_id(&input.anchor.block_id, "content block ID")?;
    if input.anchor.end_offset <= input.anchor.start_offset || input.anchor.quote.is_empty() {
        return Err(BackendError::InvalidInput(
            "Text annotation offsets and quote are invalid.".to_string(),
        ));
    }
    if input.anchor.quote.len() > 64 * 1024
        || input.anchor.prefix.len() > 8 * 1024
        || input.anchor.suffix.len() > 8 * 1024
    {
        return Err(BackendError::InvalidInput(
            "Text annotation anchor is too large.".to_string(),
        ));
    }
    if input.note.as_ref().is_some_and(|note| note.len() > MAX_NOTE_BYTES) {
        return Err(BackendError::InvalidInput(
            "Annotation note is too large.".to_string(),
        ));
    }
    Ok(())
}

fn validate_answer_value(answer: &Value) -> Result<()> {
    let valid = match answer {
        Value::String(_) => true,
        Value::Array(values) => values.iter().all(Value::is_string),
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(BackendError::InvalidInput(
            "An answer must be a string or an array of strings.".to_string(),
        ))
    }
}

fn validate_stable_id(value: &str, label: &str) -> Result<()> {
    let mut characters = value.chars();
    let valid = value.len() <= 128
        && characters
            .next()
            .is_some_and(|character| character.is_ascii_alphanumeric())
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | ':' | '-')
        });
    if !valid {
        return Err(BackendError::InvalidInput(format!("{label} is invalid.")));
    }
    Ok(())
}

fn validate_setting_key(key: &str) -> Result<()> {
    let valid = !key.is_empty()
        && key.len() <= 128
        && key
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character));
    if !valid {
        return Err(BackendError::InvalidInput(
            "Setting key is invalid.".to_string(),
        ));
    }
    let normalized: String = key
        .to_ascii_lowercase()
        .chars()
        .filter(|character| !matches!(character, '.' | '_' | '-'))
        .collect();
    if normalized.contains("apikey")
        || normalized.contains("password")
        || normalized.contains("clientsecret")
        || normalized.contains("authtoken")
        || normalized.contains("accesstoken")
    {
        return Err(BackendError::Security(
            "Secrets cannot be stored in ordinary workspace settings.".to_string(),
        ));
    }
    Ok(())
}

fn validate_writing(content: &str) -> Result<()> {
    if content.len() > MAX_WRITING_BYTES {
        return Err(BackendError::InvalidInput(
            "Writing content is too large.".to_string(),
        ));
    }
    Ok(())
}

fn serialize_limited(value: &Value, maximum: usize, label: &str) -> Result<String> {
    let serialized = serde_json::to_string(value)?;
    if serialized.len() > maximum {
        return Err(BackendError::InvalidInput(format!("{label} is too large.")));
    }
    Ok(serialized)
}

fn count_words(content: &str) -> u32 {
    content
        .split_whitespace()
        .filter(|token| token.chars().any(char::is_alphanumeric))
        .count()
        .try_into()
        .unwrap_or(u32::MAX)
}

fn session_from_row(row: &Row<'_>) -> rusqlite::Result<PracticeSessionRecord> {
    Ok(PracticeSessionRecord {
        id: row.get(0)?,
        pack_id: row.get(1)?,
        test_id: row.get(2)?,
        module: row.get(3)?,
        mode: row.get(4)?,
        status: row.get(5)?,
        started_at: row.get(6)?,
        updated_at: row.get(7)?,
        completed_at: row.get(8)?,
        elapsed_seconds: row.get::<_, i64>(9)?.max(0) as u64,
    })
}

fn answer_from_row(row: &Row<'_>) -> rusqlite::Result<AnswerRecord> {
    let raw: String = row.get(2)?;
    Ok(AnswerRecord {
        session_id: row.get(0)?,
        question_id: row.get(1)?,
        answer: parse_json_column(&raw, 2)?,
        updated_at: row.get(3)?,
    })
}

fn annotation_from_row(row: &Row<'_>) -> rusqlite::Result<AnnotationRecord> {
    Ok(AnnotationRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        kind: row.get(2)?,
        color: row.get(3)?,
        anchor: TextAnchor {
            block_id: row.get(4)?,
            start_offset: row.get::<_, i64>(5)?.max(0) as u32,
            end_offset: row.get::<_, i64>(6)?.max(0) as u32,
            quote: row.get(7)?,
            prefix: row.get(8)?,
            suffix: row.get(9)?,
        },
        note: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn setting_from_row(row: &Row<'_>) -> rusqlite::Result<SettingRecord> {
    let raw: String = row.get(1)?;
    Ok(SettingRecord {
        key: row.get(0)?,
        value: parse_json_column(&raw, 1)?,
        updated_at: row.get(2)?,
    })
}

fn writing_draft_from_row(row: &Row<'_>) -> rusqlite::Result<WritingDraftRecord> {
    Ok(WritingDraftRecord {
        session_id: row.get(0)?,
        task_id: row.get(1)?,
        content: row.get(2)?,
        word_count: row.get::<_, i64>(3)?.max(0) as u32,
        updated_at: row.get(4)?,
    })
}

fn writing_version_from_row(row: &Row<'_>) -> rusqlite::Result<WritingVersionRecord> {
    Ok(WritingVersionRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        task_id: row.get(2)?,
        kind: row.get(3)?,
        content: row.get(4)?,
        word_count: row.get::<_, i64>(5)?.max(0) as u32,
        created_at: row.get(6)?,
    })
}

fn vocabulary_item_from_row(row: &Row<'_>) -> rusqlite::Result<VocabularyItemRecord> {
    Ok(VocabularyItemRecord {
        id: row.get(0)?,
        term: row.get(1)?,
        normalized_term: row.get(2)?,
        sentence: row.get(3)?,
        context_before: row.get(4)?,
        context_after: row.get(5)?,
        source_pack_id: row.get(6)?,
        source_test_id: row.get(7)?,
        source_module: row.get(8)?,
        source_block_id: row.get(9)?,
        source_book_title: row.get(10)?,
        source_test_title: row.get(11)?,
        source_section_id: row.get(12)?,
        source_section_title: row.get(13)?,
        source_question_id: row.get(14)?,
        source_question_number: row.get::<_, Option<i64>>(15)?.map(|value| value.max(0) as u32),
        note: row.get(16)?,
        learning_state: row.get(17)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
    })
}

fn review_item_from_row(row: &Row<'_>) -> rusqlite::Result<ReviewItemRecord> {
    Ok(ReviewItemRecord {
        id: row.get(0)?,
        source_kind: row.get(1)?,
        pack_id: row.get(2)?,
        test_id: row.get(3)?,
        module_type: row.get(4)?,
        question_id: row.get(5)?,
        vocabulary_id: row.get(6)?,
        source_session_id: row.get(7)?,
        source_start_ms: row.get::<_, Option<i64>>(8)?.map(|value| value.max(0) as u64),
        interval_days: row.get::<_, i64>(9)?.max(0) as u32,
        repetitions: row.get::<_, i64>(10)?.max(0) as u32,
        due_at: row.get(11)?,
        last_reviewed_at: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn installed_pack_from_row(row: &Row<'_>) -> rusqlite::Result<InstalledPackRecord> {
    let raw_manifest: String = row.get(6)?;
    Ok(InstalledPackRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        source_label: row.get(2)?,
        edition: row.get(3)?,
        schema_version: row.get::<_, i64>(4)?.max(0) as u32,
        install_path: row.get(5)?,
        manifest: parse_json_column(&raw_manifest, 6)?,
        source_hash: row.get(7)?,
        installed_at: row.get(8)?,
    })
}

fn parse_json_column(raw: &str, index: usize) -> rusqlite::Result<Value> {
    serde_json::from_str(raw)
        .map_err(|error| rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(error)))
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrations;
    use serde_json::json;

    fn database() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations::run(&mut connection).unwrap();
        connection
    }

    fn create_detached_session(connection: &Connection, id: &str, module: &str) {
        create_session(
            connection,
            CreateSessionInput {
                id: Some(id.to_string()),
                pack_id: None,
                test_id: Some("test-fixture".to_string()),
                module: Some(module.to_string()),
                mode: "study".to_string(),
            },
        )
        .unwrap();
    }

    #[test]
    fn answer_annotation_and_session_round_trip() {
        let connection = database();
        create_detached_session(&connection, "session-1", "reading");
        save_answer(
            &connection,
            SaveAnswerInput {
                session_id: "session-1".into(),
                question_id: "question-1".into(),
                answer: json!("B"),
            },
        )
        .unwrap();
        let annotation = save_annotation(
            &connection,
            SaveAnnotationInput {
                id: Some("annotation-1".into()),
                session_id: "session-1".into(),
                kind: "highlight".into(),
                color: Some("yellow".into()),
                anchor: TextAnchor {
                    block_id: "block-1".into(),
                    start_offset: 2,
                    end_offset: 6,
                    quote: "demo".into(),
                    prefix: "a ".into(),
                    suffix: " text".into(),
                },
                note: Some("evidence".into()),
            },
        )
        .unwrap();

        let snapshot = load_session(&connection, "session-1").unwrap().unwrap();
        assert!(snapshot.session.is_some());
        assert_eq!(snapshot.answers.len(), 1);
        assert_eq!(snapshot.answers[0].answer, json!("B"));
        assert_eq!(snapshot.annotations.len(), 1);
        assert_eq!(snapshot.annotations[0].anchor.block_id, "block-1");
        assert!(delete_annotation(&connection, &annotation.id).unwrap());
        assert!(load_session(&connection, "session-1")
            .unwrap()
            .unwrap()
            .annotations
            .is_empty());
    }

    #[test]
    fn setting_draft_and_immutable_version_round_trip() {
        let connection = database();
        let setting = set_setting(&connection, "appearance.theme", json!("dark")).unwrap();
        assert_eq!(setting.value, json!("dark"));
        assert_eq!(
            get_setting(&connection, "appearance.theme")
                .unwrap()
                .unwrap()
                .value,
            json!("dark")
        );
        assert!(set_setting(&connection, "ai.apiKey", json!("not-stored")).is_err());

        create_detached_session(&connection, "writing-session", "writing");

        let draft = save_writing_draft(
            &connection,
            SaveWritingDraftInput {
                session_id: "writing-session".into(),
                task_id: "task-2".into(),
                content: "A concise original response.".into(),
            },
        )
        .unwrap();
        assert_eq!(draft.word_count, 4);
        assert_eq!(
            load_writing_draft(&connection, "writing-session", "task-2")
                .unwrap()
                .unwrap()
                .content,
            draft.content
        );

        let version = create_writing_version(
            &connection,
            CreateWritingVersionInput {
                id: Some("version-1".into()),
                session_id: "writing-session".into(),
                task_id: "task-2".into(),
                kind: "manual".into(),
                content: draft.content,
            },
        )
        .unwrap();
        assert_eq!(version.word_count, 4);
        assert_eq!(
            list_writing_versions(&connection, "writing-session", "task-2")
                .unwrap()
                .len(),
            1
        );
        assert!(create_writing_version(
            &connection,
            CreateWritingVersionInput {
                id: Some("version-1".into()),
                session_id: "writing-session".into(),
                task_id: "task-2".into(),
                kind: "manual".into(),
                content: "A different response must not overwrite history.".into(),
            },
        )
        .is_err());
    }

    #[test]
    fn vocabulary_context_round_trip_updates_without_duplicate_rows() {
        let connection = database();
        let input = SaveVocabularyItemInput {
            id: Some("vocabulary-1".into()),
            term: "Scrolls".into(),
            normalized_term: "scrolls".into(),
            sentence: "The scrolls remained in Jerusalem.".into(),
            context_before: "The ".into(),
            context_after: " remained".into(),
            source_pack_id: Some("pack-1".into()),
            source_test_id: Some("test-2".into()),
            source_module: Some("reading".into()),
            source_block_id: Some("block-1".into()),
            source_book_title: Some("Cambridge IELTS 17 Academic".into()),
            source_test_title: Some("Test 2".into()),
            source_section_id: Some("passage-1".into()),
            source_section_title: Some("The Dead Sea Scrolls".into()),
            source_question_id: Some("question-3".into()),
            source_question_number: Some(3),
            note: String::new(),
            learning_state: "new".into(),
        };
        let created = save_vocabulary_item(&connection, input.clone()).unwrap();
        let duplicate = save_vocabulary_item(&connection, SaveVocabularyItemInput { id: None, ..input }).unwrap();
        assert_eq!(created.id, duplicate.id);
        assert_eq!(list_vocabulary_items(&connection).unwrap().len(), 1);
        let updated = update_vocabulary_item(&connection, UpdateVocabularyItemInput {
            id: created.id.clone(), note: "Review the original sentence.".into(), learning_state: "learning".into(),
        }).unwrap();
        assert_eq!(updated.learning_state, "learning");
        assert_eq!(updated.source_question_number, Some(3));
        assert!(delete_vocabulary_item(&connection, &created.id).unwrap());
        assert!(list_vocabulary_items(&connection).unwrap().is_empty());
    }

    #[test]
    fn review_schedule_round_trip_is_deduplicated_and_audited() {
        let mut connection = database();
        let vocabulary = save_vocabulary_item(&connection, SaveVocabularyItemInput {
            id: Some("review-vocabulary".into()),
            term: "interval".into(),
            normalized_term: "interval".into(),
            sentence: "The interval is explicit.".into(),
            context_before: "The ".into(),
            context_after: " is explicit.".into(),
            source_pack_id: None,
            source_test_id: None,
            source_module: None,
            source_block_id: None,
            source_book_title: None,
            source_test_title: None,
            source_section_id: None,
            source_section_title: None,
            source_question_id: None,
            source_question_number: None,
            note: String::new(),
            learning_state: "new".into(),
        }).unwrap();
        let input = SaveReviewItemInput {
            id: Some("review-item-1".into()),
            source_kind: "vocabulary".into(),
            pack_id: None,
            test_id: None,
            module_type: None,
            question_id: None,
            vocabulary_id: Some(vocabulary.id),
            source_session_id: None,
            source_start_ms: None,
        };
        let created = save_review_item(&connection, input.clone()).unwrap();
        let duplicate = save_review_item(&connection, SaveReviewItemInput { id: None, ..input }).unwrap();
        assert_eq!(created.id, duplicate.id);
        assert_eq!(list_review_items(&connection).unwrap().len(), 1);

        let graded = grade_review_item(&mut connection, &created.id, "good").unwrap();
        assert_eq!(graded.interval_days, 1);
        assert_eq!(graded.repetitions, 1);
        assert!(graded.last_reviewed_at.is_some());
        let event_count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM review_events WHERE review_item_id = ?1",
            [&created.id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(event_count, 1);
    }

    #[test]
    fn submission_atomically_completes_only_an_in_progress_session() {
        let mut connection = database();
        create_detached_session(&connection, "submit-session", "reading");
        save_answer(
            &connection,
            SaveAnswerInput {
                session_id: "submit-session".into(),
                question_id: "question-1".into(),
                answer: json!("B"),
            },
        )
        .unwrap();

        let snapshot = submit_session(&mut connection, "submit-session").unwrap();
        let session = snapshot.session.as_ref().unwrap();
        assert_eq!(session.status, "submitted");
        assert!(session.completed_at.is_some());
        assert_eq!(session.completed_at.as_ref(), Some(&session.updated_at));
        assert_eq!(snapshot.answers.len(), 1);
        assert_eq!(snapshot.answers[0].answer, json!("B"));

        let completed_at = session.completed_at.clone();
        let repeated = submit_session(&mut connection, "submit-session").unwrap();
        assert_eq!(repeated.session.as_ref().unwrap().completed_at, completed_at);
        let persisted = load_session(&connection, "submit-session")
            .unwrap()
            .unwrap();
        assert_eq!(persisted.session.unwrap().completed_at, completed_at);
        assert!(matches!(
            save_answer(
                &connection,
                SaveAnswerInput {
                    session_id: "submit-session".into(),
                    question_id: "question-2".into(),
                    answer: json!("late"),
                },
            ),
            Err(BackendError::Conflict(_))
        ));
    }

    #[test]
    fn submission_rejects_a_missing_session_without_creating_it() {
        let mut connection = database();
        assert!(matches!(
            submit_session(&mut connection, "missing-session"),
            Err(BackendError::NotFound(_))
        ));
        assert!(load_session(&connection, "missing-session").unwrap().is_none());
        assert!(matches!(
            save_answer(
                &connection,
                SaveAnswerInput {
                    session_id: "missing-session".into(),
                    question_id: "question-1".into(),
                    answer: json!("answer"),
                },
            ),
            Err(BackendError::NotFound(_))
        ));
        assert!(load_session(&connection, "missing-session").unwrap().is_none());
    }

    #[test]
    fn recent_sessions_are_returned_newest_first_with_stable_tie_breaking() {
        let connection = database();
        for (id, test_id, module) in [
            ("session-a", "test-a", "reading"),
            ("session-b", "test-b", "listening"),
            ("session-c", "test-c", "writing"),
        ] {
            create_session(
                &connection,
                CreateSessionInput {
                    id: Some(id.into()),
                    pack_id: None,
                    test_id: Some(test_id.into()),
                    module: Some(module.into()),
                    mode: "study".into(),
                },
            )
            .unwrap();
        }

        connection
            .execute(
                "UPDATE practice_sessions SET updated_at = ?2 WHERE id = ?1",
                params!["session-a", "2026-09-01T10:00:00.000Z"],
            )
            .unwrap();
        for id in ["session-b", "session-c"] {
            connection
                .execute(
                    "UPDATE practice_sessions SET updated_at = ?2 WHERE id = ?1",
                    params![id, "2026-09-01T11:00:00.000Z"],
                )
                .unwrap();
        }

        let sessions = list_recent_sessions(&connection).unwrap();
        assert_eq!(
            sessions
                .iter()
                .map(|session| session.id.as_str())
                .collect::<Vec<_>>(),
            vec!["session-c", "session-b", "session-a"]
        );
        assert_eq!(sessions[0].module.as_deref(), Some("writing"));
        assert_eq!(sessions[2].test_id.as_deref(), Some("test-a"));
    }
}
