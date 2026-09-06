use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Component, Path, PathBuf},
};

use chrono::{SecondsFormat, Utc};
use uuid::Uuid;

use crate::{
    error::{BackendError, Result},
    models::{BootstrapConfig, WorkspaceInfo, WorkspaceMetadata},
};

pub const WORKSPACE_SCHEMA_VERSION: u32 = 1;
pub const WORKSPACE_DATABASE_FILE: &str = "ielts-workbench.sqlite3";
const WORKSPACE_METADATA_FILE: &str = "workspace.json";
const WORKSPACE_DIRECTORIES: [&str; 5] = ["packs", "imports", "themes", "backups", "logs"];

#[derive(Debug, Clone)]
pub struct Workspace {
    root: PathBuf,
    metadata: WorkspaceMetadata,
}

impl Workspace {
    pub fn initialize(selected_path: &str) -> Result<Self> {
        if selected_path.trim().is_empty() {
            return Err(BackendError::InvalidInput(
                "Workspace path cannot be empty.".to_string(),
            ));
        }

        let requested = PathBuf::from(selected_path);
        if !requested.is_absolute() {
            return Err(BackendError::InvalidInput(
                "Workspace path must be absolute.".to_string(),
            ));
        }

        fs::create_dir_all(&requested)?;
        reject_link_or_reparse(&requested, "workspace root")?;
        let root = fs::canonicalize(&requested)?;
        if root.parent().is_none() {
            return Err(BackendError::InvalidInput(
                "Choose a dedicated folder instead of a filesystem root.".to_string(),
            ));
        }

        verify_writable(&root)?;
        for directory in WORKSPACE_DIRECTORIES {
            let path = root.join(directory);
            if path.exists() {
                reject_link_or_reparse(&path, directory)?;
                if !path.is_dir() {
                    return Err(BackendError::Conflict(format!(
                        "Workspace entry '{directory}' must be a directory."
                    )));
                }
            } else {
                fs::create_dir(&path)?;
            }
            ensure_existing_within(&root, &path)?;
        }

        let metadata_path = root.join(WORKSPACE_METADATA_FILE);
        let metadata = if metadata_path.exists() {
            reject_link_or_reparse(&metadata_path, WORKSPACE_METADATA_FILE)?;
            let bytes = fs::read(&metadata_path)?;
            let metadata: WorkspaceMetadata = serde_json::from_slice(&bytes)?;
            validate_workspace_metadata(&metadata)?;
            metadata
        } else {
            let metadata = WorkspaceMetadata {
                schema_version: WORKSPACE_SCHEMA_VERSION,
                workspace_id: Uuid::new_v4().to_string(),
                created_at: now_iso(),
                database_file: WORKSPACE_DATABASE_FILE.to_string(),
            };
            write_new_json_atomically(&metadata_path, &metadata)?;
            metadata
        };

        let database_path = root.join(WORKSPACE_DATABASE_FILE);
        if database_path.exists() {
            reject_link_or_reparse(&database_path, WORKSPACE_DATABASE_FILE)?;
            ensure_existing_within(&root, &database_path)?;
        }

        Ok(Self { root, metadata })
    }

