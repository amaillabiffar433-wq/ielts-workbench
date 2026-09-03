use serde::Serialize;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, BackendError>;

#[derive(Debug, Error)]
pub enum BackendError {
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("workspace has not been selected")]
    WorkspaceNotConfigured,
    #[error("workspace is unavailable: {0}")]
    WorkspaceUnavailable(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("security check failed: {0}")]
    Security(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
    #[error(transparent)]
    WalkDir(#[from] walkdir::Error),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl From<BackendError> for CommandError {
    fn from(error: BackendError) -> Self {
        let (code, message) = match error {
            BackendError::InvalidInput(message) => ("INVALID_INPUT", message),
            BackendError::WorkspaceNotConfigured => (
                "WORKSPACE_NOT_CONFIGURED",
                "Choose a learning workspace before using local data.".to_string(),
            ),
            BackendError::WorkspaceUnavailable(message) => ("WORKSPACE_UNAVAILABLE", message),
            BackendError::NotFound(message) => ("NOT_FOUND", message),
            BackendError::Conflict(message) => ("CONFLICT", message),
            BackendError::Security(message) => ("SECURITY_REJECTED", message),
            BackendError::Io(_) => (
                "IO_ERROR",
                "A local file operation failed. Check access and available disk space.".to_string(),
            ),
            BackendError::Json(_) => (
                "INVALID_JSON",
                "A local JSON file or stored value is invalid.".to_string(),
            ),
            BackendError::Database(_) => (
                "DATABASE_ERROR",
                "The workspace database operation failed.".to_string(),
            ),
            BackendError::WalkDir(_) => (
                "FILE_SCAN_ERROR",
                "The selected folder could not be scanned safely.".to_string(),
            ),
        };
        Self { code, message }
    }
}

