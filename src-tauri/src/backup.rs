use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, MAIN_DB};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    error::{BackendError, Result},
    models::WorkspaceBackupSummary,
    storage,
    workspace::{
        ensure_existing_within, path_to_forward_slashes, reject_link_or_reparse,
        validate_relative_path, Workspace,
    },
};

const BACKUP_SCHEMA_VERSION: u32 = 1;
const BACKUP_MANIFEST_FILE: &str = "backup-manifest.json";
const BACKUP_DATABASE_FILE: &str = "database.sqlite3";
const BACKED_UP_DIRECTORIES: [&str; 6] = ["packs", "imports", "themes", "library-assets", "speaking-materials", "speaking-recordings"];

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupManifest {
    schema_version: u32,
    application: String,
    created_at: String,
    source_workspace_id: String,
    files: Vec<BackupFile>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupFile {
    path: String,
    byte_length: u64,
    sha256: String,
}

pub fn create_workspace_backup(
    workspace: &Workspace,
    connection: &Connection,
    destination_parent: &str,
) -> Result<WorkspaceBackupSummary> {
    let parent = validate_destination_parent(destination_parent)?;
    let workspace_root = fs::canonicalize(workspace.root())?;
    if parent.starts_with(&workspace_root) {
        return Err(BackendError::Security(
            "Choose a backup destination outside the active workspace.".to_string(),
        ));
    }
    let created_at = now_iso();
    let destination = parent.join(format!(
        "ielts-workbench-backup-{}-{}",
        Utc::now().format("%Y%m%d-%H%M%S"),
        &Uuid::new_v4().to_string()[..8]
    ));
    fs::create_dir(&destination)?;
    let result = (|| {
        let database_destination = destination.join(BACKUP_DATABASE_FILE);
        connection.backup(MAIN_DB, &database_destination, None)?;
        sync_file(&database_destination)?;

        for directory in BACKED_UP_DIRECTORIES {
            if workspace.root().join(directory).exists() {
                copy_tree_for_backup(workspace.root(), &workspace.root().join(directory), &destination)?;
            }
        }

        let mut paths = vec![PathBuf::from(BACKUP_DATABASE_FILE)];
        if workspace.root().join("speaking.sqlite3").exists() {
            let speaking = crate::speaking::database(workspace.root())?;
            speaking.backup(MAIN_DB, destination.join("speaking.sqlite3"), None)?;
            sync_file(&destination.join("speaking.sqlite3"))?;
            paths.push(PathBuf::from("speaking.sqlite3"));
        }
        for directory in BACKED_UP_DIRECTORIES {
            let copied_root = destination.join(directory);
            if copied_root.is_dir() {
                for entry in WalkDir::new(&copied_root).follow_links(false) {
                    let entry = entry.map_err(|error| BackendError::Io(error.into()))?;
                    if entry.file_type().is_file() {
                        paths.push(entry.path().strip_prefix(&destination).map_err(|_| BackendError::Security("Backup path escaped its destination.".to_string()))?.to_path_buf());
                    }
                }
            }
        }
        paths.sort();
        let files = paths.iter().map(|relative| {
            let full = destination.join(relative);
            Ok(BackupFile {
                path: path_to_forward_slashes(relative)?,
                byte_length: fs::metadata(&full)?.len(),
                sha256: sha256_file(&full)?,
            })
        }).collect::<Result<Vec<_>>>()?;
        let manifest = BackupManifest {
            schema_version: BACKUP_SCHEMA_VERSION,
            application: "IELTS Workbench".to_string(),
            created_at: created_at.clone(),
            source_workspace_id: workspace.info()?.workspace_id,
            files,
        };
        write_new_json(&destination.join(BACKUP_MANIFEST_FILE), &manifest)?;
        sync_file(&destination.join(BACKUP_MANIFEST_FILE))?;
        let total_bytes = manifest.files.iter().map(|file| file.byte_length).sum();
        let database_sha256 = manifest.files.iter().find(|file| file.path == BACKUP_DATABASE_FILE).map(|file| file.sha256.clone()).ok_or_else(|| BackendError::Conflict("Backup database was not recorded in the manifest.".to_string()))?;
        Ok(WorkspaceBackupSummary {
            path: path_string(&destination)?,
            created_at,
            source_workspace_id: manifest.source_workspace_id,
            file_count: manifest.files.len() as u64,
            total_bytes,
            database_sha256,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&destination);
    }
    result
}

pub fn restore_workspace_backup(
    backup_path: &str,
    destination_parent: &str,
) -> Result<Workspace> {
    let backup_root = PathBuf::from(backup_path);
    if !backup_root.is_absolute() || !backup_root.is_dir() {
        return Err(BackendError::InvalidInput("Choose an existing backup directory.".to_string()));
    }
    reject_link_or_reparse(&backup_root, "backup root")?;
    let backup_root = fs::canonicalize(backup_root)?;
    let manifest_path = backup_root.join(BACKUP_MANIFEST_FILE);
    reject_link_or_reparse(&manifest_path, BACKUP_MANIFEST_FILE)?;
    let manifest: BackupManifest = serde_json::from_slice(&fs::read(&manifest_path)?)?;
    validate_manifest(&backup_root, &manifest)?;

    let parent = validate_destination_parent(destination_parent)?;
    let destination = parent.join(format!(
        "IELTS-Workbench-Restored-{}-{}",
        Utc::now().format("%Y%m%d-%H%M%S"),
        &Uuid::new_v4().to_string()[..8]
    ));
    let result = (|| {
        let workspace = Workspace::initialize(path_string(&destination)?.as_str())?;
        storage::initialize_database(&workspace.database_path())?;
        fs::remove_file(workspace.database_path())?;

        for file in &manifest.files {
            let relative = validate_relative_path(&file.path)?;
            let source = backup_root.join(&relative);
            let destination_file = if file.path == BACKUP_DATABASE_FILE {
                workspace.database_path()
            } else {
                workspace.root().join(&relative)
            };
            if let Some(parent) = destination_file.parent() {
                fs::create_dir_all(parent)?;
            }
            copy_new_file(&source, &destination_file)?;
        }
        let connection = storage::open_database(&workspace.database_path())?;
        let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        if integrity != "ok" {
            return Err(BackendError::Conflict(format!("Restored SQLite integrity check failed: {integrity}")));
        }
        drop(connection);
        Workspace::open(path_string(workspace.root())?.as_str())
    })();
    if result.is_err() && destination.exists() {
        let _ = fs::remove_dir_all(&destination);
    }
    result
}

fn validate_manifest(root: &Path, manifest: &BackupManifest) -> Result<()> {
    if manifest.schema_version != BACKUP_SCHEMA_VERSION || manifest.application != "IELTS Workbench" {
        return Err(BackendError::Conflict("The selected backup version is not supported.".to_string()));
    }
    if manifest.files.is_empty() || !manifest.files.iter().any(|file| file.path == BACKUP_DATABASE_FILE) {
        return Err(BackendError::Conflict("The backup manifest does not contain a database.".to_string()));
    }
    let mut paths = HashSet::new();
    for file in &manifest.files {
        let relative = validate_relative_path(&file.path)?;
        let first = relative.components().next().and_then(|component| component.as_os_str().to_str()).unwrap_or_default();
        if file.path != BACKUP_DATABASE_FILE && file.path != "speaking.sqlite3" && !BACKED_UP_DIRECTORIES.contains(&first) {
            return Err(BackendError::Security("The backup manifest contains an unsupported destination path.".to_string()));
        }
        if !paths.insert(file.path.as_str()) {
            return Err(BackendError::Conflict("The backup manifest contains a duplicate file path.".to_string()));
        }
        let source = root.join(relative);
        if !source.is_file() {
            return Err(BackendError::Conflict(format!("Backup file is missing: {}", file.path)));
        }
        reject_link_or_reparse(&source, "backup file")?;
        ensure_existing_within(root, &source)?;
        let metadata = fs::metadata(&source)?;
        if metadata.len() != file.byte_length || sha256_file(&source)? != file.sha256 {
            return Err(BackendError::Conflict(format!("Backup integrity check failed: {}", file.path)));
        }
    }
    Ok(())
}

fn validate_destination_parent(value: &str) -> Result<PathBuf> {
    let path = PathBuf::from(value);
    if !path.is_absolute() || !path.is_dir() {
        return Err(BackendError::InvalidInput("Choose an existing absolute destination folder.".to_string()));
    }
    reject_link_or_reparse(&path, "backup destination")?;
    let canonical = fs::canonicalize(path)?;
    if canonical.parent().is_none() {
        return Err(BackendError::InvalidInput("Choose a dedicated folder instead of a filesystem root.".to_string()));
    }
    Ok(canonical)
}

fn copy_tree_for_backup(workspace_root: &Path, source_root: &Path, destination_root: &Path) -> Result<()> {
    reject_link_or_reparse(source_root, "workspace backup directory")?;
    for entry in WalkDir::new(source_root).follow_links(false) {
        let entry = entry.map_err(|error| BackendError::Io(error.into()))?;
        reject_link_or_reparse(entry.path(), "workspace backup entry")?;
        ensure_existing_within(workspace_root, entry.path())?;
        let relative = entry.path().strip_prefix(workspace_root).map_err(|_| BackendError::Security("Workspace backup entry escaped the workspace.".to_string()))?;
        let destination = destination_root.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(destination)?;
        } else if entry.file_type().is_file() {
            copy_new_file(entry.path(), &destination)?;
        } else {
            return Err(BackendError::Security("Unsupported workspace entry type in backup.".to_string()));
        }
    }
    Ok(())
}

fn copy_new_file(source: &Path, destination: &Path) -> Result<()> {
    let mut input = fs::File::open(source)?;
    let mut output = OpenOptions::new().write(true).create_new(true).open(destination)?;
    std::io::copy(&mut input, &mut output)?;
    output.sync_all()?;
    Ok(())
}

fn write_new_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(value)?;
    let mut output = OpenOptions::new().write(true).create_new(true).open(path)?;
    output.write_all(&bytes)?;
    output.write_all(b"\n")?;
    output.sync_all()?;
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut input = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer)?;
        if read == 0 { break; }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn sync_file(path: &Path) -> Result<()> {
    OpenOptions::new().read(true).write(true).open(path)?.sync_all()?;
    Ok(())
}

fn path_string(path: &Path) -> Result<String> {
    path.to_str().map(ToOwned::to_owned).ok_or_else(|| BackendError::InvalidInput("Path is not valid Unicode.".to_string()))
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_and_restore_verify_hashes_and_use_a_new_workspace() {
        let temp = tempfile::tempdir().unwrap();
        let source_root = temp.path().join("source");
        let workspace = Workspace::initialize(source_root.to_str().unwrap()).unwrap();
        storage::initialize_database(&workspace.database_path()).unwrap();
        fs::write(workspace.root().join("imports").join("draft.txt"), b"draft").unwrap();
        fs::create_dir(workspace.root().join("library-assets")).unwrap();
        fs::write(workspace.root().join("library-assets/reference.txt"), b"reference preserved").unwrap();
        let speaking=crate::speaking::database(workspace.root()).unwrap();
        speaking.execute("INSERT INTO speaking_favorites(topic_id,created_at) VALUES('original-topic','2026-09-19T00:00:00Z')",[]).unwrap();
        let connection = storage::open_database(&workspace.database_path()).unwrap();
        connection.execute("INSERT INTO app_settings(key, value_json, updated_at) VALUES ('proof', '\"kept\"', '2026-09-09T00:00:00.000Z')", []).unwrap();
        let exports = temp.path().join("exports");
        fs::create_dir(&exports).unwrap();
        let summary = create_workspace_backup(&workspace, &connection, exports.to_str().unwrap()).unwrap();
        assert_eq!(summary.database_sha256.len(), 64);
        let restored = restore_workspace_backup(&summary.path, exports.to_str().unwrap()).unwrap();
        assert_ne!(workspace.info().unwrap().workspace_id, restored.info().unwrap().workspace_id);
        assert_eq!(fs::read(restored.root().join("imports").join("draft.txt")).unwrap(), b"draft");
        let restored_connection = storage::open_database(&restored.database_path()).unwrap();
        let proof: String = restored_connection.query_row("SELECT value_json FROM app_settings WHERE key = 'proof'", [], |row| row.get(0)).unwrap();
        assert_eq!(proof, "\"kept\"");
        assert_eq!(fs::read(restored.root().join("library-assets/reference.txt")).unwrap(),b"reference preserved");
        assert_eq!(crate::speaking::favorites(restored.root()).unwrap(),vec!["original-topic"]);
    }

    #[test]
    fn restore_rejects_a_tampered_file_without_creating_a_successful_workspace() {
        let temp = tempfile::tempdir().unwrap();
        let workspace = Workspace::initialize(temp.path().join("source").to_str().unwrap()).unwrap();
        storage::initialize_database(&workspace.database_path()).unwrap();
        let connection = storage::open_database(&workspace.database_path()).unwrap();
        let exports = temp.path().join("exports");
        fs::create_dir(&exports).unwrap();
        let summary = create_workspace_backup(&workspace, &connection, exports.to_str().unwrap()).unwrap();
        fs::write(Path::new(&summary.path).join(BACKUP_DATABASE_FILE), b"tampered").unwrap();
        assert!(restore_workspace_backup(&summary.path, exports.to_str().unwrap()).is_err());
        assert!(fs::read_dir(&exports).unwrap().filter_map(|entry| entry.ok()).all(|entry| !entry.file_name().to_string_lossy().starts_with("IELTS-Workbench-Restored-")));
    }

    #[test]
    fn backup_rejects_a_destination_inside_the_active_workspace() {
        let temp = tempfile::tempdir().unwrap();
        let workspace = Workspace::initialize(temp.path().join("source").to_str().unwrap()).unwrap();
        storage::initialize_database(&workspace.database_path()).unwrap();
        let connection = storage::open_database(&workspace.database_path()).unwrap();
        let destination = workspace.root().join("imports");

        let error = create_workspace_backup(&workspace, &connection, destination.to_str().unwrap()).unwrap_err();
        assert!(error.to_string().contains("outside the active workspace"));
    }
}
