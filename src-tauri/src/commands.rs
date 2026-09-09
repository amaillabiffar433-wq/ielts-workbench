use std::{fs, path::Path};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::Connection;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    backend::AppBackend,
    error::{BackendError, CommandError, Result as BackendResult},
    models::{
        AnnotationRecord, AnswerRecord, BootstrapState, CreateSessionInput,
        CreateWritingVersionInput, InstalledPackRecord, LoadedPack, PackMediaPayload,
        PackValidationReport, PracticeSessionRecord, SaveAnnotationInput, SaveAnswerInput,
        SaveWritingDraftInput, SelectedPdfPayload, SessionSnapshot, SettingRecord, WorkspaceInfo,
        WritingDraftRecord, WritingVersionRecord,
    },
    packs,
    storage::repositories,
};

type CommandResult<T> = std::result::Result<T, CommandError>;

const MAX_SELECTED_PDF_BYTES: u64 = 64 * 1024 * 1024;

#[tauri::command]
pub async fn select_pdf_file(app: AppHandle) -> CommandResult<Option<SelectedPdfPayload>> {
    let selected = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_title("选择要导入的 Reading PDF")
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|_| {
        CommandError::from(BackendError::InvalidInput(
            "The selected PDF is not a readable local file path.".to_string(),
        ))
    })?;
    read_selected_pdf(&path).map(Some).map_err(Into::into)
}

fn read_selected_pdf(path: &Path) -> BackendResult<SelectedPdfPayload> {
    crate::workspace::reject_link_or_reparse(path, "selected PDF")?;
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() {
        return Err(BackendError::InvalidInput(
            "The selected PDF path is not a regular file.".to_string(),
        ));
    }
    let has_pdf_extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"));
    if !has_pdf_extension {
        return Err(BackendError::InvalidInput(
            "Choose a file with the .pdf extension.".to_string(),
        ));
    }
    if metadata.len() == 0 {
        return Err(BackendError::InvalidInput(
            "The selected PDF is empty.".to_string(),
        ));
    }
    if metadata.len() > MAX_SELECTED_PDF_BYTES {
        return Err(BackendError::InvalidInput(format!(
            "The selected PDF exceeds the {} MiB native import limit.",
            MAX_SELECTED_PDF_BYTES / 1024 / 1024
        )));
    }

    let bytes = fs::read(path)?;
    let header_end = bytes.len().min(1024);
    if !bytes[..header_end]
        .windows(b"%PDF-".len())
        .any(|window| window == b"%PDF-")
    {
        return Err(BackendError::InvalidInput(
            "The selected file does not contain a PDF header.".to_string(),
        ));
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            BackendError::InvalidInput("The PDF file name is not valid UTF-8.".to_string())
        })?
        .to_string();

    Ok(SelectedPdfPayload {
        file_name,
        mime_type: "application/pdf".to_string(),
        byte_length: bytes.len() as u64,
        base64: STANDARD.encode(bytes),
    })
}

#[tauri::command]
pub fn get_bootstrap_state(state: State<'_, AppBackend>) -> BootstrapState {
    state.bootstrap_state()
}

#[tauri::command]
pub fn initialize_workspace(
    state: State<'_, AppBackend>,
    path: String,
) -> CommandResult<WorkspaceInfo> {
    state.initialize_workspace(&path).map_err(Into::into)
}

