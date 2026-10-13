use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use chrono::{NaiveDate, Utc};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    error::{BackendError, Result},
    models::ObsidianExportResult,
    workspace::reject_link_or_reparse,
};

const START_MARKER: &str = "<!-- ielts-workbench:start -->";
const END_MARKER: &str = "<!-- ielts-workbench:end -->";
const MAX_BRIEF_BYTES: usize = 128 * 1024;
const MAX_EXISTING_NOTE_BYTES: u64 = 2 * 1024 * 1024;

pub fn export_daily_brief(
    workspace_root: &Path,
    vault_path: &str,
    date: &str,
    markdown: &str,
) -> Result<ObsidianExportResult> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| {
        BackendError::InvalidInput("Daily brief date must use YYYY-MM-DD.".to_string())
    })?;
    if markdown.trim().is_empty() || markdown.len() > MAX_BRIEF_BYTES || markdown.contains('\0') {
        return Err(BackendError::InvalidInput(
            "Daily brief Markdown must contain 1 to 131072 bytes and no NUL characters.".to_string(),
        ));
    }
    if markdown.contains(START_MARKER) || markdown.contains(END_MARKER) {
        return Err(BackendError::InvalidInput(
            "Daily brief content cannot contain reserved integration markers.".to_string(),
        ));
    }

    let requested_vault = PathBuf::from(vault_path);
    if !requested_vault.is_absolute() || !requested_vault.is_dir() {
        return Err(BackendError::InvalidInput(
            "Choose an existing absolute Obsidian vault directory.".to_string(),
        ));
    }
    reject_link_or_reparse(&requested_vault, "Obsidian vault")?;
    let vault = fs::canonicalize(requested_vault)?;
    if vault.parent().is_none() {
        return Err(BackendError::InvalidInput(
            "A filesystem root cannot be used as an Obsidian vault.".to_string(),
        ));
    }

    let existing_english_tree = vault.join("课程学习").join("英语学习").join("雅思");
    let ielts_dir = if existing_english_tree.is_dir() {
        let mut path = vault.clone();
        for part in ["课程学习", "英语学习", "雅思"] {
            path.push(part);
            reject_link_or_reparse(&path, "existing English learning folder")?;
        }
        existing_english_tree
    } else { vault.join("IELTS") };
    if ielts_dir.exists() {
        reject_link_or_reparse(&ielts_dir, "Obsidian IELTS folder")?;
        if !ielts_dir.is_dir() {
            return Err(BackendError::Conflict(
                "The vault already contains a non-directory entry named IELTS.".to_string(),
            ));
        }
    } else {
        fs::create_dir(&ielts_dir)?;
    }
    let canonical_ielts = fs::canonicalize(&ielts_dir)?;
    if !canonical_ielts.starts_with(&vault) {
        return Err(BackendError::InvalidInput(
            "The Obsidian IELTS folder escapes the selected vault.".to_string(),
        ));
    }

    let target = canonical_ielts.join(format!("{date}.md"));
    let previous = if target.exists() {
        reject_link_or_reparse(&target, "Obsidian daily note")?;
        let metadata = fs::metadata(&target)?;
        if !metadata.is_file() || metadata.len() > MAX_EXISTING_NOTE_BYTES {
            return Err(BackendError::InvalidInput(
                "The existing Obsidian daily note is not a regular file or exceeds 2 MiB.".to_string(),
            ));
        }
        Some(fs::read_to_string(&target).map_err(|_| {
            BackendError::InvalidInput("The existing Obsidian daily note must be valid UTF-8.".to_string())
        })?)
    } else {
        None
    };

    let managed = format!("{START_MARKER}\n{}\n{END_MARKER}", markdown.trim());
    let next = merge_managed_block(previous.as_deref(), &managed)?;
    let previous_sha256 = previous.as_deref().map(hash_text);
    let next_sha256 = hash_text(&next);
    if previous.as_deref() == Some(next.as_str()) {
        return Ok(ObsidianExportResult {
            path: path_string(&target)?,
            backup_path: None,
            previous_sha256,
            sha256: next_sha256,
            changed: false,
        });
    }

    let backup_path = if let Some(previous_text) = previous.as_deref() {
        let backup_dir = workspace_root.join("backups").join("obsidian-daily-briefs");
        fs::create_dir_all(&backup_dir)?;
        let backup = backup_dir.join(format!(
            "{date}-{}-{}.md",
            Utc::now().format("%Y%m%dT%H%M%SZ"),
            Uuid::new_v4()
        ));
        write_new_synced(&backup, previous_text.as_bytes())?;
        Some(path_string(&backup)?)
    } else {
        None
    };

    replace_file_atomically(&target, next.as_bytes())?;
    let verified = fs::read(&target)?;
    if hash_bytes(&verified) != next_sha256 {
        return Err(BackendError::Conflict(
            "Obsidian daily brief verification failed after writing.".to_string(),
        ));
    }

    Ok(ObsidianExportResult {
        path: path_string(&target)?,
        backup_path,
        previous_sha256,
        sha256: next_sha256,
        changed: true,
    })
}

