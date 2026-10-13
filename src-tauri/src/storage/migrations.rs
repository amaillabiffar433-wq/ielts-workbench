use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

use crate::error::{BackendError, Result};

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial",
        sql: include_str!("../../migrations/0001_initial.sql"),
    },
    Migration {
        version: 2,
        name: "indexes",
        sql: include_str!("../../migrations/0002_indexes.sql"),
    },
    Migration {
        version: 3,
        name: "session_immutability",
        sql: include_str!("../../migrations/0003_session_immutability.sql"),
    },
    Migration {
        version: 4,
        name: "vocabulary_context",
        sql: include_str!("../../migrations/0004_vocabulary_context.sql"),
    },
    Migration {
        version: 5,
        name: "review_schedule",
        sql: include_str!("../../migrations/0005_review_schedule.sql"),
    },
    Migration {
        version: 6,
        name: "notebook_entry_kind",
        sql: include_str!("../../migrations/0006_notebook_entry_kind.sql"),
    },
];

pub fn run(connection: &mut Connection) -> Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )?;

    let newest_supported = MIGRATIONS.last().map_or(0, |migration| migration.version);
    let newest_applied: Option<i64> = connection.query_row(
        "SELECT MAX(version) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    if newest_applied.is_some_and(|version| version > newest_supported) {
        return Err(BackendError::Conflict(
            "The workspace database was created by a newer IELTS Workbench version."
                .to_string(),
        ));
    }

    for migration in MIGRATIONS {
        let applied = connection
            .query_row(
                "SELECT version FROM schema_migrations WHERE version = ?1",
                [migration.version],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        if applied.is_some() {
            continue;
        }

        let transaction =
            connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute_batch(migration.sql)?;
        transaction.execute(
            "INSERT INTO schema_migrations(version, name, applied_at)
             VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            params![migration.version, migration.name],
        )?;
        transaction.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_idempotent_and_create_required_tables() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "foreign_keys", "ON").unwrap();
        run(&mut connection).unwrap();
        run(&mut connection).unwrap();

        let migration_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(migration_count, MIGRATIONS.len() as i64);

        for table in [
            "app_settings",
            "installed_packs",
            "practice_sessions",
            "answers",
            "annotations",
            "writing_drafts",
            "writing_versions",
            "vocabulary_items",
            "review_items",
            "review_events",
            "ai_runs",
        ] {
            let exists: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(exists, 1, "missing table {table}");
        }
    }

    #[test]
    fn rejects_a_database_newer_than_the_application() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_migrations (
                    version INTEGER PRIMARY KEY NOT NULL,
                    name TEXT NOT NULL,
                    applied_at TEXT NOT NULL
                );
                INSERT INTO schema_migrations(version, name, applied_at)
                VALUES (999, 'future', '2026-09-02T00:00:00.000Z');",
            )
            .unwrap();

        assert!(matches!(run(&mut connection), Err(BackendError::Conflict(_))));
    }

    #[test]
    fn submitted_session_rows_are_immutable() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "foreign_keys", "ON").unwrap();
        run(&mut connection).unwrap();
        connection
            .execute_batch(
                "INSERT INTO practice_sessions(
                    id, mode, status, started_at, updated_at, elapsed_seconds
                 ) VALUES (
                    'submitted-session', 'study', 'submitted',
                    '2026-09-02T00:00:00.000Z', '2026-09-02T00:01:00.000Z', 0
                 );",
            )
            .unwrap();

        assert!(connection
            .execute(
                "INSERT INTO answers(session_id, question_id, answer_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    "submitted-session",
                    "question-1",
                    "\"answer\"",
                    "2026-09-02T00:02:00.000Z"
                ],
            )
            .is_err());
        assert!(connection
            .execute(
                "INSERT INTO writing_drafts(session_id, task_id, content, word_count, updated_at)
                 VALUES (?1, ?2, ?3, 1, ?4)",
                params![
                    "submitted-session",
                    "task-1",
                    "answer",
                    "2026-09-02T00:02:00.000Z"
                ],
            )
            .is_err());
    }

    #[test]
    fn upgrades_the_original_vocabulary_table_without_losing_rows() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.pragma_update(None, "foreign_keys", "ON").unwrap();
        connection.execute_batch(
            "CREATE TABLE schema_migrations (
                version INTEGER PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );",
        ).unwrap();
        for migration in &MIGRATIONS[..3] {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .unwrap();
            transaction.execute_batch(migration.sql).unwrap();
            transaction.execute(
                "INSERT INTO schema_migrations(version, name, applied_at)
                 VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                params![migration.version, migration.name],
            ).unwrap();
            transaction.commit().unwrap();
        }
        connection.execute(
            "INSERT INTO vocabulary_items(
                id, term, normalized_term, context, learning_state, created_at, updated_at
             ) VALUES ('word-1', 'Scrolls', 'scrolls', 'old context', 'new', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')",
            [],
        ).unwrap();

        run(&mut connection).unwrap();

        let row: (String, String, String) = connection.query_row(
            "SELECT term, sentence, note FROM vocabulary_items WHERE id = 'word-1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap();
        assert_eq!(row, ("Scrolls".into(), "".into(), "".into()));
    }
}