#[tauri::command]
pub fn list_installed_packs(
    state: State<'_, AppBackend>,
) -> CommandResult<Vec<InstalledPackRecord>> {
    let (_, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    repositories::list_installed_packs(&connection).map_err(Into::into)
}

#[tauri::command]
pub fn load_pack(
    state: State<'_, AppBackend>,
    pack_id: String,
) -> CommandResult<Option<LoadedPack>> {
    let (workspace, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    packs::load_pack(&workspace, &connection, &pack_id).map_err(Into::into)
}

#[tauri::command]
pub fn create_session(
    state: State<'_, AppBackend>,
    input: CreateSessionInput,
) -> CommandResult<PracticeSessionRecord> {
    let (workspace, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    if let (Some(pack_id), Some(test_id), Some(module_type)) = (
        input.pack_id.as_deref(),
        input.test_id.as_deref(),
        input.module.as_deref(),
    ) {
        packs::ensure_installed_session_target(
            &workspace,
            &connection,
            pack_id,
            test_id,
            module_type,
        )
        .map_err(CommandError::from)?;
    }
    repositories::create_session(&connection, input).map_err(Into::into)
}

#[tauri::command]
pub fn load_session(
    state: State<'_, AppBackend>,
    session_id: String,
) -> CommandResult<Option<SessionSnapshot>> {
    let (_, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    repositories::load_session(&connection, &session_id).map_err(Into::into)
}

#[tauri::command]
pub fn list_recent_sessions(
    state: State<'_, AppBackend>,
) -> CommandResult<Vec<PracticeSessionRecord>> {
    let (_, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    repositories::list_recent_sessions(&connection).map_err(Into::into)
}

#[tauri::command]
pub fn submit_session(
    state: State<'_, AppBackend>,
    session_id: String,
) -> CommandResult<SessionSnapshot> {
    let (_, mut connection) = state.workspace_and_database().map_err(CommandError::from)?;
    repositories::submit_session(&mut connection, &session_id).map_err(Into::into)
}

#[tauri::command]
pub fn update_session_elapsed(
    state: State<'_, AppBackend>,
    session_id: String,
    elapsed_seconds: u64,
) -> CommandResult<PracticeSessionRecord> {
    let (_, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    repositories::update_session_elapsed(&connection, &session_id, elapsed_seconds).map_err(Into::into)
}

#[tauri::command]
pub fn create_workspace_backup(
    state: State<'_, AppBackend>,
    destination_parent: String,
) -> CommandResult<crate::models::WorkspaceBackupSummary> {
    state.create_workspace_backup(&destination_parent).map_err(Into::into)
}

#[tauri::command]
pub fn restore_workspace_backup(
    state: State<'_, AppBackend>,
    backup_path: String,
    destination_parent: String,
) -> CommandResult<WorkspaceInfo> {
    state.restore_workspace_backup(&backup_path, &destination_parent).map_err(Into::into)
}

#[tauri::command]
pub fn save_answer(
    state: State<'_, AppBackend>,
    input: SaveAnswerInput,
) -> CommandResult<AnswerRecord> {
    let (workspace, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    let (pack_id, test_id, module_type) =
        session_target(&connection, &input.session_id).map_err(CommandError::from)?;
    packs::ensure_installed_question_id(
        &workspace,
        &connection,
        &pack_id,
        &test_id,
        &module_type,
        &input.question_id,
    )
    .map_err(CommandError::from)?;
    repositories::save_answer(&connection, input).map_err(Into::into)
}

#[tauri::command]
pub fn save_annotation(
    state: State<'_, AppBackend>,
    input: SaveAnnotationInput,
) -> CommandResult<AnnotationRecord> {
    let (workspace, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    let (pack_id, test_id, module_type) =
        session_target(&connection, &input.session_id).map_err(CommandError::from)?;
    packs::ensure_installed_content_block_id(
        &workspace,
        &connection,
        &pack_id,
        &test_id,
        &module_type,
        &input.anchor.block_id,
    )
    .map_err(CommandError::from)?;
    repositories::save_annotation(&connection, input).map_err(Into::into)
}

#[tauri::command]
pub fn delete_annotation(
    state: State<'_, AppBackend>,
    annotation_id: String,
) -> CommandResult<bool> {
    let (_, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    repositories::delete_annotation(&connection, &annotation_id).map_err(Into::into)
}

#[tauri::command]
pub fn get_setting(
    state: State<'_, AppBackend>,
    key: String,
) -> CommandResult<Option<SettingRecord>> {
    let (_, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    repositories::get_setting(&connection, &key).map_err(Into::into)
}

#[tauri::command]
pub fn set_setting(
    state: State<'_, AppBackend>,
    key: String,
    value: Value,
) -> CommandResult<SettingRecord> {
    let (_, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    repositories::set_setting(&connection, &key, value).map_err(Into::into)
}

#[tauri::command]
pub fn load_writing_draft(
    state: State<'_, AppBackend>,
    session_id: String,
    task_id: String,
) -> CommandResult<Option<WritingDraftRecord>> {
    let (_, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    repositories::load_writing_draft(&connection, &session_id, &task_id).map_err(Into::into)
}

#[tauri::command]
pub fn save_writing_draft(
    state: State<'_, AppBackend>,
    input: SaveWritingDraftInput,
) -> CommandResult<WritingDraftRecord> {
    let (workspace, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    let (pack_id, test_id, module_type) =
        session_target(&connection, &input.session_id).map_err(CommandError::from)?;
    packs::ensure_installed_writing_task_id(
        &workspace,
        &connection,
        &pack_id,
        &test_id,
        &module_type,
        &input.task_id,
    )
    .map_err(CommandError::from)?;
    repositories::save_writing_draft(&connection, input).map_err(Into::into)
}

#[tauri::command]
pub fn create_writing_version(
    state: State<'_, AppBackend>,
    input: CreateWritingVersionInput,
) -> CommandResult<WritingVersionRecord> {
    let (workspace, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    let (pack_id, test_id, module_type) =
        session_target(&connection, &input.session_id).map_err(CommandError::from)?;
    packs::ensure_installed_writing_task_id(
        &workspace,
        &connection,
        &pack_id,
        &test_id,
        &module_type,
        &input.task_id,
    )
    .map_err(CommandError::from)?;
    repositories::create_writing_version(&connection, input).map_err(Into::into)
}

#[tauri::command]
pub fn list_writing_versions(
    state: State<'_, AppBackend>,
    session_id: String,
    task_id: String,
) -> CommandResult<Vec<WritingVersionRecord>> {
    let (_, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    repositories::list_writing_versions(&connection, &session_id, &task_id).map_err(Into::into)
}

#[tauri::command]
pub fn validate_pack_folder(path: String) -> PackValidationReport {
    packs::validate_pack_folder(&path)
}

#[tauri::command]
pub fn install_pack(
    state: State<'_, AppBackend>,
    path: String,
) -> CommandResult<InstalledPackRecord> {
    let _guard = state.lock_mutation().map_err(CommandError::from)?;
    let (workspace, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    packs::install_pack(&workspace, &connection, &path).map_err(Into::into)
}

#[tauri::command]
pub fn install_generated_pack(
    state: State<'_, AppBackend>,
    pack: Value,
) -> CommandResult<InstalledPackRecord> {
    let _guard = state.lock_mutation().map_err(CommandError::from)?;
    let (workspace, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    packs::install_generated_pack(&workspace, &connection, pack).map_err(Into::into)
}

#[tauri::command]
pub fn read_pack_media(
    state: State<'_, AppBackend>,
    pack_id: String,
    relative_path: String,
) -> CommandResult<PackMediaPayload> {
    let (workspace, connection) = state.workspace_and_database().map_err(CommandError::from)?;
    packs::read_pack_media(&workspace, &connection, &pack_id, &relative_path)
        .map_err(Into::into)
}

fn session_target(
    connection: &Connection,
    session_id: &str,
) -> BackendResult<(String, String, String)> {
    let snapshot = repositories::load_session(connection, session_id)?.ok_or_else(|| {
        BackendError::NotFound("The requested practice session does not exist.".to_string())
    })?;
    let session = snapshot.session.ok_or_else(|| {
        BackendError::NotFound("The requested practice session does not exist.".to_string())
    })?;
    match (session.pack_id, session.test_id, session.module) {
        (Some(pack_id), Some(test_id), Some(module_type)) => {
            Ok((pack_id, test_id, module_type))
        }
        _ => Err(BackendError::Conflict(
            "The practice session is not bound to an installed pack target.".to_string(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use tempfile::tempdir;

    use super::read_selected_pdf;

    #[test]
    fn reads_only_a_non_empty_pdf_file() {
        let directory = tempdir().expect("temp dir");
        let path = directory.path().join("original.pdf");
        let contents = b"%PDF-1.7\noriginal fixture\n%%EOF\n";
        std::fs::write(&path, contents).expect("write fixture");

        let payload = read_selected_pdf(&path).expect("read selected PDF");

        assert_eq!(payload.file_name, "original.pdf");
        assert_eq!(payload.mime_type, "application/pdf");
        assert_eq!(payload.byte_length, contents.len() as u64);
        assert_eq!(STANDARD.decode(payload.base64).expect("base64"), contents);
    }

    #[test]
    fn rejects_a_pdf_extension_without_a_pdf_header() {
        let directory = tempdir().expect("temp dir");
        let path = directory.path().join("not-really.pdf");
        std::fs::write(&path, b"plain text").expect("write fixture");

        let error = read_selected_pdf(&path).expect_err("invalid PDF should fail");

        assert!(error.to_string().contains("does not contain a PDF header"));
    }
}