fn merge_managed_block(previous: Option<&str>, managed: &str) -> Result<String> {
    let Some(previous) = previous else {
        return Ok(format!("# {managed_date}\n\n{managed}\n", managed_date = managed_date(managed)));
    };
    match (previous.find(START_MARKER), previous.find(END_MARKER)) {
        (None, None) => Ok(format!("{}{}{}\n", previous.trim_end(), if previous.trim().is_empty() { "" } else { "\n\n" }, managed)),
        (Some(start), Some(end)) if end >= start => {
            let end = end + END_MARKER.len();
            if previous[end..].contains(START_MARKER) || previous[..start].contains(END_MARKER) {
                return Err(BackendError::Conflict("The daily note contains ambiguous IELTS Workbench markers.".to_string()));
            }
            Ok(format!("{}{}{}", &previous[..start], managed, &previous[end..]))
        }
        _ => Err(BackendError::Conflict(
            "The daily note contains an incomplete IELTS Workbench marker pair.".to_string(),
        )),
    }
}

fn managed_date(managed: &str) -> &str {
    managed.lines().find_map(|line| line.strip_prefix("date: ")).unwrap_or("IELTS Daily Brief")
}

fn replace_file_atomically(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or_else(|| BackendError::InvalidInput("Daily note has no parent directory.".to_string()))?;
    let temporary = parent.join(format!(".ielts-workbench-{}.tmp", Uuid::new_v4()));
    write_new_synced(&temporary, bytes)?;
    if !path.exists() {
        fs::rename(&temporary, path)?;
        return Ok(());
    }
    let previous = parent.join(format!(".ielts-workbench-{}.previous", Uuid::new_v4()));
    fs::rename(path, &previous)?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::rename(&previous, path);
        let _ = fs::remove_file(&temporary);
        return Err(error.into());
    }
    fs::remove_file(previous)?;
    Ok(())
}

fn write_new_synced(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new().create_new(true).write(true).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn hash_text(value: &str) -> String { hash_bytes(value.as_bytes()) }
fn hash_bytes(value: &[u8]) -> String { format!("{:x}", Sha256::digest(value)) }
fn path_string(path: &Path) -> Result<String> {
    path.to_str().map(str::to_owned).ok_or_else(|| BackendError::InvalidInput("Obsidian path is not valid UTF-8.".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_updates_and_backs_up_only_the_managed_daily_block() {
        let workspace = tempfile::tempdir().unwrap();
        fs::create_dir(workspace.path().join("backups")).unwrap();
        let vault = tempfile::tempdir().unwrap();
        let first = export_daily_brief(workspace.path(), vault.path().to_str().unwrap(), "2026-09-17", "date: 2026-09-17\n\n## IELTS Workbench\n- 20 min").unwrap();
        assert!(first.changed);
        let target = PathBuf::from(&first.path);
        let original = fs::read_to_string(&target).unwrap();
        fs::write(&target, format!("personal note\n\n{original}")).unwrap();

        let second = export_daily_brief(workspace.path(), vault.path().to_str().unwrap(), "2026-09-17", "date: 2026-09-17\n\n## IELTS Workbench\n- 35 min").unwrap();
        let updated = fs::read_to_string(&target).unwrap();
        assert!(updated.starts_with("personal note"));
        assert!(updated.contains("35 min"));
        assert!(!updated.contains("20 min"));
        assert!(second.backup_path.as_ref().is_some_and(|path| Path::new(path).is_file()));
        assert_ne!(second.previous_sha256, Some(second.sha256));
    }

    #[test]
    fn rejects_reserved_markers_and_invalid_dates() {
        let workspace = tempfile::tempdir().unwrap();
        let vault = tempfile::tempdir().unwrap();
        assert!(export_daily_brief(workspace.path(), vault.path().to_str().unwrap(), "17-09-2026", "valid").is_err());
        assert!(export_daily_brief(workspace.path(), vault.path().to_str().unwrap(), "2026-09-17", START_MARKER).is_err());
    }

    #[test]
    fn reuses_existing_english_tree_and_is_idempotent() {
        let workspace = tempfile::tempdir().unwrap();
        let vault = tempfile::tempdir().unwrap();
        let directory = vault.path().join("课程学习").join("英语学习").join("雅思");
        fs::create_dir_all(&directory).unwrap();
        let first = export_daily_brief(workspace.path(), vault.path().to_str().unwrap(), "2026-09-19", "date: 2026-09-19\nPractice source").unwrap();
        let second = export_daily_brief(workspace.path(), vault.path().to_str().unwrap(), "2026-09-19", "date: 2026-09-19\nPractice source").unwrap();
        assert!(Path::new(&first.path).starts_with(fs::canonicalize(&directory).unwrap()));
        assert!(!vault.path().join("IELTS").exists());
        assert!(!second.changed);
        assert_eq!(first.sha256, second.sha256);
    }
}