    pub fn open(path: &str) -> Result<Self> {
        let requested = PathBuf::from(path);
        if !requested.is_absolute() || !requested.is_dir() {
            return Err(BackendError::WorkspaceUnavailable(
                "The selected workspace folder does not exist.".to_string(),
            ));
        }
        reject_link_or_reparse(&requested, "workspace root")?;
        let root = fs::canonicalize(requested)?;
        let metadata_path = root.join(WORKSPACE_METADATA_FILE);
        if !metadata_path.is_file() {
            return Err(BackendError::WorkspaceUnavailable(
                "workspace.json is missing.".to_string(),
            ));
        }
        reject_link_or_reparse(&metadata_path, WORKSPACE_METADATA_FILE)?;
        let metadata: WorkspaceMetadata = serde_json::from_slice(&fs::read(metadata_path)?)?;
        validate_workspace_metadata(&metadata)?;

        for directory in WORKSPACE_DIRECTORIES {
            let path = root.join(directory);
            if !path.is_dir() {
                return Err(BackendError::WorkspaceUnavailable(format!(
                    "Required workspace directory '{directory}' is missing."
                )));
            }
            reject_link_or_reparse(&path, directory)?;
            ensure_existing_within(&root, &path)?;
        }

        let database_path = root.join(&metadata.database_file);
        if !database_path.is_file() {
            return Err(BackendError::WorkspaceUnavailable(
                "The workspace database is missing.".to_string(),
            ));
        }
        reject_link_or_reparse(&database_path, WORKSPACE_DATABASE_FILE)?;
        ensure_existing_within(&root, &database_path)?;

        Ok(Self { root, metadata })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn database_path(&self) -> PathBuf {
        self.root.join(&self.metadata.database_file)
    }

    pub fn packs_dir(&self) -> PathBuf {
        self.root.join("packs")
    }

    pub fn info(&self) -> Result<WorkspaceInfo> {
        Ok(WorkspaceInfo {
            workspace_path: path_to_string(&self.root)?,
            workspace_id: self.metadata.workspace_id.clone(),
            created_at: self.metadata.created_at.clone(),
            database_file: self.metadata.database_file.clone(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct BootstrapStore {
    config_dir: PathBuf,
}

impl BootstrapStore {
    pub fn new(config_dir: PathBuf) -> Self {
        Self { config_dir }
    }

    fn config_path(&self) -> PathBuf {
        self.config_dir.join("bootstrap.json")
    }

    pub fn exists(&self) -> bool {
        self.config_path().is_file()
    }

    pub fn load(&self) -> Result<Option<BootstrapConfig>> {
        let path = self.config_path();
        if !path.exists() {
            return Ok(None);
        }
        reject_link_or_reparse(&path, "bootstrap config")?;
        let config: BootstrapConfig = serde_json::from_slice(&fs::read(path)?)?;
        if config.schema_version != 1 || config.workspace_path.trim().is_empty() {
            return Err(BackendError::WorkspaceUnavailable(
                "The bootstrap configuration is invalid.".to_string(),
            ));
        }
        Ok(Some(config))
    }

    pub fn save(&self, workspace: &Workspace) -> Result<()> {
        fs::create_dir_all(&self.config_dir)?;
        reject_link_or_reparse(&self.config_dir, "application config directory")?;
        let config = BootstrapConfig {
            schema_version: 1,
            workspace_path: path_to_string(workspace.root())?,
        };
        replace_json_atomically(&self.config_path(), &config)
    }
}

pub fn validate_relative_path(value: &str) -> Result<PathBuf> {
    if value.is_empty() || value.contains('\0') || value.contains('\\') {
        return Err(BackendError::Security(
            "Relative path is empty, invalid, or does not use forward slashes.".to_string(),
        ));
    }

    let path = Path::new(value);
    if path.is_absolute() {
        return Err(BackendError::Security(
            "Absolute paths are not allowed inside a pack.".to_string(),
        ));
    }

    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let text = part.to_string_lossy();
                if text.is_empty() || text.contains(':') {
                    return Err(BackendError::Security(
                        "Pack paths contain an invalid component.".to_string(),
                    ));
                }
                clean.push(part);
            }
            _ => {
                return Err(BackendError::Security(
                    "Pack paths cannot contain '.', '..', roots, or prefixes.".to_string(),
                ));
            }
        }
    }

    if clean.as_os_str().is_empty() {
        return Err(BackendError::Security(
            "Relative path is empty.".to_string(),
        ));
    }
    Ok(clean)
}

pub fn ensure_existing_within(root: &Path, candidate: &Path) -> Result<PathBuf> {
    let canonical_root = fs::canonicalize(root)?;
    let canonical_candidate = fs::canonicalize(candidate)?;
    if !canonical_candidate.starts_with(&canonical_root) {
        return Err(BackendError::Security(
            "Resolved path escapes the permitted root.".to_string(),
        ));
    }
    Ok(canonical_candidate)
}

pub fn reject_link_or_reparse(path: &Path, label: &str) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || is_reparse_point(&metadata) {
        return Err(BackendError::Security(format!(
            "Symbolic links or reparse points are not allowed for {label}."
        )));
    }
    Ok(())
}

#[cfg(windows)]
fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_reparse_point(_metadata: &fs::Metadata) -> bool {
    false
}

pub fn path_to_forward_slashes(path: &Path) -> Result<String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            _ => {
                return Err(BackendError::Security(
                    "Only normalized relative paths may be serialized.".to_string(),
                ));
            }
        }
    }
    Ok(parts.join("/"))
}

fn validate_workspace_metadata(metadata: &WorkspaceMetadata) -> Result<()> {
    if metadata.schema_version != WORKSPACE_SCHEMA_VERSION {
        return Err(BackendError::WorkspaceUnavailable(format!(
            "Workspace schema {} is not supported.",
            metadata.schema_version
        )));
    }
    if metadata.workspace_id.trim().is_empty()
        || metadata.database_file != WORKSPACE_DATABASE_FILE
    {
        return Err(BackendError::WorkspaceUnavailable(
            "workspace.json contains unsupported values.".to_string(),
        ));
    }
    Ok(())
}

fn verify_writable(root: &Path) -> Result<()> {
    let probe = root.join(format!(".write-probe-{}", Uuid::new_v4()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)?;
    file.write_all(b"ielts-workbench")?;
    file.sync_all()?;
    drop(file);
    fs::remove_file(probe)?;
    Ok(())
}

fn write_new_json_atomically<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    let parent = path.parent().ok_or_else(|| {
        BackendError::InvalidInput("JSON target has no parent directory.".to_string())
    })?;
    let temporary = parent.join(format!(".new-{}.tmp", Uuid::new_v4()));
    write_synced_json(&temporary, value)?;
    place_new_file(&temporary, path)
}

