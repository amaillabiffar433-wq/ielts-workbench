# Speaking practice and live-version compatibility

The user explicitly expanded Luma to speaking topics, timed practice, favorites, completion records, and optional microphone recording. Imported topics live in an immutable `speaking-materials/catalog.json` under the selected workspace, retain stable source hashes/page references, and link to full managed source resources. They are distinct from automatically scored Reading/Listening packs.

Speaking records live in `speaking.sqlite3` in the same user-selected workspace with a dedicated versioned migration. This avoids raising the main database migration above 5 while the user still has the previous application open: that version rejects newer main schemas. No existing session or answer tables are recreated. Main and Speaking database backups use SQLite's online backup API; recordings and both material catalogs are included in workspace backups and validated on restore.

Rust validates every topic/session/recording identifier and path. A recording starts only after an explicit Record action, stays local, and is saved beneath `speaking-recordings`. No recognition, network upload, or automatic speaking score is introduced. Completion, elapsed time and notes are durable; UI aggregates Speaking separately from objective scores. Source materials are excluded from Git.
