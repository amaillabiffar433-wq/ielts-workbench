use std::{path::PathBuf, sync::Mutex};

use rusqlite::Connection;

use crate::{
    error::{BackendError, Result},
    models::{BootstrapState, WorkspaceBackupSummary, WorkspaceInfo},
    backup, packs, storage,
    workspace::{BootstrapStore, Workspace},
};

pub struct AppBackend {
    bootstrap: BootstrapStore,
    mutation_lock: Mutex<()>,
}

impl AppBackend {
    pub fn new(config_dir: PathBuf) -> Self {
        Self {
            bootstrap: BootstrapStore::new(config_dir),
            mutation_lock: Mutex::new(()),
        }
    }

    pub fn bootstrap_state(&self) -> BootstrapState {
        match self.bootstrap.load() {
            Ok(None) => BootstrapState {
                configured: false,
                available: false,
                workspace_path: None,
                workspace_id: None,
                error: None,
            },
            Ok(Some(config)) => match Workspace::open(&config.workspace_path) {
                Ok(workspace) => match workspace.info() {
                    Ok(info) => BootstrapState {
                        configured: true,
                        available: true,
                        workspace_path: Some(info.workspace_path),
                        workspace_id: Some(info.workspace_id),
                        error: None,
                    },
                    Err(_) => unavailable_state(Some(config.workspace_path)),
                },
                Err(_) => unavailable_state(Some(config.workspace_path)),
            },
            Err(_) if self.bootstrap.exists() => unavailable_state(None),
            Err(_) => BootstrapState {
                configured: false,
                available: false,
                workspace_path: None,
                workspace_id: None,
                error: Some("The local bootstrap configuration could not be read.".to_string()),
            },
        }
    }

    pub fn initialize_workspace(&self, path: &str) -> Result<WorkspaceInfo> {
        let _guard = self
            .mutation_lock
            .lock()
            .map_err(|_| BackendError::Conflict("Workspace initialization is busy.".to_string()))?;
        let workspace = Workspace::initialize(path)?;
        storage::initialize_database(&workspace.database_path())?;
        let connection = storage::open_database(&workspace.database_path())?;
        packs::ensure_embedded_demo_pack(&workspace, &connection)?;
        self.bootstrap.save(&workspace)?;
        workspace.info()
    }

    pub fn workspace_and_database(&self) -> Result<(Workspace, Connection)> {
        let config = self
            .bootstrap
            .load()?
            .ok_or(BackendError::WorkspaceNotConfigured)?;
        let workspace = Workspace::open(&config.workspace_path)?;
        let connection = storage::open_database(&workspace.database_path())?;
        Ok((workspace, connection))
    }

    pub fn create_workspace_backup(&self, destination_parent: &str) -> Result<WorkspaceBackupSummary> {
        let _guard = self.lock_mutation()?;
        let (workspace, connection) = self.workspace_and_database()?;
        backup::create_workspace_backup(&workspace, &connection, destination_parent)
    }

    pub fn restore_workspace_backup(&self, backup_path: &str, destination_parent: &str) -> Result<WorkspaceInfo> {
        let _guard = self.lock_mutation()?;
        let workspace = backup::restore_workspace_backup(backup_path, destination_parent)?;
        self.bootstrap.save(&workspace)?;
        workspace.info()
    }

    pub fn lock_mutation(&self) -> Result<std::sync::MutexGuard<'_, ()>> {
        self.mutation_lock
            .lock()
            .map_err(|_| BackendError::Conflict("Another workspace change is in progress.".to_string()))
    }
}

fn unavailable_state(workspace_path: Option<String>) -> BootstrapState {
    BootstrapState {
        configured: true,
        available: false,
        workspace_path,
        workspace_id: None,
        error: Some(
            "The previously selected workspace is unavailable. Choose it again or select another folder."
                .to_string(),
        ),
    }
}