fn replace_json_atomically<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    let parent = path.parent().ok_or_else(|| {
        BackendError::InvalidInput("JSON target has no parent directory.".to_string())
    })?;
    let temporary = parent.join(format!(".replace-{}.tmp", Uuid::new_v4()));
    write_synced_json(&temporary, value)?;

    if !path.exists() {
        return place_new_file(&temporary, path);
    }

    reject_link_or_reparse(path, "bootstrap config")?;
    let backup = parent.join(format!(".backup-{}.tmp", Uuid::new_v4()));
    match fs::rename(path, &backup) {
        Ok(()) => {
            if let Err(error) = place_new_file(&temporary, path) {
                let _ = place_new_file(&backup, path);
                return Err(error);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::CrossesDevices => {
            copy_new_file_synced(path, &backup)?;
            if let Err(error) = overwrite_file_synced(&temporary, path) {
                let _ = overwrite_file_synced(&backup, path);
                let _ = fs::remove_file(&temporary);
                let _ = fs::remove_file(&backup);
                return Err(error.into());
            }
            fs::remove_file(&temporary)?;
        }
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            return Err(error.into());
        }
    }
    fs::remove_file(backup)?;
    Ok(())
}

fn place_new_file(temporary: &Path, path: &Path) -> Result<()> {
    match fs::rename(temporary, path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::CrossesDevices => {
            if let Err(copy_error) = copy_new_file_synced(temporary, path) {
                let _ = fs::remove_file(temporary);
                let _ = fs::remove_file(path);
                return Err(copy_error.into());
            }
            fs::remove_file(temporary)?;
            Ok(())
        }
        Err(error) => {
            let _ = fs::remove_file(temporary);
            Err(error.into())
        }
    }
}

fn copy_new_file_synced(source: &Path, destination: &Path) -> io::Result<()> {
    let mut source_file = fs::File::open(source)?;
    let mut destination_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    if let Err(error) = io::copy(&mut source_file, &mut destination_file) {
        drop(destination_file);
        let _ = fs::remove_file(destination);
        return Err(error);
    }
    destination_file.sync_all()
}

fn overwrite_file_synced(source: &Path, destination: &Path) -> io::Result<()> {
    let mut source_file = fs::File::open(source)?;
    let mut destination_file = OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(destination)?;
    io::copy(&mut source_file, &mut destination_file)?;
    destination_file.sync_all()
}

fn write_synced_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(value)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(&bytes)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    Ok(())
}

fn path_to_string(path: &Path) -> Result<String> {
    path.to_str()
        .map(ToOwned::to_owned)
        .ok_or_else(|| BackendError::InvalidInput("Path is not valid Unicode.".to_string()))
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        assert!(validate_relative_path("../outside.txt").is_err());
        assert!(validate_relative_path("./media/audio.wav").is_err());
        assert!(validate_relative_path("C:\\outside.txt").is_err());
        assert!(validate_relative_path("media/file.txt:stream").is_err());
        assert_eq!(
            validate_relative_path("media/audio/demo.wav").unwrap(),
            PathBuf::from("media/audio/demo.wav")
        );
    }

    #[test]
    fn containment_uses_canonical_paths() {
        let temp = tempfile::tempdir().unwrap();
        let inside = temp.path().join("inside");
        fs::create_dir(&inside).unwrap();
        assert_eq!(
            ensure_existing_within(temp.path(), &inside).unwrap(),
            fs::canonicalize(&inside).unwrap()
        );

        let outside = tempfile::tempdir().unwrap();
        assert!(ensure_existing_within(temp.path(), outside.path()).is_err());
    }

    #[test]
    fn initializes_required_workspace_entries() {
        let temp = tempfile::tempdir().unwrap();
        let selected = temp.path().join("learning-data");
        let workspace = Workspace::initialize(selected.to_str().unwrap()).unwrap();
        assert!(workspace.root().join("workspace.json").is_file());
        for directory in WORKSPACE_DIRECTORIES {
            assert!(workspace.root().join(directory).is_dir());
        }
        assert_eq!(workspace.metadata.schema_version, 1);
        assert_eq!(workspace.metadata.database_file, WORKSPACE_DATABASE_FILE);
    }

    #[test]
    fn bootstrap_contains_only_small_workspace_pointer() {
        let temp = tempfile::tempdir().unwrap();
        let config_dir = temp.path().join("config");
        let workspace_path = temp.path().join("workspace");
        let workspace = Workspace::initialize(workspace_path.to_str().unwrap()).unwrap();
        let store = BootstrapStore::new(config_dir.clone());
        store.save(&workspace).unwrap();
        let loaded = store.load().unwrap().unwrap();
        assert_eq!(loaded.schema_version, 1);
        assert_eq!(loaded.workspace_path, workspace.root().to_str().unwrap());
        let json: serde_json::Value =
            serde_json::from_slice(&fs::read(config_dir.join("bootstrap.json")).unwrap()).unwrap();
        assert_eq!(json.as_object().unwrap().len(), 2);

        let replacement_path = temp.path().join("replacement-workspace");
        let replacement = Workspace::initialize(replacement_path.to_str().unwrap()).unwrap();
        store.save(&replacement).unwrap();
        assert_eq!(
            store.load().unwrap().unwrap().workspace_path,
            replacement.root().to_str().unwrap()
        );
        assert!(fs::read_dir(config_dir)
            .unwrap()
            .all(|entry| entry.unwrap().file_name() == "bootstrap.json"));
    }
}
