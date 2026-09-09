use chrono::{SecondsFormat, Utc};
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
        WritingDraftRecord, WritingVersionRecord,
    },
};

const MAX_JSON_BYTES: usize = 256 * 1024;
const MAX_WRITING_BYTES: usize = 2 * 1024 * 1024;
const MAX_NOTE_BYTES: usize = 16 * 1024;

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
