use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BootstrapConfig {
    pub schema_version: u32,
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceMetadata {
    pub schema_version: u32,
    pub workspace_id: String,
    pub created_at: String,
    pub database_file: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub workspace_path: String,
    pub workspace_id: String,
    pub created_at: String,
    pub database_file: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapState {
    pub configured: bool,
    pub available: bool,
    pub workspace_path: Option<String>,
    pub workspace_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackManifest {
    pub schema_version: u32,
    pub id: String,
    pub title: String,
    pub source_label: String,
    pub edition: Option<String>,
    pub language: String,
    pub modules: Vec<String>,
    pub created_at: String,
    pub attribution: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub code: String,
    pub message: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackValidationReport {
    pub valid: bool,
    pub errors: Vec<ValidationIssue>,
    pub warnings: Vec<ValidationIssue>,
    pub manifest: Option<PackManifest>,
    pub media_references: Vec<String>,
    pub source_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPackRecord {
    pub id: String,
    pub title: String,
    pub source_label: String,
    pub edition: Option<String>,
    pub schema_version: u32,
    pub install_path: String,
    pub manifest: Value,
    pub source_hash: String,
    pub installed_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPack {
    pub manifest: Value,
    pub modules: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSessionInput {
    pub id: Option<String>,
    pub pack_id: Option<String>,
    pub test_id: Option<String>,
    pub module: Option<String>,
    #[serde(default = "default_study_mode")]
    pub mode: String,
}

fn default_study_mode() -> String {
    "study".to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeSessionRecord {
    pub id: String,
    pub pack_id: Option<String>,
    pub test_id: Option<String>,
    pub module: Option<String>,
    pub mode: String,
    pub status: String,
    pub started_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub elapsed_seconds: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveAnswerInput {
    pub session_id: String,
    pub question_id: String,
    #[serde(alias = "value")]
    pub answer: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerRecord {
    pub session_id: String,
    pub question_id: String,
    pub answer: Value,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextAnchor {
    pub block_id: String,
    pub start_offset: u32,
    pub end_offset: u32,
    pub quote: String,
    #[serde(default)]
    pub prefix: String,
    #[serde(default)]
    pub suffix: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveAnnotationInput {
    pub id: Option<String>,
    pub session_id: String,
    pub kind: String,
    pub color: Option<String>,
    pub anchor: TextAnchor,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationRecord {
    pub id: String,
    pub session_id: String,
    pub kind: String,
    pub color: Option<String>,
    pub anchor: TextAnchor,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub session_id: String,
    pub session: Option<PracticeSessionRecord>,
    pub answers: Vec<AnswerRecord>,
    pub annotations: Vec<AnnotationRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingRecord {
    pub key: String,
    pub value: Value,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveWritingDraftInput {
    pub session_id: String,
    pub task_id: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingDraftRecord {
    pub session_id: String,
    pub task_id: String,
    pub content: String,
    pub word_count: u32,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateWritingVersionInput {
    pub id: Option<String>,
    pub session_id: String,
    pub task_id: String,
    #[serde(alias = "versionType")]
    pub kind: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingVersionRecord {
    pub id: String,
    pub session_id: String,
    pub task_id: String,
    pub kind: String,
    pub content: String,
    pub word_count: u32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackMediaPayload {
    pub relative_path: String,
    pub mime_type: String,
    pub byte_length: u64,
    pub base64: String,
}
