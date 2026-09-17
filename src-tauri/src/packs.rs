use std::{
    collections::{BTreeSet, HashMap, HashSet},
    fs::{self, File},
    io::{BufReader, Read, Write},
    path::{Component, Path, PathBuf},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    error::{BackendError, Result},
    models::{
        InstalledPackRecord, LoadedPack, PackManifest, PackMediaPayload, PackValidationReport,
        ValidationIssue,
    },
    storage::repositories,
    workspace::{
        ensure_existing_within, path_to_forward_slashes, reject_link_or_reparse,
        validate_relative_path, Workspace,
    },
};

const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_MODULE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_GENERATED_PACK_JSON_BYTES: usize = 64 * 1024 * 1024;
const MAX_MEDIA_READ_BYTES: u64 = 128 * 1024 * 1024;
const MAX_PACK_FILE_BYTES: u64 = MAX_MEDIA_READ_BYTES;
const MAX_PACK_FILES: usize = 50_000;
const MAX_PACK_BYTES: u64 = 16 * 1024 * 1024 * 1024;
const MAX_PACK_PATH_CHARS: usize = 512;
const MAX_SAFE_JSON_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_QUESTION_CONTEXT_BLOCKS: usize = 32;
const MAX_QUESTION_CONTEXT_LIST_ITEMS: usize = 50;
const MAX_QUESTION_CONTEXT_TABLE_ROWS: usize = 30;
const MAX_QUESTION_CONTEXT_TABLE_COLUMNS: usize = 12;
const MAX_QUESTION_CONTEXT_TEXT_LENGTH: usize = 4_000;
const MAX_QUESTION_CONTEXT_NODES: usize = 512;

const EMBEDDED_DEMO_FILES: &[(&str, &[u8])] = &[
    (
        "manifest.json",
        include_bytes!("../../samples/original-demo-pack/manifest.json"),
    ),
    (
        "modules/reading.json",
        include_bytes!("../../samples/original-demo-pack/modules/reading.json"),
    ),
    (
        "modules/listening.json",
        include_bytes!("../../samples/original-demo-pack/modules/listening.json"),
    ),
    (
        "modules/writing.json",
        include_bytes!("../../samples/original-demo-pack/modules/writing.json"),
    ),
    (
        "media/audio/original-demo-silence.wav",
        include_bytes!("../../samples/original-demo-pack/media/audio/original-demo-silence.wav"),
    ),
    (
        "media/audio/original-demo-tones.wav",
        include_bytes!("../../samples/original-demo-pack/media/audio/original-demo-tones.wav"),
    ),
    (
        "media/images/original-workshop-attendance.png",
        include_bytes!("../../samples/original-demo-pack/media/images/original-workshop-attendance.png"),
    ),
];

struct ValidatedPack {
    source_root: PathBuf,
    manifest: PackManifest,
    manifest_json: Value,
    source_hash: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ModuleKind {
    Reading,
    Listening,
    Writing,
}

impl ModuleKind {
    const ALL: [Self; 3] = [Self::Reading, Self::Listening, Self::Writing];

    fn as_str(self) -> &'static str {
        match self {
            Self::Reading => "reading",
            Self::Listening => "listening",
            Self::Writing => "writing",
        }
    }

    fn relative_path(self) -> String {
        format!("modules/{}.json", self.as_str())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackManifestV1 {
    schema_version: u32,
    id: String,
    title: String,
    source_label: String,
    edition: Option<String>,
    language: String,
    modules: Vec<ModuleKind>,
    created_at: String,
    attribution: Option<String>,
    tests: Vec<PackTestDescriptorV1>,
    #[serde(default)]
    media_assets: Vec<MediaAssetV1>,
    cover_image_asset_id: Option<String>,
    import_metadata: Option<PdfImportMetadataV1>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SourcePageRangeV1 {
    start: u32,
    end: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PdfImportMetadataV1 {
    source_file_name: String,
    source_file_size: u64,
    source_sha256: Option<String>,
    source_fingerprint: String,
    book_title: String,
    test_number: String,
    module: String,
    passage_number: u32,
    passage_page_range: SourcePageRangeV1,
    question_page_range: SourcePageRangeV1,
    answer_key_page_range: Option<SourcePageRangeV1>,
    imported_at: String,
    extraction_mode: String,
    parser_version: String,
    page_number_base: u32,
    needs_review: bool,
    dedupe_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackTestDescriptorV1 {
    id: String,
    title: String,
    module_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MediaKind {
    Audio,
    Image,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum MediaAssetV1 {
    #[serde(rename = "audio")]
    Audio(AudioMediaAssetV1),
    #[serde(rename = "image")]
    Image(ImageMediaAssetV1),
}

impl MediaAssetV1 {
    fn id(&self) -> &str {
        match self {
            Self::Audio(asset) => &asset.id,
            Self::Image(asset) => &asset.id,
        }
    }

    fn kind(&self) -> MediaKind {
        match self {
            Self::Audio(_) => MediaKind::Audio,
            Self::Image(_) => MediaKind::Image,
        }
    }

    fn relative_path(&self) -> &str {
        match self {
            Self::Audio(asset) => &asset.relative_path,
            Self::Image(asset) => &asset.relative_path,
        }
    }

    fn mime_type(&self) -> &str {
        match self {
            Self::Audio(asset) => &asset.mime_type,
            Self::Image(asset) => &asset.mime_type,
        }
    }

    fn sha256(&self) -> Option<&str> {
        match self {
            Self::Audio(asset) => asset.sha256.as_deref(),
            Self::Image(asset) => asset.sha256.as_deref(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AudioMediaAssetV1 {
    id: String,
    relative_path: String,
    mime_type: String,
    duration_ms: u64,
    sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImageMediaAssetV1 {
    id: String,
    relative_path: String,
    mime_type: String,
    width: Option<u32>,
    height: Option<u32>,
    alt: String,
    sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum PackModuleV1 {
    #[serde(rename = "reading")]
    Reading(ReadingModuleV1),
    #[serde(rename = "listening")]
    Listening(ListeningModuleV1),
    #[serde(rename = "writing")]
    Writing(WritingModuleV1),
}

impl PackModuleV1 {
    fn kind(&self) -> ModuleKind {
        match self {
            Self::Reading(_) => ModuleKind::Reading,
            Self::Listening(_) => ModuleKind::Listening,
            Self::Writing(_) => ModuleKind::Writing,
        }
    }

    fn has_supported_schema_version(&self) -> bool {
        match self {
            Self::Reading(module) => matches!(module.schema_version, 1 | 2 | 3 | 4),
            Self::Listening(module) => module.schema_version == 1,
            Self::Writing(module) => module.schema_version == 1,
        }
    }

    fn id(&self) -> &str {
        match self {
            Self::Reading(module) => &module.id,
            Self::Listening(module) => &module.id,
            Self::Writing(module) => &module.id,
        }
    }

    fn test_id(&self) -> &str {
        match self {
            Self::Reading(module) => &module.test_id,
            Self::Listening(module) => &module.test_id,
            Self::Writing(module) => &module.test_id,
        }
    }

    fn title(&self) -> &str {
        match self {
            Self::Reading(module) => &module.title,
            Self::Listening(module) => &module.title,
            Self::Writing(module) => &module.title,
        }
    }

    fn contains_question_id(&self, question_id: &str) -> bool {
        match self {
            Self::Reading(module) => module.sections.iter().any(|section| {
                section.question_groups.iter().any(|group| {
                    group
                        .questions
                        .iter()
                        .any(|question| question.id() == question_id)
                })
            }),
            Self::Listening(module) => module.sections.iter().any(|section| {
                section.question_groups.iter().any(|group| {
                    group
                        .questions
                        .iter()
                        .any(|question| question.id() == question_id)
                })
            }),
            Self::Writing(_) => false,
        }
    }

    fn contains_content_block_id(&self, block_id: &str) -> bool {
        match self {
            Self::Reading(module) => module.sections.iter().any(|section| {
                section
                    .content_blocks
                    .iter()
                    .any(|block| block.id == block_id)
                    || section.question_groups.iter().any(|group| {
                        group.context_blocks.as_ref().is_some_and(|blocks| {
                            blocks.iter().any(|block| block.contains_text_block_id(block_id))
                        })
                    })
            }),
            Self::Listening(module) => module.sections.iter().any(|section| {
                section
                    .content_blocks
                    .iter()
                    .any(|block| block.id == block_id)
            }),
            Self::Writing(_) => false,
        }
    }

    fn contains_writing_task_id(&self, task_id: &str) -> bool {
        match self {
            Self::Writing(module) => module.sections.iter().any(|section| {
                section.tasks.iter().any(|task| task.id == task_id)
            }),
            Self::Reading(_) | Self::Listening(_) => false,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadingModuleV1 {
    schema_version: u32,
    id: String,
    test_id: String,
    title: String,
    sections: Vec<ReadingSectionV1>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListeningModuleV1 {
    schema_version: u32,
    id: String,
    test_id: String,
    title: String,
    audio_asset_id: String,
    sections: Vec<ListeningSectionV1>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WritingModuleV1 {
    schema_version: u32,
    id: String,
    test_id: String,
    title: String,
    sections: Vec<WritingSectionV1>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadingSectionV1 {
    id: String,
    title: String,
    content_blocks: Vec<ContentBlockV1>,
    question_groups: Vec<QuestionGroupV1>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListeningSectionV1 {
    id: String,
    title: String,
    start_ms: u64,
    end_ms: Option<u64>,
    #[serde(default)]
    content_blocks: Vec<ContentBlockV1>,
    question_groups: Vec<QuestionGroupV1>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WritingSectionV1 {
    id: String,
    title: String,
    tasks: Vec<WritingTaskV1>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ContentBlockV1 {
    id: String,
    kind: ContentBlockKind,
    text: String,
    visual: Option<VisualSource>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PdfCrop { x: f64, y: f64, width: f64, height: f64 }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum VisualKind { Snapshot, Image, Figure }

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VisualSource {
    #[serde(rename = "type")]
    kind: VisualKind,
    asset_id: String,
    source_page: Option<u32>,
    crop: Option<PdfCrop>,
    alt_text: String,
    ocr_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VisualContext {
    id: String,
    asset_id: String,
    source_page: Option<u32>,
    crop: Option<PdfCrop>,
    alt_text: String,
    ocr_text: Option<String>,
    linked_question_ids: Option<Vec<String>>,
}

fn valid_visual(asset: &str, page: Option<u32>, crop: &Option<PdfCrop>, alt: &str, ocr: &Option<String>) -> bool {
    valid_stable_id(asset) && page != Some(0) && non_blank(alt) && alt.chars().count() <= 1000
        && ocr.as_ref().is_none_or(|text| text.chars().count() <= 20000)
        && crop.as_ref().is_none_or(|c| c.x.is_finite() && c.y.is_finite() && c.width.is_finite() && c.height.is_finite()
            && c.x >= 0.0 && c.y >= 0.0 && c.width > 0.0 && c.height > 0.0
            && c.width <= 1.0 && c.height <= 1.0 && c.x + c.width <= 1.000001 && c.y + c.height <= 1.000001)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum ContentBlockKind {
    Heading,
    Paragraph,
    Instruction,
    Quote,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuestionGroupV1 {
    id: String,
    title: Option<String>,
    instructions: String,
    context_blocks: Option<Vec<QuestionContextBlockV2>>,
    questions: Vec<QuestionV1>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum QuestionContextBlockV2 {
    #[serde(rename = "paragraph")]
    Paragraph(QuestionContextParagraphV2),
    #[serde(rename = "list")]
    List(QuestionContextListV2),
    #[serde(rename = "table")]
    Table(QuestionContextTableV2),
    #[serde(rename = "completion")]
    Completion(QuestionContextCompletionV3),
    #[serde(rename = "snapshot")]
    Snapshot(VisualContext),
    #[serde(rename = "image")]
    Image(VisualContext),
    #[serde(rename = "figure")]
    Figure(VisualContext),
}

impl QuestionContextBlockV2 {
    fn visual(&self) -> Option<&VisualContext> {
        match self { Self::Snapshot(block) | Self::Image(block) | Self::Figure(block) => Some(block), _ => None }
    }
    fn id(&self) -> &str {
        match self {
            Self::Paragraph(block) => &block.id,
            Self::List(block) => &block.id,
            Self::Table(block) => &block.id,
            Self::Completion(block) => &block.id,
            Self::Snapshot(block) | Self::Image(block) | Self::Figure(block) => &block.id,
        }
    }

    fn contains_text_block_id(&self, block_id: &str) -> bool {
        match self {
            Self::Paragraph(block) => block.id == block_id,
            Self::Snapshot(block) | Self::Image(block) | Self::Figure(block) => block.id == block_id && block.ocr_text.as_ref().is_some_and(|text| !text.is_empty()),
            Self::List(block) => block.items.iter().any(|item| item.id == block_id),
            Self::Table(block) => block
                .rows
                .iter()
                .any(|row| row.cells.iter().any(|cell| cell.id == block_id)),
            Self::Completion(block) => block.parts.iter().any(|part| match part {
                QuestionContextCompletionPartV3::Text { id, .. }
                | QuestionContextCompletionPartV3::Answer { id, .. } => id == block_id,
            }),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuestionContextParagraphV2 {
    id: String,
    text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuestionContextListV2 {
    id: String,
    style: QuestionContextListStyleV2,
    items: Vec<QuestionContextListItemV2>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum QuestionContextListStyleV2 {
    Ordered,
    Unordered,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuestionContextListItemV2 {
    id: String,
    text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuestionContextTableV2 {
    id: String,
    has_header_row: bool,
    has_row_headers: bool,
    rows: Vec<QuestionContextTableRowV2>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuestionContextTableRowV2 {
    id: String,
    cells: Vec<QuestionContextTableCellV2>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuestionContextTableCellV2 {
    id: String,
    text: String,
    question_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuestionContextCompletionV3 {
    id: String,
    style: QuestionContextCompletionStyleV3,
    title: Option<String>,
    parts: Vec<QuestionContextCompletionPartV3>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum QuestionContextCompletionStyleV3 {
    Summary,
    Notes,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum QuestionContextCompletionPartV3 {
    Text { id: String, text: String },
    Answer {
        id: String,
        #[serde(rename = "questionId")]
        question_id: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum QuestionV1 {
    #[serde(rename = "single-choice")]
    SingleChoice(SingleChoiceQuestionV1),
    #[serde(rename = "true-false-not-given")]
    TrueFalseNotGiven(TrueFalseNotGivenQuestionV1),
    #[serde(rename = "yes-no-not-given")]
    YesNoNotGiven(YesNoNotGivenQuestionV3),
    #[serde(rename = "multiple-choice")]
    MultipleChoice(MultipleChoiceQuestionV3),
    #[serde(rename = "matching")]
    Matching(MatchingQuestionV3),
    #[serde(rename = "short-answer")]
    ShortAnswer(ShortAnswerQuestionV1),
    #[serde(rename = "fill-blank")]
    FillBlank(FillBlankQuestionV1),
}

impl QuestionV1 {
    fn id(&self) -> &str {
        match self {
            Self::SingleChoice(question) => &question.id,
            Self::TrueFalseNotGiven(question) => &question.id,
            Self::YesNoNotGiven(question) => &question.id,
            Self::MultipleChoice(question) => &question.id,
            Self::Matching(question) => &question.id,
            Self::ShortAnswer(question) => &question.id,
            Self::FillBlank(question) => &question.id,
        }
    }

    fn supports_table_binding(&self) -> bool {
        matches!(self, Self::ShortAnswer(_) | Self::FillBlank(_))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SingleChoiceQuestionV1 {
    id: String,
    number: Option<u32>,
    prompt: String,
    #[serde(default = "default_question_points")]
    points: u32,
    explanation: Option<String>,
    source: Option<QuestionSourceV1>,
    options: Vec<ChoiceOptionV1>,
    correct_option_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TrueFalseNotGivenQuestionV1 {
    id: String,
    number: Option<u32>,
    prompt: String,
    #[serde(default = "default_question_points")]
    points: u32,
    explanation: Option<String>,
    source: Option<QuestionSourceV1>,
    correct_answer: Option<TrueFalseNotGivenAnswer>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct YesNoNotGivenQuestionV3 {
    id: String,
    number: Option<u32>,
    prompt: String,
    #[serde(default = "default_question_points")]
    points: u32,
    explanation: Option<String>,
    source: Option<QuestionSourceV1>,
    correct_answer: Option<YesNoNotGivenAnswerV3>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum YesNoNotGivenAnswerV3 {
    Yes,
    No,
    NotGiven,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MultipleChoiceQuestionV3 {
    id: String,
    number: Option<u32>,
    prompt: String,
    #[serde(default = "default_question_points")]
    points: u32,
    explanation: Option<String>,
    source: Option<QuestionSourceV1>,
    options: Vec<ChoiceOptionV1>,
    selection_count: u32,
    #[serde(default)]
    additional_numbers: Vec<u32>,
    scoring_mode: MultipleChoiceScoringModeV3,
    #[serde(default)]
    correct_option_ids: Vec<String>,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum MultipleChoiceScoringModeV3 {
    ExactSet,
    PerCorrectOption,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MatchingQuestionV3 {
    id: String,
    number: Option<u32>,
    prompt: String,
    #[serde(default = "default_question_points")]
    points: u32,
    explanation: Option<String>,
    source: Option<QuestionSourceV1>,
    matching_kind: MatchingKindV3,
    options: Vec<ChoiceOptionV1>,
    allow_option_reuse: bool,
    correct_option_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum MatchingKindV3 {
    Headings,
    Information,
    Features,
    SentenceEndings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum TrueFalseNotGivenAnswer {
    True,
    False,
    NotGiven,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ShortAnswerQuestionV1 {
    id: String,
    number: Option<u32>,
    prompt: String,
    #[serde(default = "default_question_points")]
    points: u32,
    explanation: Option<String>,
    source: Option<QuestionSourceV1>,
    #[serde(default)]
    acceptable_answers: Vec<String>,
    max_words: Option<u32>,
    #[serde(default)]
    case_sensitive: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FillBlankQuestionV1 {
    id: String,
    number: Option<u32>,
    prompt: String,
    #[serde(default = "default_question_points")]
    points: u32,
    explanation: Option<String>,
    source: Option<QuestionSourceV1>,
    sentence: String,
    #[serde(default)]
    acceptable_answers: Vec<String>,
    max_words: Option<u32>,
    #[serde(default)]
    case_sensitive: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuestionSourceV1 {
    raw_text: String,
    source_pages: Vec<u32>,
    source_block: String,
    detected_type: DetectedQuestionTypeV1,
    needs_review: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum DetectedQuestionTypeV1 {
    SingleChoice,
    MultipleChoice,
    TrueFalseNotGiven,
    YesNoNotGiven,
    Matching,
    ShortAnswer,
    FillBlank,
    MatchingHeadings,
    Unsupported,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ChoiceOptionV1 {
    id: String,
    label: String,
    text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WritingTaskV1 {
    id: String,
    #[serde(rename = "type")]
    task_type: WritingTaskKind,
    title: String,
    prompt: String,
    minimum_words: u32,
    suggested_minutes: Option<u32>,
    image_asset_id: Option<String>,
}

#[derive(Debug, Deserialize)]
enum WritingTaskKind {
    #[serde(rename = "task-1")]
    Task1,
    #[serde(rename = "task-2")]
    Task2,
}

fn default_question_points() -> u32 {
    1
}

#[derive(Default)]
struct StableIdRegistry {
    paths: HashMap<String, String>,
}

impl StableIdRegistry {
    fn record(
        &mut self,
        id: &str,
        path: &str,
        errors: &mut Vec<ValidationIssue>,
    ) {
        if !valid_stable_id(id) {
            errors.push(issue(
                "INVALID_STABLE_ID",
                "Stable IDs must be 1-128 ASCII characters and use only letters, numbers, dot, underscore, colon, or hyphen.",
                Some(path),
            ));
        }
        if self.paths.insert(id.to_string(), path.to_string()).is_some() {
            errors.push(issue(
                "DUPLICATE_STABLE_ID",
                "Every stable ID in an IELTSPack must be globally unique.",
                Some(path),
            ));
        }
    }
}

pub fn ensure_embedded_demo_pack(
    workspace: &Workspace,
    connection: &Connection,
) -> Result<InstalledPackRecord> {
    let manifest_json: Value = serde_json::from_slice(EMBEDDED_DEMO_FILES[0].1)?;
    let manifest: PackManifest = serde_json::from_value(manifest_json.clone())?;
    if let Some(record) = repositories::get_installed_pack(connection, &manifest.id)? {
        return Ok(record);
    }

    let packs_dir = workspace.packs_dir();
    reject_link_or_reparse(&packs_dir, "workspace packs directory")?;
    ensure_existing_within(workspace.root(), &packs_dir)?;
    let destination = packs_dir.join(&manifest.id);
    if destination.exists() {
        return Err(BackendError::Conflict(
            "The original demo folder exists but is not registered; move it aside before retrying."
                .to_string(),
        ));
    }

    let temporary = packs_dir.join(format!(".install-{}", Uuid::new_v4()));
    fs::create_dir(&temporary)?;
    let stage_result = (|| -> Result<()> {
        for &(relative_path, bytes) in EMBEDDED_DEMO_FILES {
            let relative = validate_relative_path(relative_path)?;
            let target = temporary.join(relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(target, bytes)?;
        }
        Ok(())
    })();
    if let Err(error) = stage_result {
        cleanup_owned_directory(&packs_dir, &temporary);
        return Err(error);
    }
    let staged_pack = temporary
        .to_str()
        .and_then(|path| validate_internal(path).1);
    let Some(staged_pack) = staged_pack else {
        cleanup_owned_directory(&packs_dir, &temporary);
        return Err(BackendError::Conflict(
            "The embedded demo pack failed native IELTSPack validation.".to_string(),
        ));
    };
    if staged_pack.manifest.id != manifest.id {
        cleanup_owned_directory(&packs_dir, &temporary);
        return Err(BackendError::Conflict(
            "The embedded demo pack identity changed while staging.".to_string(),
        ));
    }
    let source_hash = staged_pack.source_hash;
    if let Err(error) = fs::rename(&temporary, &destination) {
        cleanup_owned_directory(&packs_dir, &temporary);
        return Err(error.into());
    }
    let install_path = format!("packs/{}", manifest.id);
    match repositories::register_installed_pack(
        connection,
        &manifest,
        &manifest_json,
        &install_path,
        &source_hash,
    ) {
        Ok(record) => Ok(record),
        Err(error) => {
            cleanup_owned_directory(&packs_dir, &destination);
            Err(error)
        }
    }
}

pub fn validate_pack_folder(path: &str) -> PackValidationReport {
    validate_internal(path).0
}

pub fn install_pack(
    workspace: &Workspace,
    connection: &Connection,
    path: &str,
) -> Result<InstalledPackRecord> {
    let (report, validated) = validate_internal(path);
    let validated = validated.ok_or_else(|| {
        let summary = report
            .errors
            .first()
            .map(|issue| issue.message.clone())
            .unwrap_or_else(|| "The pack is invalid.".to_string());
        BackendError::InvalidInput(summary)
    })?;

    if repositories::get_installed_pack(connection, &validated.manifest.id)?.is_some() {
        return Err(BackendError::Conflict(
            "A pack with this ID is already installed.".to_string(),
        ));
    }

    let packs_dir = workspace.packs_dir();
    reject_link_or_reparse(&packs_dir, "workspace packs directory")?;
    let canonical_packs_dir = ensure_existing_within(workspace.root(), &packs_dir)?;
    if canonical_packs_dir.starts_with(&validated.source_root)
        || validated.source_root.starts_with(&canonical_packs_dir)
    {
        return Err(BackendError::Security(
            "The selected source folder must be separate from the workspace packs directory."
                .to_string(),
        ));
    }
    let destination = packs_dir.join(&validated.manifest.id);
    if destination.exists() {
        return Err(BackendError::Conflict(
            "A pack folder with this ID already exists.".to_string(),
        ));
    }

    let temporary = packs_dir.join(format!(".install-{}", Uuid::new_v4()));
    fs::create_dir(&temporary)?;
    if let Err(error) = copy_validated_tree(&validated.source_root, &temporary) {
        cleanup_owned_directory(&packs_dir, &temporary);
        return Err(error);
    }

    let copied_hash = temporary
        .to_str()
        .and_then(|path| validate_internal(path).1)
        .map(|pack| pack.source_hash);
    let Some(copied_hash) = copied_hash else {
        cleanup_owned_directory(&packs_dir, &temporary);
        return Err(BackendError::Conflict(
            "The copied pack failed its final native validation.".to_string(),
        ));
    };
    if copied_hash != validated.source_hash {
        cleanup_owned_directory(&packs_dir, &temporary);
        return Err(BackendError::Conflict(
            "The source pack changed while it was being installed.".to_string(),
        ));
    }

    if let Err(error) = fs::rename(&temporary, &destination) {
        cleanup_owned_directory(&packs_dir, &temporary);
        return Err(error.into());
    }

    let relative_install_path = format!("packs/{}", validated.manifest.id);
    match repositories::register_installed_pack(
        connection,
        &validated.manifest,
        &validated.manifest_json,
        &relative_install_path,
        &validated.source_hash,
    ) {
        Ok(record) => Ok(record),
        Err(error) => {
            cleanup_owned_directory(&packs_dir, &destination);
            Err(error)
        }
    }
}

pub fn install_generated_pack(
    workspace: &Workspace, connection: &Connection, pack: Value, draft_id: Option<&str>,
) -> Result<InstalledPackRecord> {
    let object = pack.as_object().ok_or_else(|| {
        BackendError::InvalidInput("Generated IELTSPack must be a JSON object.".to_string())
    })?;
    if object.len() != 2 || !object.contains_key("manifest") || !object.contains_key("modules") {
        return Err(BackendError::InvalidInput(
            "Generated IELTSPack must contain only manifest and modules.".to_string(),
        ));
    }
    let manifest = object.get("manifest").cloned().ok_or_else(|| {
        BackendError::InvalidInput("Generated IELTSPack is missing manifest.".to_string())
    })?;
    let modules = object
        .get("modules")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            BackendError::InvalidInput("Generated IELTSPack modules must be an array.".to_string())
        })?;
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)?;
    let module_bytes = modules
        .iter()
        .map(|module| {
            let module_type = module
                .get("type")
                .and_then(Value::as_str)
                .filter(|value| matches!(*value, "reading" | "listening" | "writing"))
                .ok_or_else(|| {
                    BackendError::InvalidInput(
                        "Every generated module needs a supported type.".to_string(),
                    )
                })?;
            Ok((module_type.to_string(), serde_json::to_vec_pretty(module)?))
        })
        .collect::<Result<Vec<_>>>()?;
    let total_bytes = manifest_bytes.len()
        + module_bytes
            .iter()
            .map(|(_, bytes)| bytes.len())
            .sum::<usize>();
    if total_bytes > MAX_GENERATED_PACK_JSON_BYTES {
        return Err(BackendError::InvalidInput(
            "Generated IELTSPack JSON is larger than 64 MB.".to_string(),
        ));
    }
    let mut module_types = HashSet::new();
    if module_bytes
        .iter()
        .any(|(module_type, _)| !module_types.insert(module_type.as_str()))
    {
        return Err(BackendError::InvalidInput(
            "Generated IELTSPack module types must be unique.".to_string(),
        ));
    }

    let imports_dir = workspace.root().join("imports");
    reject_link_or_reparse(&imports_dir, "workspace imports directory")?;
    ensure_existing_within(workspace.root(), &imports_dir)?;
    let temporary = imports_dir.join(format!(".install-generated-{}", Uuid::new_v4()));
    fs::create_dir(&temporary)?;
    let result = (|| -> Result<InstalledPackRecord> {
        fs::create_dir(temporary.join("modules"))?;
        fs::write(temporary.join("manifest.json"), manifest_bytes)?;
        if let Some(assets) = manifest.get("mediaAssets").and_then(Value::as_array) {
            if !assets.is_empty() {
                let draft = draft_id.ok_or_else(|| BackendError::InvalidInput("Generated images require an owning draft.".into()))?;
                if assets.len() > 100 { return Err(BackendError::InvalidInput("Too many generated images.".into())); }
                fs::create_dir_all(temporary.join("media/images"))?;
                for asset in assets {
                    let id = asset.get("id").and_then(Value::as_str).unwrap_or("");
                    let expected = format!("media/images/{id}.png");
                    if asset.get("type").and_then(Value::as_str) != Some("image")
                        || asset.get("mimeType").and_then(Value::as_str) != Some("image/png")
                        || asset.get("relativePath").and_then(Value::as_str) != Some(expected.as_str()) {
                        return Err(BackendError::InvalidInput("Generated image path/type mismatch.".into()));
                    }
                    let bytes = crate::import_images::read(workspace, draft, id)?;
                    fs::OpenOptions::new().write(true).create_new(true).open(temporary.join(&expected))?
                        .write_all(&bytes)?;
                }
            }
        }
        for (module_type, bytes) in module_bytes {
            fs::write(
                temporary.join("modules").join(format!("{module_type}.json")),
                bytes,
            )?;
        }
        let path = temporary.to_str().ok_or_else(|| {
            BackendError::InvalidInput("Generated pack staging path is not Unicode.".to_string())
        })?;
        install_pack(workspace, connection, path)
    })();
    cleanup_owned_directory(&imports_dir, &temporary);
    result
}

pub fn load_pack(
    workspace: &Workspace,
    connection: &Connection,
    pack_id: &str,
) -> Result<Option<LoadedPack>> {
    let Some(installation) = repositories::get_installed_pack(connection, pack_id)? else {
        return Ok(None);
    };
    let pack_root = installed_pack_root(workspace, &installation)?;
    let manifest_path = pack_root.join("manifest.json");
    let manifest = read_json_file(&pack_root, &manifest_path, MAX_MANIFEST_BYTES)?;
    let parsed: PackManifest = serde_json::from_value(manifest.clone())?;
    if parsed.id != installation.id || parsed.schema_version != installation.schema_version {
        return Err(BackendError::Conflict(
            "Installed pack metadata no longer matches its registry entry.".to_string(),
        ));
    }

    let mut modules = Vec::new();
    for module in &parsed.modules {
        validate_module_name(module)?;
        let path = pack_root.join("modules").join(format!("{module}.json"));
        modules.push(read_json_file(&pack_root, &path, MAX_MODULE_BYTES)?);
    }

    Ok(Some(LoadedPack {
        manifest,
        modules,
    }))
}

/// Confirms that a session points at one canonical Test/module pair in an installed pack.
pub fn ensure_installed_session_target(
    workspace: &Workspace,
    connection: &Connection,
    pack_id: &str,
    test_id: &str,
    module_type: &str,
) -> Result<()> {
    load_installed_target_module(workspace, connection, pack_id, test_id, module_type)?;
    Ok(())
}

/// Confirms that a question belongs to the immutable module selected by a session.
pub fn ensure_installed_question_id(
    workspace: &Workspace,
    connection: &Connection,
    pack_id: &str,
    test_id: &str,
    module_type: &str,
    question_id: &str,
) -> Result<()> {
    if !valid_stable_id(question_id) {
        return Err(BackendError::InvalidInput(
            "Question ID is not a stable ID.".to_string(),
        ));
    }
    let module =
        load_installed_target_module(workspace, connection, pack_id, test_id, module_type)?;
    if !module.contains_question_id(question_id) {
        return Err(BackendError::NotFound(
            "The question does not belong to the selected session module.".to_string(),
        ));
    }
    Ok(())
}

/// Confirms that a text annotation block belongs to the immutable session module.
pub fn ensure_installed_content_block_id(
    workspace: &Workspace,
    connection: &Connection,
    pack_id: &str,
    test_id: &str,
    module_type: &str,
    block_id: &str,
) -> Result<()> {
    if !valid_stable_id(block_id) {
        return Err(BackendError::InvalidInput(
            "Content block ID is not a stable ID.".to_string(),
        ));
    }
    let module =
        load_installed_target_module(workspace, connection, pack_id, test_id, module_type)?;
    if !module.contains_content_block_id(block_id) {
        return Err(BackendError::NotFound(
            "The content block does not belong to the selected session module.".to_string(),
        ));
    }
    Ok(())
}

/// Confirms that a writing task belongs to the immutable writing module selected by a session.
pub fn ensure_installed_writing_task_id(
    workspace: &Workspace,
    connection: &Connection,
    pack_id: &str,
    test_id: &str,
    module_type: &str,
    task_id: &str,
) -> Result<()> {
    if !valid_stable_id(task_id) {
        return Err(BackendError::InvalidInput(
            "Writing task ID is not a stable ID.".to_string(),
        ));
    }
    let module =
        load_installed_target_module(workspace, connection, pack_id, test_id, module_type)?;
    if !module.contains_writing_task_id(task_id) {
        return Err(BackendError::NotFound(
            "The writing task does not belong to the selected session module.".to_string(),
        ));
    }
    Ok(())
}

pub fn read_pack_media(
    workspace: &Workspace,
    connection: &Connection,
    pack_id: &str,
    relative_path: &str,
) -> Result<PackMediaPayload> {
    let installation = repositories::get_installed_pack(connection, pack_id)?
        .ok_or_else(|| BackendError::NotFound("The requested pack is not installed.".to_string()))?;
    let pack_root = installed_pack_root(workspace, &installation)?;
    let relative = validate_media_relative_path(relative_path)?;
    let normalized = path_to_forward_slashes(&relative)?;
    let manifest_value = read_json_file(
        &pack_root,
        &pack_root.join("manifest.json"),
        MAX_MANIFEST_BYTES,
    )?;
    if json_contains_null(&manifest_value) {
        return Err(BackendError::Conflict(
            "The installed pack manifest no longer matches IELTSPack v1.".to_string(),
        ));
    }
    let manifest: PackManifestV1 = serde_json::from_value(manifest_value).map_err(|_| {
        BackendError::Conflict(
            "The installed pack manifest no longer matches IELTSPack v1.".to_string(),
        )
    })?;
    if manifest.schema_version != 1 || manifest.id != installation.id {
        return Err(BackendError::Conflict(
            "The installed pack manifest no longer matches its registry entry.".to_string(),
        ));
    }
    let asset = manifest
        .media_assets
        .iter()
        .find(|asset| asset.relative_path() == normalized.as_str())
        .ok_or_else(|| {
            BackendError::NotFound(
                "The requested path is not a declared pack media asset.".to_string(),
            )
        })?;
    let declared_mime_type = asset.mime_type().to_string();
    let declared_sha256 = asset.sha256().map(str::to_string);
    let file_path = pack_root.join(&relative);
    if !file_path.is_file() {
        return Err(BackendError::NotFound(
            "The requested pack media file does not exist.".to_string(),
        ));
    }
    reject_link_or_reparse(&file_path, "pack media")?;
    let canonical = ensure_existing_within(&pack_root, &file_path)?;
    let metadata = fs::metadata(&canonical)?;
    if metadata.len() > MAX_MEDIA_READ_BYTES {
        return Err(BackendError::InvalidInput(
            "The requested media file is too large for IPC playback.".to_string(),
        ));
    }
    if !media_signature_matches(&canonical, &declared_mime_type)? {
        return Err(BackendError::Conflict(
            "The installed media signature no longer matches its manifest.".to_string(),
        ));
    }
    if let Some(expected_hash) = declared_sha256 {
        if hash_file(&canonical)? != expected_hash {
            return Err(BackendError::Conflict(
                "The installed media checksum no longer matches its manifest.".to_string(),
            ));
        }
    }
    let bytes = fs::read(canonical)?;
    Ok(PackMediaPayload {
        relative_path: normalized,
        mime_type: declared_mime_type,
        byte_length: bytes.len() as u64,
        base64: STANDARD.encode(bytes),
    })
}

fn load_installed_target_module(
    workspace: &Workspace,
    connection: &Connection,
    pack_id: &str,
    test_id: &str,
    module_type: &str,
) -> Result<PackModuleV1> {
    if !valid_pack_id(pack_id) || !valid_stable_id(test_id) {
        return Err(BackendError::InvalidInput(
            "Pack and test IDs must be stable path-safe IDs.".to_string(),
        ));
    }
    let module_kind = module_kind_from_str(module_type)?;
    let installation = repositories::get_installed_pack(connection, pack_id)?
        .ok_or_else(|| BackendError::NotFound("The selected pack is not installed.".to_string()))?;
    let pack_root = installed_pack_root(workspace, &installation)?;
    let manifest_value = read_json_file(
        &pack_root,
        &pack_root.join("manifest.json"),
        MAX_MANIFEST_BYTES,
    )?;
    if json_contains_null(&manifest_value) {
        return Err(BackendError::Conflict(
            "The installed pack manifest no longer matches IELTSPack v1.".to_string(),
        ));
    }
    let manifest: PackManifestV1 = serde_json::from_value(manifest_value).map_err(|_| {
        BackendError::Conflict(
            "The installed pack manifest no longer matches IELTSPack v1.".to_string(),
        )
    })?;
    if manifest.schema_version != 1
        || manifest.schema_version != installation.schema_version
        || manifest.id != installation.id
        || manifest.tests.len() != 1
        || manifest.modules.iter().filter(|kind| **kind == module_kind).count() != 1
    {
        return Err(BackendError::Conflict(
            "The installed pack manifest no longer matches its registry or v1 constraints."
                .to_string(),
        ));
    }
    let test = manifest
        .tests
        .iter()
        .find(|test| test.id == test_id)
        .ok_or_else(|| {
            BackendError::NotFound("The selected test does not exist in the pack.".to_string())
        })?;
    let relative_path = module_kind.relative_path();
    let module_value = read_json_file(
        &pack_root,
        &pack_root.join(&relative_path),
        MAX_MODULE_BYTES,
    )?;
    if json_contains_null(&module_value) {
        return Err(BackendError::Conflict(
            "The installed module no longer matches IELTSPack v1.".to_string(),
        ));
    }
    let module: PackModuleV1 = serde_json::from_value(module_value).map_err(|_| {
        BackendError::Conflict("The installed module no longer matches IELTSPack v1.".to_string())
    })?;
    let mut semantic_errors = Vec::new();
    let mut stable_ids = StableIdRegistry::default();
    stable_ids.record(&manifest.id, "manifest.json#id", &mut semantic_errors);
    for (test_index, descriptor) in manifest.tests.iter().enumerate() {
        stable_ids.record(
            &descriptor.id,
            &format!("manifest.json#tests[{test_index}].id"),
            &mut semantic_errors,
        );
    }
    for (asset_index, asset) in manifest.media_assets.iter().enumerate() {
        stable_ids.record(
            asset.id(),
            &format!("manifest.json#mediaAssets[{asset_index}].id"),
            &mut semantic_errors,
        );
    }
    if manifest.cover_image_asset_id.as_ref().is_some_and(|cover_id| {
        !manifest.media_assets.iter().any(|asset| {
            asset.id() == cover_id.as_str() && asset.kind() == MediaKind::Image
        })
    }) {
        semantic_errors.push(issue(
            "INVALID_COVER_IMAGE_REFERENCE",
            "coverImageAssetId must reference a declared image media asset.",
            Some("manifest.json#coverImageAssetId"),
        ));
    }
    validate_module_schema(
        &module,
        &relative_path,
        &mut stable_ids,
        &mut semantic_errors,
    );
    if !semantic_errors.is_empty() || !selected_module_media_references_are_valid(&manifest, &module)
    {
        return Err(BackendError::Conflict(
            "The installed module no longer satisfies IELTSPack v1 identity constraints."
                .to_string(),
        ));
    }
    if module.kind() != module_kind
        || !module.has_supported_schema_version()
        || module.test_id() != test.id.as_str()
        || !test.module_ids.iter().any(|module_id| module_id == module.id())
    {
        return Err(BackendError::Conflict(
            "The installed module no longer matches its manifest test descriptor.".to_string(),
        ));
    }
    Ok(module)
}

fn selected_module_media_references_are_valid(
    manifest: &PackManifestV1,
    module: &PackModuleV1,
) -> bool {
    let media_by_id: HashMap<&str, MediaKind> = manifest
        .media_assets
        .iter()
        .map(|asset| (asset.id(), asset.kind()))
        .collect();
    match module {
        PackModuleV1::Reading(reading) => reading.sections.iter().all(|section| {
            section.content_blocks.iter().all(|block| block.visual.as_ref().is_none_or(|visual| media_by_id.get(visual.asset_id.as_str()) == Some(&MediaKind::Image)))
                && section.question_groups.iter().all(|group| group.context_blocks.iter().flatten().all(|block| block.visual().is_none_or(|visual| media_by_id.get(visual.asset_id.as_str()) == Some(&MediaKind::Image))))
        }),
        PackModuleV1::Listening(listening) => {
            media_by_id.get(listening.audio_asset_id.as_str()) == Some(&MediaKind::Audio)
        }
        PackModuleV1::Writing(writing) => writing.sections.iter().all(|section| {
            section.tasks.iter().all(|task| {
                task.image_asset_id.as_ref().map_or(true, |asset_id| {
                    media_by_id.get(asset_id.as_str()) == Some(&MediaKind::Image)
                })
            })
        }),
    }
}

fn validate_internal(path: &str) -> (PackValidationReport, Option<ValidatedPack>) {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut media_references = BTreeSet::new();

    let source = PathBuf::from(path);
    if path.trim().is_empty() || !source.is_absolute() || !source.is_dir() {
        errors.push(issue(
            "INVALID_SOURCE_FOLDER",
            "Choose an existing absolute folder containing manifest.json.",
            None,
        ));
        return (report(errors, warnings, None, media_references, None), None);
    }
    if let Err(error) = reject_link_or_reparse(&source, "pack root") {
        errors.push(issue("UNSAFE_PACK_ROOT", &error.to_string(), None));
        return (report(errors, warnings, None, media_references, None), None);
    }
    let source_root = match fs::canonicalize(&source) {
        Ok(path) => path,
        Err(_) => {
            errors.push(issue(
                "SOURCE_READ_FAILED",
                "The selected pack folder cannot be resolved.",
                None,
            ));
            return (report(errors, warnings, None, media_references, None), None);
        }
    };

    scan_tree_safety(&source_root, &mut errors, &mut warnings);

    let manifest_path = source_root.join("manifest.json");
    let manifest_json = match read_json_for_validation(
        &source_root,
        &manifest_path,
        MAX_MANIFEST_BYTES,
        "manifest.json",
        &mut errors,
    ) {
        Some(value) => value,
        None => {
            return (report(errors, warnings, None, media_references, None), None);
        }
    };
    if json_contains_null(&manifest_json) {
        errors.push(issue(
            "INVALID_MANIFEST_SCHEMA",
            "IELTSPack v1 does not accept null for missing or optional manifest fields.",
            Some("manifest.json"),
        ));
        return (report(errors, warnings, None, media_references, None), None);
    }
    let manifest_schema: PackManifestV1 = match serde_json::from_value(manifest_json.clone()) {
        Ok(manifest) => manifest,
        Err(_) => {
            errors.push(issue(
                "INVALID_MANIFEST_SCHEMA",
                "manifest.json contains missing, unknown, or incorrectly typed IELTSPack v1 fields.",
                Some("manifest.json"),
            ));
            return (report(errors, warnings, None, media_references, None), None);
        }
    };
    let manifest = manifest_for_report(&manifest_schema);
    let manifest_for_report = Some(manifest.clone());
    let mut stable_ids = StableIdRegistry::default();
    validate_manifest_schema(
        &manifest_schema,
        &source_root,
        &mut stable_ids,
        &mut media_references,
        &mut errors,
        &mut warnings,
    );

    validate_fixed_module_layout(&source_root, &mut errors);
    let declared_modules: HashSet<ModuleKind> = manifest_schema.modules.iter().copied().collect();
    let mut modules = Vec::new();
    for module_kind in ModuleKind::ALL {
        let relative = module_kind.relative_path();
        let module_path = source_root.join(&relative);
        if !declared_modules.contains(&module_kind) {
            if module_path.exists() {
                errors.push(issue(
                    "UNDECLARED_MODULE_FILE",
                    "A fixed v1 module file exists but its type is not declared in manifest.modules.",
                    Some(&relative),
                ));
            }
            continue;
        }
        let Some(module_json) = read_json_for_validation(
            &source_root,
            &module_path,
            MAX_MODULE_BYTES,
            &relative,
            &mut errors,
        ) else {
            continue;
        };
        if json_contains_null(&module_json) {
            errors.push(issue(
                "INVALID_MODULE_SCHEMA",
                "IELTSPack v1 does not accept null for missing or optional module fields.",
                Some(&relative),
            ));
            continue;
        }
        match serde_json::from_value::<PackModuleV1>(module_json) {
            Ok(module) if module.kind() == module_kind => {
                validate_module_schema(&module, &relative, &mut stable_ids, &mut errors);
                if !selected_module_media_references_are_valid(&manifest_schema, &module) {
                    errors.push(issue("INVALID_MEDIA_REFERENCE", "Module refers to a missing or wrong-kind media asset.", Some(&relative)));
                }
                modules.push(module);
            }
            Ok(_) => errors.push(issue(
                "MODULE_TYPE_MISMATCH",
                "A fixed v1 module file must use the matching reading, listening, or writing discriminant.",
                Some(&relative),
            )),
            Err(_) => errors.push(issue(
                "INVALID_MODULE_SCHEMA",
                "A module contains missing, unknown, mixed-variant, or incorrectly typed IELTSPack v1 fields.",
                Some(&relative),
            )),
        }
    }
    validate_pack_relationships(&manifest_schema, &modules, &mut errors);

    let source_hash = if errors.is_empty() {
        match hash_directory(&source_root) {
            Ok(hash) => Some(hash),
            Err(_) => {
                errors.push(issue(
                    "HASH_FAILED",
                    "The pack could not be hashed safely.",
                    None,
                ));
                None
            }
        }
    } else {
        None
    };

    let validation_report = report(
        errors,
        warnings,
        manifest_for_report,
        media_references,
        source_hash.clone(),
    );
    if !validation_report.valid {
        return (validation_report, None);
    }
    let validated = ValidatedPack {
        source_root,
        manifest,
        manifest_json,
        source_hash: source_hash.expect("valid report has a hash"),
    };
    (validation_report, Some(validated))
}

fn manifest_for_report(manifest: &PackManifestV1) -> PackManifest {
    PackManifest {
        schema_version: manifest.schema_version,
        id: manifest.id.clone(),
        title: manifest.title.clone(),
        source_label: manifest.source_label.clone(),
        edition: manifest.edition.clone(),
        language: manifest.language.clone(),
        modules: manifest
            .modules
            .iter()
            .map(|module| module.as_str().to_string())
            .collect(),
        created_at: manifest.created_at.clone(),
        attribution: manifest.attribution.clone(),
    }
}

fn validate_manifest_schema(
    manifest: &PackManifestV1,
    source_root: &Path,
    stable_ids: &mut StableIdRegistry,
    media_references: &mut BTreeSet<String>,
    errors: &mut Vec<ValidationIssue>,
    warnings: &mut Vec<ValidationIssue>,
) {
    if manifest.schema_version != 1 {
        errors.push(issue(
            "UNSUPPORTED_SCHEMA_VERSION",
            "Only IELTSPack schemaVersion 1 is supported.",
            Some("manifest.json"),
        ));
    }
    stable_ids.record(&manifest.id, "manifest.json#id", errors);
    if !valid_pack_id(&manifest.id) {
        errors.push(issue(
            "INVALID_PACK_ID",
            "Pack ID must be a path-safe stable ID of at most 128 ASCII characters.",
            Some("manifest.json"),
        ));
    }
    if !non_blank(&manifest.title) || !non_blank(&manifest.source_label) {
        errors.push(issue(
            "MISSING_MANIFEST_LABEL",
            "Pack title and sourceLabel are required.",
            Some("manifest.json"),
        ));
    }
    if manifest.language != "en" {
        errors.push(issue(
            "UNSUPPORTED_LANGUAGE",
            "The first IELTSPack version requires language 'en'.",
            Some("manifest.json"),
        ));
    }
    if manifest.modules.is_empty() {
        errors.push(issue(
            "NO_MODULES",
            "At least one module is required.",
            Some("manifest.json"),
        ));
    }
    if !valid_iso_utc_timestamp(&manifest.created_at) {
        errors.push(issue(
            "INVALID_CREATED_AT",
            "createdAt must be a valid ISO 8601 UTC timestamp with zero to three fractional digits.",
            Some("manifest.json#createdAt"),
        ));
    }
    if manifest
        .edition
        .as_ref()
        .is_some_and(|edition| edition.trim().is_empty())
    {
        errors.push(issue(
            "INVALID_EDITION",
            "edition cannot be blank when supplied.",
            Some("manifest.json"),
        ));
    }
    if manifest
        .attribution
        .as_ref()
        .is_some_and(|attribution| attribution.trim().is_empty())
    {
        errors.push(issue(
            "INVALID_ATTRIBUTION",
            "attribution cannot be blank when supplied.",
            Some("manifest.json"),
        ));
    }
    let mut module_types = HashSet::new();
    for module in &manifest.modules {
        if !module_types.insert(*module) {
            errors.push(issue(
                "DUPLICATE_MODULE_TYPE",
                "Manifest module types must be unique.",
                Some("manifest.json#modules"),
            ));
        }
    }
    if manifest.tests.len() != 1 {
        errors.push(issue(
            "UNSUPPORTED_TEST_COUNT",
            "IELTSPack v1 supports exactly one test per pack.",
            Some("manifest.json#tests"),
        ));
    }
    for (test_index, test) in manifest.tests.iter().enumerate() {
        let base = format!("manifest.json#tests[{test_index}]");
        stable_ids.record(&test.id, &format!("{base}.id"), errors);
        if !non_blank(&test.title) {
            errors.push(issue(
                "INVALID_TEST_TITLE",
                "Every test title must contain non-whitespace text.",
                Some(&format!("{base}.title")),
            ));
        }
        if test.module_ids.is_empty() {
            errors.push(issue(
                "EMPTY_TEST_MODULES",
                "Every test must reference at least one module ID.",
                Some(&format!("{base}.moduleIds")),
            ));
        }
        for (module_index, module_id) in test.module_ids.iter().enumerate() {
            if !valid_stable_id(module_id) {
                errors.push(issue(
                    "INVALID_MODULE_REFERENCE",
                    "Test moduleIds entries must be stable IDs.",
                    Some(&format!("{base}.moduleIds[{module_index}]")),
                ));
            }
        }
    }
    for (asset_index, asset) in manifest.media_assets.iter().enumerate() {
        validate_media_asset(
            asset,
            asset_index,
            source_root,
            stable_ids,
            media_references,
            errors,
        );
    }
    if manifest.cover_image_asset_id.as_ref().is_some_and(|cover_id| {
        !manifest.media_assets.iter().any(|asset| {
            asset.id() == cover_id.as_str() && asset.kind() == MediaKind::Image
        })
    }) {
        errors.push(issue(
            "INVALID_COVER_IMAGE_REFERENCE",
            "coverImageAssetId must reference a declared image media asset.",
            Some("manifest.json#coverImageAssetId"),
        ));
    }
    if manifest.attribution.is_none() {
        warnings.push(issue(
            "NO_ATTRIBUTION",
            "No optional attribution was supplied; confirm the material is original or licensed.",
            Some("manifest.json"),
        ));
    }
    if let Some(metadata) = &manifest.import_metadata {
        validate_pdf_import_metadata(metadata, errors);
    }
}

fn validate_pdf_import_metadata(
    metadata: &PdfImportMetadataV1,
    errors: &mut Vec<ValidationIssue>,
) {
    let non_blank_fields = [
        &metadata.source_file_name,
        &metadata.source_fingerprint,
        &metadata.book_title,
        &metadata.test_number,
        &metadata.imported_at,
        &metadata.parser_version,
    ];
    if non_blank_fields.iter().any(|value| !non_blank(value)) {
        errors.push(issue(
            "INVALID_PDF_IMPORT_METADATA",
            "PDF import metadata text fields must contain non-whitespace text.",
            Some("manifest.json#importMetadata"),
        ));
    }
    let valid_hash = |value: &str| {
        value.len() == 64
            && value
                .chars()
                .all(|character| character.is_ascii_hexdigit() && !character.is_ascii_uppercase())
    };
    if metadata
        .source_sha256
        .as_ref()
        .is_some_and(|hash| !valid_hash(hash))
        || !valid_hash(&metadata.dedupe_key)
    {
        errors.push(issue(
            "INVALID_PDF_IMPORT_HASH",
            "PDF source and dedupe hashes must use 64 lowercase hexadecimal characters.",
            Some("manifest.json#importMetadata"),
        ));
    }
    let valid_range = |range: &SourcePageRangeV1| range.start > 0 && range.end >= range.start;
    if !valid_range(&metadata.passage_page_range)
        || !valid_range(&metadata.question_page_range)
        || metadata
            .answer_key_page_range
            .as_ref()
            .is_some_and(|range| !valid_range(range))
        || !(1..=3).contains(&metadata.passage_number)
        || metadata.module != "reading"
        || !matches!(metadata.extraction_mode.as_str(), "pdf-text-layer" | "pdf-visual")
        || metadata.page_number_base != 1
        || !valid_iso_utc_timestamp(&metadata.imported_at)
    {
        errors.push(issue(
            "INVALID_PDF_IMPORT_METADATA",
            "PDF import metadata contains an invalid page range, module, timestamp, or extraction mode.",
            Some("manifest.json#importMetadata"),
        ));
    }
    let _ = (metadata.source_file_size, metadata.needs_review);
}

fn validate_media_asset(
    asset: &MediaAssetV1,
    asset_index: usize,
    source_root: &Path,
    stable_ids: &mut StableIdRegistry,
    media_references: &mut BTreeSet<String>,
    errors: &mut Vec<ValidationIssue>,
) {
    let base = format!("manifest.json#mediaAssets[{asset_index}]");
    stable_ids.record(asset.id(), &format!("{base}.id"), errors);
    let relative_path = asset.relative_path();
    media_references.insert(relative_path.to_string());

    match asset {
        MediaAssetV1::Audio(audio) => {
            if audio.duration_ms == 0 || audio.duration_ms > MAX_SAFE_JSON_INTEGER {
                errors.push(issue(
                    "INVALID_MEDIA_DURATION",
                    "Audio durationMs must be a positive JavaScript-safe integer.",
                    Some(&format!("{base}.durationMs")),
                ));
            }
        }
        MediaAssetV1::Image(image) => {
            if image.width == Some(0) || image.height == Some(0) {
                errors.push(issue(
                    "INVALID_IMAGE_DIMENSIONS",
                    "Optional image width and height must be positive integers.",
                    Some(&base),
                ));
            }
            if !non_blank(&image.alt) {
                errors.push(issue(
                    "INVALID_IMAGE_ALT",
                    "Image alt text must contain non-whitespace text.",
                    Some(&format!("{base}.alt")),
                ));
            }
        }
    }

    let mime_type = asset.mime_type();
    if !valid_media_mime_syntax(asset.kind(), mime_type) {
        errors.push(issue(
            "INVALID_MEDIA_MIME",
            "Media MIME types must use the matching audio/ or image/ syntax.",
            Some(&format!("{base}.mimeType")),
        ));
    } else if !supported_media_mime(asset.kind(), mime_type) {
        errors.push(issue(
            "UNSUPPORTED_MEDIA_MIME",
            "The declared media MIME type is not supported by IELTSPack v1 native playback.",
            Some(&format!("{base}.mimeType")),
        ));
    }

    let hash_is_valid = match asset.sha256() {
        Some(expected_hash) => {
            if expected_hash.len() != 64
                || !expected_hash.chars().all(|character| {
                    character.is_ascii_hexdigit() && !character.is_ascii_uppercase()
                })
            {
                errors.push(issue(
                    "INVALID_MEDIA_CHECKSUM",
                    "A declared media sha256 must be 64 lowercase hexadecimal characters.",
                    Some(&format!("{base}.sha256")),
                ));
                false
            } else {
                true
            }
        }
        None => true,
    };

    let relative = match validate_media_relative_path(relative_path) {
        Ok(relative) => relative,
        Err(_) => {
            errors.push(issue(
                "INVALID_MEDIA_PATH",
                "Media relativePath must be a normalized path of at most 512 characters below media/.",
                Some(&format!("{base}.relativePath")),
            ));
            return;
        }
    };
    let path = source_root.join(relative);
    if !path.is_file() {
        errors.push(issue(
            "MISSING_MEDIA",
            "A declared media file is missing.",
            Some(relative_path),
        ));
        return;
    }
    if reject_link_or_reparse(&path, "declared media").is_err()
        || ensure_existing_within(source_root, &path).is_err()
    {
        errors.push(issue(
            "UNSAFE_MEDIA",
            "A declared media file failed path containment or link checks.",
            Some(relative_path),
        ));
        return;
    }
    let metadata = match fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(_) => {
            errors.push(issue(
                "MEDIA_READ_FAILED",
                "A declared media file cannot be inspected.",
                Some(relative_path),
            ));
            return;
        }
    };
    if metadata.len() > MAX_MEDIA_READ_BYTES {
        errors.push(issue(
            "MEDIA_FILE_TOO_LARGE",
            "A declared media file exceeds the native playback size limit.",
            Some(relative_path),
        ));
    }
    if supported_media_mime(asset.kind(), mime_type) {
        match media_signature_matches(&path, mime_type) {
            Ok(true) => {}
            Ok(false) => errors.push(issue(
                "MEDIA_SIGNATURE_MISMATCH",
                "A media file signature does not match its declared MIME type.",
                Some(relative_path),
            )),
            Err(_) => errors.push(issue(
                "MEDIA_READ_FAILED",
                "A declared media file cannot be inspected.",
                Some(relative_path),
            )),
        }
    }
    if hash_is_valid {
        if let Some(expected_hash) = asset.sha256() {
            match hash_file(&path) {
                Ok(actual_hash) if actual_hash == expected_hash => {}
                Ok(_) => errors.push(issue(
                    "MEDIA_CHECKSUM_MISMATCH",
                    "A media file does not match its declared sha256.",
                    Some(relative_path),
                )),
                Err(_) => errors.push(issue(
                    "MEDIA_CHECKSUM_FAILED",
                    "A declared media checksum could not be verified.",
                    Some(relative_path),
                )),
            }
        }
    }
}

fn validate_fixed_module_layout(source_root: &Path, errors: &mut Vec<ValidationIssue>) {
    let modules_dir = source_root.join("modules");
    if !modules_dir.is_dir() {
        return;
    }
    let entries = match fs::read_dir(&modules_dir) {
        Ok(entries) => entries,
        Err(_) => {
            errors.push(issue(
                "MODULE_DIRECTORY_READ_FAILED",
                "The modules directory cannot be inspected.",
                Some("modules"),
            ));
            return;
        }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            errors.push(issue(
                "UNSUPPORTED_MODULE_LAYOUT",
                "IELTSPack v1 modules must use only modules/reading.json, modules/listening.json, or modules/writing.json.",
                Some("modules"),
            ));
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            errors.push(issue(
                "UNSUPPORTED_MODULE_LAYOUT",
                "A module filename is not valid UTF-8.",
                Some("modules"),
            ));
            continue;
        };
        if name.ends_with(".json")
            && !matches!(name, "reading.json" | "listening.json" | "writing.json")
        {
            errors.push(issue(
                "UNSUPPORTED_MODULE_LAYOUT",
                "IELTSPack v1 does not support arbitrary or nested module JSON filenames.",
                Some(&format!("modules/{name}")),
            ));
        }
    }
}

fn validate_module_schema(
    module: &PackModuleV1,
    file_path: &str,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) {
    if !module.has_supported_schema_version() {
        errors.push(issue(
            "UNSUPPORTED_MODULE_SCHEMA_VERSION",
            "Reading modules support schemaVersion 1, 2, or 3; Listening and Writing modules require schemaVersion 1.",
            Some(&format!("{file_path}#schemaVersion")),
        ));
    }
    stable_ids.record(module.id(), &format!("{file_path}#id"), errors);
    if !valid_stable_id(module.test_id()) {
        errors.push(issue(
            "INVALID_MODULE_TEST_ID",
            "Every module testId must be a stable ID.",
            Some(&format!("{file_path}#testId")),
        ));
    }
    if !non_blank(module.title()) {
        errors.push(issue(
            "INVALID_MODULE_TITLE",
            "Every module title must contain non-whitespace text.",
            Some(&format!("{file_path}#title")),
        ));
    }

    match module {
        PackModuleV1::Reading(reading) => {
            if reading.sections.is_empty() {
                errors.push(issue(
                    "EMPTY_MODULE_SECTIONS",
                    "Reading modules require at least one section.",
                    Some(&format!("{file_path}#sections")),
                ));
            }
            for (section_index, section) in reading.sections.iter().enumerate() {
                let has_visual = section.content_blocks.iter().any(|block| block.visual.is_some())
                    || section.question_groups.iter().any(|group| group.context_blocks.iter().flatten().any(|block| block.visual().is_some()));
                if has_visual && reading.schema_version < 4 {
                    errors.push(issue("VISUAL_REQUIRES_V4", "Visual content requires Reading schemaVersion 4.", Some(file_path)));
                }
                validate_reading_section(
                    section,
                    &format!("{file_path}#sections[{section_index}]"),
                    reading.schema_version >= 2,
                    reading.schema_version >= 3,
                    stable_ids,
                    errors,
                );
            }
        }
        PackModuleV1::Listening(listening) => {
            if !valid_stable_id(&listening.audio_asset_id) {
                errors.push(issue(
                    "INVALID_AUDIO_ASSET_REFERENCE",
                    "Listening audioAssetId must be a stable ID.",
                    Some(&format!("{file_path}#audioAssetId")),
                ));
            }
            if listening.sections.is_empty() {
                errors.push(issue(
                    "EMPTY_MODULE_SECTIONS",
                    "Listening modules require at least one section.",
                    Some(&format!("{file_path}#sections")),
                ));
            }
            for (section_index, section) in listening.sections.iter().enumerate() {
                if section.content_blocks.iter().any(|block| block.visual.is_some()) {
                    errors.push(issue("VISUAL_READING_ONLY", "Visual PDF contexts are Reading-only.", Some(file_path)));
                }
                validate_listening_section(
                    section,
                    &format!("{file_path}#sections[{section_index}]"),
                    stable_ids,
                    errors,
                );
            }
        }
        PackModuleV1::Writing(writing) => {
            if writing.sections.is_empty() {
                errors.push(issue(
                    "EMPTY_MODULE_SECTIONS",
                    "Writing modules require at least one section.",
                    Some(&format!("{file_path}#sections")),
                ));
            }
            for (section_index, section) in writing.sections.iter().enumerate() {
                validate_writing_section(
                    section,
                    &format!("{file_path}#sections[{section_index}]"),
                    stable_ids,
                    errors,
                );
            }
        }
    }
}

fn validate_reading_section(
    section: &ReadingSectionV1,
    path: &str,
    allow_structured_context: bool,
    allow_reading_v3: bool,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) {
    validate_section_identity(&section.id, &section.title, path, stable_ids, errors);
    if section.content_blocks.is_empty() {
        errors.push(issue(
            "EMPTY_CONTENT_BLOCKS",
            "Reading sections require at least one content block.",
            Some(&format!("{path}.contentBlocks")),
        ));
    }
    for (block_index, block) in section.content_blocks.iter().enumerate() {
        validate_content_block(
            block,
            &format!("{path}.contentBlocks[{block_index}]"),
            stable_ids,
            errors,
        );
    }
    validate_question_groups(
        &section.question_groups,
        path,
        true,
        allow_structured_context,
        allow_reading_v3,
        stable_ids,
        errors,
    );
}

fn validate_listening_section(
    section: &ListeningSectionV1,
    path: &str,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) {
    validate_section_identity(&section.id, &section.title, path, stable_ids, errors);
    if section.start_ms > MAX_SAFE_JSON_INTEGER
        || section
            .end_ms
            .is_some_and(|end_ms| end_ms > MAX_SAFE_JSON_INTEGER)
    {
        errors.push(issue(
            "INVALID_LISTENING_TIME_RANGE",
            "Listening timestamps must be JavaScript-safe integers.",
            Some(path),
        ));
    }
    if section
        .end_ms
        .is_some_and(|end_ms| end_ms == 0 || end_ms <= section.start_ms)
    {
        errors.push(issue(
            "INVALID_LISTENING_TIME_RANGE",
            "Listening endMs must be positive and greater than startMs.",
            Some(&format!("{path}.endMs")),
        ));
    }
    for (block_index, block) in section.content_blocks.iter().enumerate() {
        validate_content_block(
            block,
            &format!("{path}.contentBlocks[{block_index}]"),
            stable_ids,
            errors,
        );
    }
    validate_question_groups(
        &section.question_groups,
        path,
        false,
        false,
        false,
        stable_ids,
        errors,
    );
}

fn validate_writing_section(
    section: &WritingSectionV1,
    path: &str,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) {
    validate_section_identity(&section.id, &section.title, path, stable_ids, errors);
    if section.tasks.is_empty() {
        errors.push(issue(
            "EMPTY_WRITING_TASKS",
            "Writing sections require at least one task.",
            Some(&format!("{path}.tasks")),
        ));
    }
    for (task_index, task) in section.tasks.iter().enumerate() {
        let task_path = format!("{path}.tasks[{task_index}]");
        stable_ids.record(&task.id, &format!("{task_path}.id"), errors);
        let _ = &task.task_type;
        if !non_blank(&task.title) || !non_blank(&task.prompt) {
            errors.push(issue(
                "INVALID_WRITING_TASK_TEXT",
                "Writing task title and prompt must contain non-whitespace text.",
                Some(&task_path),
            ));
        }
        if task.minimum_words == 0 {
            errors.push(issue(
                "INVALID_MINIMUM_WORDS",
                "Writing minimumWords must be a positive integer.",
                Some(&format!("{task_path}.minimumWords")),
            ));
        }
        if task.suggested_minutes == Some(0) {
            errors.push(issue(
                "INVALID_SUGGESTED_MINUTES",
                "Writing suggestedMinutes must be a positive integer when supplied.",
                Some(&format!("{task_path}.suggestedMinutes")),
            ));
        }
        if task
            .image_asset_id
            .as_ref()
            .is_some_and(|asset_id| !valid_stable_id(asset_id))
        {
            errors.push(issue(
                "INVALID_IMAGE_ASSET_REFERENCE",
                "Writing imageAssetId must be a stable ID when supplied.",
                Some(&format!("{task_path}.imageAssetId")),
            ));
        }
    }
}

fn validate_section_identity(
    id: &str,
    title: &str,
    path: &str,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) {
    stable_ids.record(id, &format!("{path}.id"), errors);
    if !non_blank(title) {
        errors.push(issue(
            "INVALID_SECTION_TITLE",
            "Every section title must contain non-whitespace text.",
            Some(&format!("{path}.title")),
        ));
    }
}

fn validate_content_block(
    block: &ContentBlockV1,
    path: &str,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) {
    stable_ids.record(&block.id, &format!("{path}.id"), errors);
    let _ = &block.kind;
    if let Some(visual) = &block.visual {
        let _ = &visual.kind;
        if !valid_visual(&visual.asset_id, visual.source_page, &visual.crop, &visual.alt_text, &visual.ocr_text) {
            errors.push(issue("INVALID_VISUAL", "Invalid image reference, crop or description.", Some(path)));
        }
    }
    if block.text.is_empty() {
        errors.push(issue(
            "EMPTY_CONTENT_BLOCK",
            "Content block text must not be empty.",
            Some(&format!("{path}.text")),
        ));
    }
}

fn validate_question_groups(
    groups: &[QuestionGroupV1],
    section_path: &str,
    allow_missing_numbers: bool,
    allow_structured_context: bool,
    allow_reading_v3: bool,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) {
    if groups.is_empty() {
        errors.push(issue(
            "EMPTY_QUESTION_GROUPS",
            "Reading and listening sections require at least one question group.",
            Some(&format!("{section_path}.questionGroups")),
        ));
    }
    for (group_index, group) in groups.iter().enumerate() {
        let group_path = format!("{section_path}.questionGroups[{group_index}]");
        stable_ids.record(&group.id, &format!("{group_path}.id"), errors);
        if group.title.as_ref().is_some_and(|title| !non_blank(title)) {
            errors.push(issue(
                "INVALID_QUESTION_GROUP_TITLE",
                "Question group titles must contain non-whitespace text when supplied.",
                Some(&format!("{group_path}.title")),
            ));
        }
        if !non_blank(&group.instructions) {
            errors.push(issue(
                "INVALID_QUESTION_INSTRUCTIONS",
                "Question group instructions must contain non-whitespace text.",
                Some(&format!("{group_path}.instructions")),
            ));
        }
        if group.questions.is_empty() {
            errors.push(issue(
                "EMPTY_QUESTION_GROUP",
                "Question groups require at least one question.",
                Some(&format!("{group_path}.questions")),
            ));
        }
        for (question_index, question) in group.questions.iter().enumerate() {
            validate_question(
                question,
                &format!("{group_path}.questions[{question_index}]"),
                allow_missing_numbers,
                allow_reading_v3,
                stable_ids,
                errors,
            );
        }
        if let Some(context_blocks) = &group.context_blocks {
            if !allow_structured_context {
                errors.push(issue(
                    "STRUCTURED_CONTEXT_REQUIRES_READING_V2",
                    "Structured question context is supported only by Reading module schemaVersion 2 or 3.",
                    Some(&format!("{group_path}.contextBlocks")),
                ));
            } else {
                validate_question_context(
                    context_blocks,
                    &group.questions,
                    &group_path,
                    allow_reading_v3,
                    stable_ids,
                    errors,
                );
            }
        }
    }
}

fn validate_question_context(
    blocks: &[QuestionContextBlockV2],
    questions: &[QuestionV1],
    group_path: &str,
    allow_reading_v3: bool,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) {
    if blocks.len() > MAX_QUESTION_CONTEXT_BLOCKS {
        errors.push(issue(
            "QUESTION_CONTEXT_BLOCK_LIMIT",
            "A question group may contain at most 32 structured context blocks.",
            Some(&format!("{group_path}.contextBlocks")),
        ));
    }
    let question_by_id: HashMap<&str, &QuestionV1> =
        questions.iter().map(|question| (question.id(), question)).collect();
    let mut bound_question_ids = HashSet::new();
    let mut node_count = blocks.len();

    for (block_index, block) in blocks.iter().enumerate() {
        let block_path = format!("{group_path}.contextBlocks[{block_index}]");
        stable_ids.record(block.id(), &format!("{block_path}.id"), errors);
        match block {
            QuestionContextBlockV2::Snapshot(visual) | QuestionContextBlockV2::Image(visual) | QuestionContextBlockV2::Figure(visual) => {
                let links = visual.linked_question_ids.as_deref().unwrap_or(&[]);
                let unique: HashSet<_> = links.iter().collect();
                if !valid_visual(&visual.asset_id, visual.source_page, &visual.crop, &visual.alt_text, &visual.ocr_text)
                    || links.len() > 100 || unique.len() != links.len() || links.iter().any(|id| !question_by_id.contains_key(id.as_str())) {
                    errors.push(issue("INVALID_VISUAL", "Invalid visual context or linked question IDs.", Some(&block_path)));
                }
            }
            QuestionContextBlockV2::Paragraph(paragraph) => {
                validate_question_context_text(&paragraph.text, &format!("{block_path}.text"), errors);
            }
            QuestionContextBlockV2::List(list) => {
                let _ = &list.style;
                node_count += list.items.len();
                if list.items.is_empty() || list.items.len() > MAX_QUESTION_CONTEXT_LIST_ITEMS {
                    errors.push(issue(
                        "QUESTION_CONTEXT_LIST_SIZE",
                        "A structured list requires 1 to 50 items.",
                        Some(&format!("{block_path}.items")),
                    ));
                }
                for (item_index, item) in list.items.iter().enumerate() {
                    let item_path = format!("{block_path}.items[{item_index}]");
                    stable_ids.record(&item.id, &format!("{item_path}.id"), errors);
                    validate_question_context_text(&item.text, &format!("{item_path}.text"), errors);
                }
            }
            QuestionContextBlockV2::Table(table) => {
                let _ = (table.has_header_row, table.has_row_headers);
                node_count += table.rows.len();
                if table.rows.is_empty() || table.rows.len() > MAX_QUESTION_CONTEXT_TABLE_ROWS {
                    errors.push(issue(
                        "QUESTION_CONTEXT_TABLE_ROW_LIMIT",
                        "A structured table requires 1 to 30 rows.",
                        Some(&format!("{block_path}.rows")),
                    ));
                }
                let column_count = table.rows.first().map_or(0, |row| row.cells.len());
                if column_count == 0 || column_count > MAX_QUESTION_CONTEXT_TABLE_COLUMNS {
                    errors.push(issue(
                        "QUESTION_CONTEXT_TABLE_COLUMN_LIMIT",
                        "A structured table requires 1 to 12 columns.",
                        Some(&format!("{block_path}.rows[0].cells")),
                    ));
                }
                for (row_index, row) in table.rows.iter().enumerate() {
                    let row_path = format!("{block_path}.rows[{row_index}]");
                    stable_ids.record(&row.id, &format!("{row_path}.id"), errors);
                    node_count += row.cells.len();
                    if row.cells.len() != column_count {
                        errors.push(issue(
                            "QUESTION_CONTEXT_TABLE_NOT_RECTANGULAR",
                            "Every row in a structured table must have the same number of cells.",
                            Some(&format!("{row_path}.cells")),
                        ));
                    }
                    for (cell_index, cell) in row.cells.iter().enumerate() {
                        let cell_path = format!("{row_path}.cells[{cell_index}]");
                        stable_ids.record(&cell.id, &format!("{cell_path}.id"), errors);
                        validate_question_context_text(&cell.text, &format!("{cell_path}.text"), errors);
                        let Some(question_id) = &cell.question_id else {
                            continue;
                        };
                        let Some(question) = question_by_id.get(question_id.as_str()) else {
                            errors.push(issue(
                                "QUESTION_CONTEXT_REFERENCE_INVALID",
                                "A table answer binding must reference a question in the same question group.",
                                Some(&format!("{cell_path}.questionId")),
                            ));
                            continue;
                        };
                        if !question.supports_table_binding() {
                            errors.push(issue(
                                "QUESTION_CONTEXT_TYPE_UNSUPPORTED",
                                "Only short-answer and fill-blank questions can be bound inside a table cell.",
                                Some(&format!("{cell_path}.questionId")),
                            ));
                        }
                        if !bound_question_ids.insert(question_id.as_str()) {
                            errors.push(issue(
                                "QUESTION_CONTEXT_BINDING_DUPLICATE",
                                "A question may have only one primary answer position in structured context.",
                                Some(&format!("{cell_path}.questionId")),
                            ));
                        }
                    }
                }
            }
            QuestionContextBlockV2::Completion(completion) => {
                if !allow_reading_v3 {
                    errors.push(issue(
                        "COMPLETION_CONTEXT_REQUIRES_READING_V3",
                        "Summary and notes completion context requires Reading schemaVersion 3.",
                        Some(&block_path),
                    ));
                }
                let _ = &completion.style;
                if completion.title.as_ref().is_some_and(|title| title.chars().count() > 200) {
                    errors.push(issue(
                        "QUESTION_CONTEXT_TITLE_LIMIT",
                        "Completion context titles may contain at most 200 characters.",
                        Some(&format!("{block_path}.title")),
                    ));
                }
                node_count += completion.parts.len();
                if completion.parts.len() < 2 || completion.parts.len() > 100 {
                    errors.push(issue(
                        "QUESTION_CONTEXT_COMPLETION_SIZE",
                        "A completion context requires 2 to 100 text or answer parts.",
                        Some(&format!("{block_path}.parts")),
                    ));
                }
                for (part_index, part) in completion.parts.iter().enumerate() {
                    let part_path = format!("{block_path}.parts[{part_index}]");
                    match part {
                        QuestionContextCompletionPartV3::Text { id, text } => {
                            stable_ids.record(id, &format!("{part_path}.id"), errors);
                            validate_question_context_text(text, &format!("{part_path}.text"), errors);
                        }
                        QuestionContextCompletionPartV3::Answer { id, question_id } => {
                            stable_ids.record(id, &format!("{part_path}.id"), errors);
                            let Some(question) = question_by_id.get(question_id.as_str()) else {
                                errors.push(issue(
                                    "QUESTION_CONTEXT_REFERENCE_INVALID",
                                    "A completion answer binding must reference a question in the same question group.",
                                    Some(&format!("{part_path}.questionId")),
                                ));
                                continue;
                            };
                            if !question.supports_table_binding() {
                                errors.push(issue(
                                    "QUESTION_CONTEXT_TYPE_UNSUPPORTED",
                                    "Only short-answer and fill-blank questions can be bound inside completion context.",
                                    Some(&format!("{part_path}.questionId")),
                                ));
                            }
                            if !bound_question_ids.insert(question_id.as_str()) {
                                errors.push(issue(
                                    "QUESTION_CONTEXT_BINDING_DUPLICATE",
                                    "A question may have only one primary answer position in structured context.",
                                    Some(&format!("{part_path}.questionId")),
                                ));
                            }
                        }
                    }
                }
            }
        }
    }
    if node_count > MAX_QUESTION_CONTEXT_NODES {
        errors.push(issue(
            "QUESTION_CONTEXT_NODE_LIMIT",
            "Structured question context may contain at most 512 persistent nodes.",
            Some(&format!("{group_path}.contextBlocks")),
        ));
    }
}

fn validate_question_context_text(text: &str, path: &str, errors: &mut Vec<ValidationIssue>) {
    if text.chars().count() > MAX_QUESTION_CONTEXT_TEXT_LENGTH {
        errors.push(issue(
            "QUESTION_CONTEXT_TEXT_LIMIT",
            "Structured context text may contain at most 4000 characters per node.",
            Some(path),
        ));
    }
}

fn validate_question(
    question: &QuestionV1,
    path: &str,
    allow_missing_number: bool,
    allow_reading_v3: bool,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) {
    match question {
        QuestionV1::SingleChoice(question) => {
            validate_question_base(
                &question.id,
                question.number,
                &question.prompt,
                question.points,
                question.explanation.as_deref(),
                path,
                allow_missing_number,
                stable_ids,
                errors,
            );
            validate_question_source(question.source.as_ref(), path, errors);
            if question.options.len() < 2 {
                errors.push(issue(
                    "TOO_FEW_CHOICE_OPTIONS",
                    "Single-choice questions require at least two options.",
                    Some(&format!("{path}.options")),
                ));
            }
            let mut option_ids = HashSet::new();
            for (option_index, option) in question.options.iter().enumerate() {
                let option_path = format!("{path}.options[{option_index}]");
                stable_ids.record(&option.id, &format!("{option_path}.id"), errors);
                if !option_ids.insert(option.id.as_str()) {
                    errors.push(issue(
                        "DUPLICATE_OPTION_ID",
                        "Choice option IDs must be unique within a question.",
                        Some(&format!("{option_path}.id")),
                    ));
                }
                if !non_blank(&option.label) || utf16_len(&option.label) > 16 {
                    errors.push(issue(
                        "INVALID_OPTION_LABEL",
                        "Choice option labels must contain 1-16 non-whitespace characters.",
                        Some(&format!("{option_path}.label")),
                    ));
                }
                if !non_blank(&option.text) {
                    errors.push(issue(
                        "INVALID_OPTION_TEXT",
                        "Choice option text must contain non-whitespace text.",
                        Some(&format!("{option_path}.text")),
                    ));
                }
            }
            if let Some(correct_option_id) = &question.correct_option_id {
                if !valid_stable_id(correct_option_id)
                    || !option_ids.contains(correct_option_id.as_str())
                {
                    errors.push(issue(
                        "INVALID_CORRECT_OPTION_REFERENCE",
                        "correctOptionId must reference an option in the same question.",
                        Some(&format!("{path}.correctOptionId")),
                    ));
                }
            }
        }
        QuestionV1::TrueFalseNotGiven(question) => {
            validate_question_base(
                &question.id,
                question.number,
                &question.prompt,
                question.points,
                question.explanation.as_deref(),
                path,
                allow_missing_number,
                stable_ids,
                errors,
            );
            validate_question_source(question.source.as_ref(), path, errors);
            let _ = &question.correct_answer;
        }
        QuestionV1::YesNoNotGiven(question) => {
            validate_question_base(
                &question.id,
                question.number,
                &question.prompt,
                question.points,
                question.explanation.as_deref(),
                path,
                allow_missing_number,
                stable_ids,
                errors,
            );
            validate_question_source(question.source.as_ref(), path, errors);
            if !allow_reading_v3 {
                errors.push(issue(
                    "QUESTION_TYPE_REQUIRES_READING_V3",
                    "Yes/No/Not Given questions require Reading schemaVersion 3.",
                    Some(&format!("{path}.type")),
                ));
            }
            let _ = &question.correct_answer;
        }
        QuestionV1::MultipleChoice(question) => {
            validate_question_base(
                &question.id,
                question.number,
                &question.prompt,
                question.points,
                question.explanation.as_deref(),
                path,
                allow_missing_number,
                stable_ids,
                errors,
            );
            validate_question_source(question.source.as_ref(), path, errors);
            if !allow_reading_v3 {
                errors.push(issue(
                    "QUESTION_TYPE_REQUIRES_READING_V3",
                    "Multiple-choice questions require Reading schemaVersion 3.",
                    Some(&format!("{path}.type")),
                ));
            }
            let option_ids = validate_choice_options(&question.options, path, stable_ids, errors);
            if !(2..=8).contains(&question.selection_count)
                || question.selection_count as usize > question.options.len()
            {
                errors.push(issue(
                    "INVALID_MULTIPLE_CHOICE_SELECTION_COUNT",
                    "selectionCount must be between 2 and 8 and cannot exceed the number of options.",
                    Some(&format!("{path}.selectionCount")),
                ));
            }
            if question.correct_option_ids.len() != question.selection_count as usize
                || question.correct_option_ids.iter().any(|id| !option_ids.contains(id.as_str()))
                || question.correct_option_ids.iter().collect::<HashSet<_>>().len() != question.correct_option_ids.len()
            {
                errors.push(issue(
                    "INVALID_MULTIPLE_CHOICE_ANSWER",
                    "correctOptionIds must contain exactly selectionCount unique references from this question.",
                    Some(&format!("{path}.correctOptionIds")),
                ));
            }
            let number_count = 1 + question.additional_numbers.len();
            let numbers = question.additional_numbers.iter().collect::<HashSet<_>>();
            if question.number.is_some_and(|number| numbers.contains(&number))
                || numbers.len() != question.additional_numbers.len()
            {
                errors.push(issue(
                    "INVALID_MULTIPLE_CHOICE_NUMBERS",
                    "additionalNumbers must be positive and unique and must not repeat the primary number.",
                    Some(&format!("{path}.additionalNumbers")),
                ));
            }
            if !question.additional_numbers.is_empty()
                && (question.scoring_mode != MultipleChoiceScoringModeV3::PerCorrectOption
                    || number_count != question.selection_count as usize
                    || question.points != question.selection_count)
            {
                errors.push(issue(
                    "AMBIGUOUS_MULTIPLE_CHOICE_SCORING",
                    "A multi-number question requires per-correct-option scoring, one number per selection, and matching points.",
                    Some(path),
                ));
            }
        }
        QuestionV1::Matching(question) => {
            validate_question_base(
                &question.id,
                question.number,
                &question.prompt,
                question.points,
                question.explanation.as_deref(),
                path,
                allow_missing_number,
                stable_ids,
                errors,
            );
            validate_question_source(question.source.as_ref(), path, errors);
            if !allow_reading_v3 {
                errors.push(issue(
                    "QUESTION_TYPE_REQUIRES_READING_V3",
                    "Matching questions require Reading schemaVersion 3.",
                    Some(&format!("{path}.type")),
                ));
            }
            let option_ids = validate_choice_options(&question.options, path, stable_ids, errors);
            if let Some(correct_option_id) = &question.correct_option_id {
                if !option_ids.contains(correct_option_id.as_str()) {
                    errors.push(issue(
                        "INVALID_CORRECT_OPTION_REFERENCE",
                        "correctOptionId must reference an option in the same matching question.",
                        Some(&format!("{path}.correctOptionId")),
                    ));
                }
            }
            let _ = (&question.matching_kind, question.allow_option_reuse);
        }
        QuestionV1::ShortAnswer(question) => {
            validate_question_base(
                &question.id,
                question.number,
                &question.prompt,
                question.points,
                question.explanation.as_deref(),
                path,
                allow_missing_number,
                stable_ids,
                errors,
            );
            validate_question_source(question.source.as_ref(), path, errors);
            validate_acceptable_answers(
                &question.acceptable_answers,
                question.max_words,
                path,
                errors,
            );
            let _ = question.case_sensitive;
        }
        QuestionV1::FillBlank(question) => {
            validate_question_base(
                &question.id,
                question.number,
                &question.prompt,
                question.points,
                question.explanation.as_deref(),
                path,
                allow_missing_number,
                stable_ids,
                errors,
            );
            validate_acceptable_answers(
                &question.acceptable_answers,
                question.max_words,
                path,
                errors,
            );
            validate_question_source(question.source.as_ref(), path, errors);
            if !non_blank(&question.sentence)
                || question.sentence.matches("{{blank}}").count() != 1
            {
                errors.push(issue(
                    "INVALID_FILL_BLANK_SENTENCE",
                    "Fill-blank sentence must contain exactly one {{blank}} marker.",
                    Some(&format!("{path}.sentence")),
                ));
            }
            let _ = question.case_sensitive;
        }
    }
}

fn validate_choice_options<'a>(
    options: &'a [ChoiceOptionV1],
    path: &str,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) -> HashSet<&'a str> {
    if options.len() < 2 {
        errors.push(issue(
            "TOO_FEW_CHOICE_OPTIONS",
            "Choice and matching questions require at least two options.",
            Some(&format!("{path}.options")),
        ));
    }
    let mut option_ids = HashSet::new();
    for (option_index, option) in options.iter().enumerate() {
        let option_path = format!("{path}.options[{option_index}]");
        stable_ids.record(&option.id, &format!("{option_path}.id"), errors);
        if !option_ids.insert(option.id.as_str()) {
            errors.push(issue(
                "DUPLICATE_OPTION_ID",
                "Choice option IDs must be unique within a question.",
                Some(&format!("{option_path}.id")),
            ));
        }
        if !non_blank(&option.label) || utf16_len(&option.label) > 16 {
            errors.push(issue(
                "INVALID_OPTION_LABEL",
                "Choice option labels must contain 1-16 non-whitespace characters.",
                Some(&format!("{option_path}.label")),
            ));
        }
        if !non_blank(&option.text) {
            errors.push(issue(
                "INVALID_OPTION_TEXT",
                "Choice option text must contain non-whitespace text.",
                Some(&format!("{option_path}.text")),
            ));
        }
    }
    option_ids
}

fn validate_question_source(
    source: Option<&QuestionSourceV1>,
    path: &str,
    errors: &mut Vec<ValidationIssue>,
) {
    let Some(source) = source else {
        return;
    };
    if source.raw_text.is_empty()
        || !non_blank(&source.source_block)
        || source.source_pages.is_empty()
        || source.source_pages.iter().any(|page| *page == 0)
    {
        errors.push(issue(
            "INVALID_QUESTION_SOURCE",
            "Imported question source metadata requires raw text, positive source pages, and a source block.",
            Some(&format!("{path}.source")),
        ));
    }
    let _ = (&source.detected_type, source.needs_review);
}

#[allow(clippy::too_many_arguments)]
fn validate_question_base(
    id: &str,
    number: Option<u32>,
    prompt: &str,
    points: u32,
    explanation: Option<&str>,
    path: &str,
    allow_missing_number: bool,
    stable_ids: &mut StableIdRegistry,
    errors: &mut Vec<ValidationIssue>,
) {
    stable_ids.record(id, &format!("{path}.id"), errors);
    if number.is_none() && !allow_missing_number {
        errors.push(issue(
            "MISSING_QUESTION_NUMBER",
            "Listening question numbers are required.",
            Some(&format!("{path}.number")),
        ));
    } else if number == Some(0) {
        errors.push(issue(
            "INVALID_QUESTION_NUMBER",
            "Question number must be a positive integer when supplied.",
            Some(&format!("{path}.number")),
        ));
    }
    if !non_blank(prompt) {
        errors.push(issue(
            "INVALID_QUESTION_PROMPT",
            "Question prompt must contain non-whitespace text.",
            Some(&format!("{path}.prompt")),
        ));
    }
    if points == 0 {
        errors.push(issue(
            "INVALID_QUESTION_POINTS",
            "Question points must be a positive integer.",
            Some(&format!("{path}.points")),
        ));
    }
    if explanation.is_some_and(|value| !non_blank(value)) {
        errors.push(issue(
            "INVALID_QUESTION_EXPLANATION",
            "Question explanation must contain non-whitespace text when supplied.",
            Some(&format!("{path}.explanation")),
        ));
    }
}

fn validate_acceptable_answers(
    answers: &[String],
    max_words: Option<u32>,
    path: &str,
    errors: &mut Vec<ValidationIssue>,
) {
    if answers.iter().any(|answer| !non_blank(answer)) {
        errors.push(issue(
            "INVALID_ACCEPTABLE_ANSWERS",
            "acceptableAnswers entries must contain non-whitespace text.",
            Some(&format!("{path}.acceptableAnswers")),
        ));
    }
    if max_words.is_some_and(|value| value == 0 || value > 20) {
        errors.push(issue(
            "INVALID_MAX_WORDS",
            "maxWords must be a positive integer no greater than 20.",
            Some(&format!("{path}.maxWords")),
        ));
    }
}

fn validate_pack_relationships(
    manifest: &PackManifestV1,
    modules: &[PackModuleV1],
    errors: &mut Vec<ValidationIssue>,
) {
    let declared_types: HashSet<ModuleKind> = manifest.modules.iter().copied().collect();
    let mut actual_types = HashSet::new();
    for module in modules {
        if !actual_types.insert(module.kind()) {
            errors.push(issue(
                "DUPLICATE_MODULE_TYPE",
                "IELTSPack v1 supports at most one module of each type.",
                Some("modules"),
            ));
        }
        if !declared_types.contains(&module.kind()) {
            errors.push(issue(
                "UNDECLARED_MODULE",
                "A parsed module type is not declared in manifest.modules.",
                Some("manifest.json#modules"),
            ));
        }
    }
    for module_type in declared_types {
        if !actual_types.contains(&module_type) {
            errors.push(issue(
                "MISSING_DECLARED_MODULE",
                "A module type declared in the manifest did not produce a valid fixed module file.",
                Some(&module_type.relative_path()),
            ));
        }
    }

    let mut modules_by_id = HashMap::new();
    for module in modules {
        modules_by_id.entry(module.id()).or_insert(module);
    }
    let tests_by_id: HashMap<&str, &PackTestDescriptorV1> = manifest
        .tests
        .iter()
        .map(|test| (test.id.as_str(), test))
        .collect();
    let mut referenced_module_ids = HashSet::new();
    for (test_index, test) in manifest.tests.iter().enumerate() {
        for (module_index, module_id) in test.module_ids.iter().enumerate() {
            referenced_module_ids.insert(module_id.as_str());
            match modules_by_id.get(module_id.as_str()) {
                None => errors.push(issue(
                    "UNKNOWN_MODULE_ID",
                    "A test moduleIds entry does not resolve to a parsed module.",
                    Some(&format!(
                        "manifest.json#tests[{test_index}].moduleIds[{module_index}]"
                    )),
                )),
                Some(module) if module.test_id() != test.id.as_str() => errors.push(issue(
                    "MODULE_TEST_ID_MISMATCH",
                    "A referenced module testId does not match the test that references it.",
                    Some(&format!(
                        "manifest.json#tests[{test_index}].moduleIds[{module_index}]"
                    )),
                )),
                Some(_) => {}
            }
        }
    }
    for module in modules {
        if !tests_by_id.contains_key(module.test_id()) {
            errors.push(issue(
                "UNKNOWN_MODULE_TEST_ID",
                "A module testId does not resolve to a manifest test.",
                Some(&format!("{}#testId", module.kind().relative_path())),
            ));
        }
        if !referenced_module_ids.contains(module.id()) {
            errors.push(issue(
                "UNREFERENCED_MODULE",
                "Every module must be referenced by the manifest test.",
                Some(&format!("{}#id", module.kind().relative_path())),
            ));
        }
    }

    let media_by_id: HashMap<&str, MediaKind> = manifest
        .media_assets
        .iter()
        .map(|asset| (asset.id(), asset.kind()))
        .collect();
    for module in modules {
        match module {
            PackModuleV1::Listening(listening) => {
                if media_by_id.get(listening.audio_asset_id.as_str()) != Some(&MediaKind::Audio) {
                    errors.push(issue(
                        "INVALID_AUDIO_ASSET_REFERENCE",
                        "Listening audioAssetId must resolve to a declared audio media asset.",
                        Some("modules/listening.json#audioAssetId"),
                    ));
                }
            }
            PackModuleV1::Writing(writing) => {
                for (section_index, section) in writing.sections.iter().enumerate() {
                    for (task_index, task) in section.tasks.iter().enumerate() {
                        if let Some(image_asset_id) = &task.image_asset_id {
                            if media_by_id.get(image_asset_id.as_str()) != Some(&MediaKind::Image) {
                                errors.push(issue(
                                    "INVALID_IMAGE_ASSET_REFERENCE",
                                    "Writing imageAssetId must resolve to a declared image media asset.",
                                    Some(&format!(
                                        "modules/writing.json#sections[{section_index}].tasks[{task_index}].imageAssetId"
                                    )),
                                ));
                            }
                        }
                    }
                }
            }
            PackModuleV1::Reading(_) => {}
        }
    }
}

fn non_blank(value: &str) -> bool {
    !value.trim().is_empty()
}

fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}

fn json_contains_null(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::Array(values) => values.iter().any(json_contains_null),
        Value::Object(values) => values.values().any(json_contains_null),
        _ => false,
    }
}

fn valid_iso_utc_timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    let valid_length = bytes.len() == 20 || (22..=24).contains(&bytes.len());
    if !valid_length
        || bytes.get(4) != Some(&b'-')
        || bytes.get(7) != Some(&b'-')
        || bytes.get(10) != Some(&b'T')
        || bytes.get(13) != Some(&b':')
        || bytes.get(16) != Some(&b':')
        || bytes.last() != Some(&b'Z')
    {
        return false;
    }
    let digit_positions = [0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18];
    if digit_positions
        .iter()
        .any(|index| !bytes[*index].is_ascii_digit())
    {
        return false;
    }
    if bytes.len() > 20
        && (bytes.get(19) != Some(&b'.')
            || bytes[20..bytes.len() - 1]
                .iter()
                .any(|byte| !byte.is_ascii_digit()))
    {
        return false;
    }
    chrono::DateTime::parse_from_rfc3339(value).is_ok()
}

fn valid_media_mime_syntax(kind: MediaKind, mime_type: &str) -> bool {
    let prefix = match kind {
        MediaKind::Audio => "audio/",
        MediaKind::Image => "image/",
    };
    mime_type.strip_prefix(prefix).is_some_and(|suffix| {
        !suffix.is_empty()
            && suffix.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '.' | '+' | '-')
            })
    })
}

fn supported_media_mime(kind: MediaKind, mime_type: &str) -> bool {
    match kind {
        MediaKind::Audio => matches!(
            mime_type,
            "audio/wav"
                | "audio/x-wav"
                | "audio/mpeg"
                | "audio/ogg"
                | "audio/flac"
                | "audio/mp4"
                | "audio/aac"
                | "audio/webm"
        ),
        MediaKind::Image => matches!(
            mime_type,
            "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/bmp"
        ),
    }
}

fn media_signature_matches(path: &Path, mime_type: &str) -> Result<bool> {
    let mut file = File::open(path)?;
    let mut header = [0u8; 16];
    let count = file.read(&mut header)?;
    let header = &header[..count];
    let matches = match mime_type {
        "audio/wav" | "audio/x-wav" => {
            header.len() >= 12 && &header[..4] == b"RIFF" && &header[8..12] == b"WAVE"
        }
        "audio/mpeg" => {
            header.starts_with(b"ID3")
                || (header.len() >= 2 && header[0] == 0xff && header[1] & 0xe0 == 0xe0)
        }
        "audio/ogg" => header.starts_with(b"OggS"),
        "audio/flac" => header.starts_with(b"fLaC"),
        "audio/mp4" => header.len() >= 8 && &header[4..8] == b"ftyp",
        "audio/aac" => {
            header.len() >= 2 && header[0] == 0xff && header[1] & 0xf6 == 0xf0
        }
        "audio/webm" => header.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]),
        "image/png" => header.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]),
        "image/jpeg" => header.starts_with(&[0xff, 0xd8, 0xff]),
        "image/gif" => header.starts_with(b"GIF87a") || header.starts_with(b"GIF89a"),
        "image/webp" => {
            header.len() >= 12 && &header[..4] == b"RIFF" && &header[8..12] == b"WEBP"
        }
        "image/bmp" => header.starts_with(b"BM"),
        _ => false,
    };
    Ok(matches)
}

fn scan_tree_safety(
    root: &Path,
    errors: &mut Vec<ValidationIssue>,
    warnings: &mut Vec<ValidationIssue>,
) {
    let mut file_count = 0usize;
    let mut total_bytes = 0u64;
    for entry_result in WalkDir::new(root).follow_links(false).sort_by_file_name() {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => {
                errors.push(issue(
                    "PACK_SCAN_FAILED",
                    "An entry in the pack could not be inspected.",
                    None,
                ));
                continue;
            }
        };
        if entry.path() == root {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(root)
            .ok()
            .and_then(|path| path_to_forward_slashes(path).ok());
        match relative.as_deref() {
            Some(path) if utf16_len(path) <= MAX_PACK_PATH_CHARS => {}
            Some(path) => errors.push(issue(
                "PACK_PATH_TOO_LONG",
                "A pack entry path exceeds the 512-character safety limit.",
                Some(path),
            )),
            None => errors.push(issue(
                "INVALID_PACK_PATH",
                "A pack entry path could not be normalized safely.",
                None,
            )),
        }
        if reject_link_or_reparse(entry.path(), "pack entry").is_err() {
            errors.push(issue(
                "UNSAFE_LINK",
                "Symbolic links and reparse points are not allowed in packs.",
                relative.as_deref(),
            ));
            continue;
        }
        if entry.file_type().is_file() {
            file_count += 1;
            match entry.metadata() {
                Ok(metadata) => {
                    if metadata.len() > MAX_PACK_FILE_BYTES {
                        errors.push(issue(
                            "PACK_FILE_TOO_LARGE",
                            "A pack file exceeds the per-file safety limit.",
                            relative.as_deref(),
                        ));
                    }
                    total_bytes = total_bytes.saturating_add(metadata.len());
                }
                Err(_) => errors.push(issue(
                    "PACK_METADATA_READ_FAILED",
                    "A pack file's size could not be inspected.",
                    relative.as_deref(),
                )),
            }
            if file_count > MAX_PACK_FILES || total_bytes > MAX_PACK_BYTES {
                errors.push(issue(
                    "PACK_TOO_LARGE",
                    "The pack exceeds the safe file-count or total-size limit.",
                    None,
                ));
                return;
            }
        } else if !entry.file_type().is_dir() {
            errors.push(issue(
                "UNSUPPORTED_FILE_TYPE",
                "Packs may contain only regular files and directories.",
                relative.as_deref(),
            ));
        }
    }
    if file_count == 0 {
        warnings.push(issue(
            "EMPTY_PACK",
            "The selected folder does not contain regular files.",
            None,
        ));
    }
}

fn read_json_for_validation(
    root: &Path,
    path: &Path,
    maximum: u64,
    display_path: &str,
    errors: &mut Vec<ValidationIssue>,
) -> Option<Value> {
    if !path.is_file() {
        errors.push(issue(
            "MISSING_JSON_FILE",
            "A required pack JSON file is missing.",
            Some(display_path),
        ));
        return None;
    }
    if reject_link_or_reparse(path, "pack JSON").is_err()
        || ensure_existing_within(root, path).is_err()
    {
        errors.push(issue(
            "UNSAFE_JSON_FILE",
            "A pack JSON file failed path safety checks.",
            Some(display_path),
        ));
        return None;
    }
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => {
            errors.push(issue(
                "JSON_READ_FAILED",
                "A required pack JSON file cannot be read.",
                Some(display_path),
            ));
            return None;
        }
    };
    if metadata.len() > maximum {
        errors.push(issue(
            "JSON_FILE_TOO_LARGE",
            "A pack JSON file exceeds its safe size limit.",
            Some(display_path),
        ));
        return None;
    }
    match fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
    {
        Some(value) => Some(value),
        None => {
            errors.push(issue(
                "INVALID_JSON",
                "A required pack JSON file is not valid JSON.",
                Some(display_path),
            ));
            None
        }
    }
}

fn validate_media_relative_path(value: &str) -> Result<PathBuf> {
    if value.trim() != value
        || utf16_len(value) > MAX_PACK_PATH_CHARS
        || value
            .split('/')
            .any(|segment| segment.is_empty() || matches!(segment, "." | ".."))
    {
        return Err(BackendError::Security(
            "Pack media paths must be normalized and no longer than 512 characters.".to_string(),
        ));
    }
    let relative = validate_relative_path(value)?;
    let mut components = relative.components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(first)), Some(Component::Normal(_)))
            if first == std::ffi::OsStr::new("media") =>
        {
            Ok(relative)
        }
        _ => Err(BackendError::Security(
            "Pack media paths must be below media/.".to_string(),
        )),
    }
}

fn validate_module_name(module: &str) -> Result<()> {
    module_kind_from_str(module)?;
    Ok(())
}

fn module_kind_from_str(module: &str) -> Result<ModuleKind> {
    match module {
        "reading" => Ok(ModuleKind::Reading),
        "listening" => Ok(ModuleKind::Listening),
        "writing" => Ok(ModuleKind::Writing),
        _ => Err(BackendError::InvalidInput(
            "Unsupported pack module.".to_string(),
        )),
    }
}

fn valid_pack_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 128 || id == "." || id == ".." {
        return false;
    }
    let mut characters = id.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    first.is_ascii_alphanumeric()
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

fn valid_stable_id(id: &str) -> bool {
    let mut characters = id.chars();
    id.len() <= 128
        && characters
            .next()
            .is_some_and(|character| character.is_ascii_alphanumeric())
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | ':' | '-')
        })
}

fn read_json_file(root: &Path, path: &Path, maximum: u64) -> Result<Value> {
    if !path.is_file() {
        return Err(BackendError::NotFound(
            "An installed pack JSON file is missing.".to_string(),
        ));
    }
    reject_link_or_reparse(path, "installed pack JSON")?;
    let canonical = ensure_existing_within(root, path)?;
    if fs::metadata(&canonical)?.len() > maximum {
        return Err(BackendError::InvalidInput(
            "An installed pack JSON file is too large.".to_string(),
        ));
    }
    Ok(serde_json::from_slice(&fs::read(canonical)?)?)
}

fn installed_pack_root(workspace: &Workspace, record: &InstalledPackRecord) -> Result<PathBuf> {
    let relative = validate_relative_path(&record.install_path)?;
    let mut components = relative.components();
    match (components.next(), components.next(), components.next()) {
        (Some(Component::Normal(first)), Some(Component::Normal(id)), None)
            if first == std::ffi::OsStr::new("packs") && id.to_string_lossy() == record.id => {}
        _ => {
            return Err(BackendError::Security(
                "Installed pack registry path is invalid.".to_string(),
            ));
        }
    }
    let root = workspace.root().join(relative);
    if !root.is_dir() {
        return Err(BackendError::NotFound(
            "The installed pack folder is missing.".to_string(),
        ));
    }
    reject_link_or_reparse(&root, "installed pack root")?;
    ensure_existing_within(workspace.root(), &root)
}

fn copy_validated_tree(source_root: &Path, destination_root: &Path) -> Result<()> {
    let mut copied_files = 0usize;
    let mut copied_bytes = 0u64;
    for entry in WalkDir::new(source_root)
        .follow_links(false)
        .sort_by_file_name()
    {
        let entry = entry?;
        if entry.path() == source_root {
            continue;
        }
        reject_link_or_reparse(entry.path(), "pack entry")?;
        ensure_existing_within(source_root, entry.path())?;
        let relative = entry.path().strip_prefix(source_root).map_err(|_| {
            BackendError::Security("Pack entry escaped its source folder.".to_string())
        })?;
        let normalized = path_to_forward_slashes(relative)?;
        if utf16_len(&normalized) > MAX_PACK_PATH_CHARS {
            return Err(BackendError::Security(
                "A pack entry path exceeds the 512-character safety limit.".to_string(),
            ));
        }
        let safe_relative = validate_relative_path(&normalized)?;
        let destination = destination_root.join(safe_relative);
        if entry.file_type().is_dir() {
            fs::create_dir(&destination)?;
        } else if entry.file_type().is_file() {
            copied_files = copied_files.saturating_add(1);
            let file_bytes = entry.metadata()?.len();
            if file_bytes > MAX_PACK_FILE_BYTES {
                return Err(BackendError::InvalidInput(
                    "A pack file exceeds the per-file safety limit.".to_string(),
                ));
            }
            copied_bytes = copied_bytes.saturating_add(file_bytes);
            if copied_files > MAX_PACK_FILES || copied_bytes > MAX_PACK_BYTES {
                return Err(BackendError::InvalidInput(
                    "The pack exceeds the safe file-count or total-size limit.".to_string(),
                ));
            }
            fs::copy(entry.path(), destination)?;
        } else {
            return Err(BackendError::Security(
                "Unsupported file type encountered during pack installation.".to_string(),
            ));
        }
    }
    Ok(())
}

fn hash_directory(root: &Path) -> Result<String> {
    let mut files = Vec::new();
    let mut file_count = 0usize;
    let mut total_bytes = 0u64;
    for entry in WalkDir::new(root).follow_links(false).sort_by_file_name() {
        let entry = entry?;
        if entry.file_type().is_symlink() {
            return Err(BackendError::Security(
                "Symbolic links cannot be hashed as pack content.".to_string(),
            ));
        }
        if entry.file_type().is_file() {
            reject_link_or_reparse(entry.path(), "pack file")?;
            let relative = entry.path().strip_prefix(root).map_err(|_| {
                BackendError::Security("Pack file escaped its root while hashing.".to_string())
            })?;
            let normalized = path_to_forward_slashes(relative)?;
            if utf16_len(&normalized) > MAX_PACK_PATH_CHARS {
                return Err(BackendError::Security(
                    "A pack entry path exceeds the 512-character safety limit.".to_string(),
                ));
            }
            let file_bytes = entry.metadata()?.len();
            if file_bytes > MAX_PACK_FILE_BYTES {
                return Err(BackendError::InvalidInput(
                    "A pack file exceeds the per-file safety limit.".to_string(),
                ));
            }
            file_count = file_count.saturating_add(1);
            total_bytes = total_bytes.saturating_add(file_bytes);
            if file_count > MAX_PACK_FILES || total_bytes > MAX_PACK_BYTES {
                return Err(BackendError::InvalidInput(
                    "The pack exceeds the safe file-count or total-size limit.".to_string(),
                ));
            }
            files.push(entry.path().to_path_buf());
        }
    }
    files.sort_by_key(|path| path_to_forward_slashes(path.strip_prefix(root).unwrap()).ok());

    let mut digest = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    for path in files {
        let relative = path.strip_prefix(root).map_err(|_| {
            BackendError::Security("Pack file escaped its root while hashing.".to_string())
        })?;
        let normalized = path_to_forward_slashes(relative)?;
        digest.update(normalized.as_bytes());
        digest.update([0u8]);
        digest.update(fs::metadata(&path)?.len().to_le_bytes());
        let mut reader = BufReader::new(File::open(path)?);
        loop {
            let count = reader.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            digest.update(&buffer[..count]);
        }
        digest.update([0xffu8]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn hash_file(path: &Path) -> Result<String> {
    let mut digest = Sha256::new();
    let mut reader = BufReader::new(File::open(path)?);
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn cleanup_owned_directory(parent: &Path, target: &Path) {
    let safe = target.parent() == Some(parent)
        && target
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(".install-") || valid_pack_id(name));
    if safe && target.is_dir() && reject_link_or_reparse(target, "install cleanup target").is_ok() {
        let _ = fs::remove_dir_all(target);
    }
}

fn issue(code: &str, message: &str, path: Option<&str>) -> ValidationIssue {
    ValidationIssue {
        code: code.to_string(),
        message: message.to_string(),
        path: path.map(ToOwned::to_owned),
    }
}

fn report(
    errors: Vec<ValidationIssue>,
    warnings: Vec<ValidationIssue>,
    manifest: Option<PackManifest>,
    media_references: BTreeSet<String>,
    source_hash: Option<String>,
) -> PackValidationReport {
    PackValidationReport {
        valid: errors.is_empty(),
        errors,
        warnings,
        manifest,
        media_references: media_references.into_iter().collect(),
        source_hash,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage;

    fn write_valid_pack(root: &Path) {
        for &(relative_path, bytes) in EMBEDDED_DEMO_FILES {
            let target = root.join(relative_path);
            fs::create_dir_all(target.parent().unwrap()).unwrap();
            fs::write(target, bytes).unwrap();
        }
    }

    fn read_fixture_json(root: &Path, relative_path: &str) -> Value {
        serde_json::from_slice(&fs::read(root.join(relative_path)).unwrap()).unwrap()
    }

    fn write_fixture_json(root: &Path, relative_path: &str, value: &Value) {
        fs::write(
            root.join(relative_path),
            serde_json::to_vec_pretty(value).unwrap(),
        )
        .unwrap();
    }

    fn structured_context(question_id: &str) -> Value {
        serde_json::json!([
            {
                "id": "demo-context-paragraph-01",
                "type": "paragraph",
                "text": "Use the complete original timetable."
            },
            {
                "id": "demo-context-list-01",
                "type": "list",
                "style": "ordered",
                "items": [
                    { "id": "demo-context-list-item-01", "text": "Read the row label." }
                ]
            },
            {
                "id": "demo-context-table-01",
                "type": "table",
                "hasHeaderRow": true,
                "hasRowHeaders": true,
                "rows": [
                    {
                        "id": "demo-context-row-head",
                        "cells": [
                            { "id": "demo-context-cell-head-01", "text": "Route" },
                            { "id": "demo-context-cell-head-02", "text": "Power" }
                        ]
                    },
                    {
                        "id": "demo-context-row-body",
                        "cells": [
                            { "id": "demo-context-cell-label", "text": "Cabinets" },
                            {
                                "id": "demo-context-cell-answer",
                                "text": "Complete this cell",
                                "questionId": question_id
                            }
                        ]
                    }
                ]
            }
        ])
    }

    #[test]
    fn generated_visual_images_install_and_survive_reopen_with_checked_references() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::initialize(root.path().join("workspace").to_str().unwrap()).unwrap();
        storage::initialize_database(&workspace.database_path()).unwrap();
        let connection = storage::open_database(&workspace.database_path()).unwrap();
        let source = root.path().join("source");
        write_valid_pack(&source);
        let mut manifest = read_fixture_json(&source, "manifest.json");
        let mut reading = read_fixture_json(&source, "modules/reading.json");
        let mut bytes = Vec::new();
        { let mut encoder = png::Encoder::new(&mut bytes, 2, 2); encoder.set_color(png::ColorType::Rgb); encoder.set_depth(png::BitDepth::Eight); encoder.write_header().unwrap().write_image_data(&[180; 12]).unwrap(); }
        let asset = crate::import_images::save(&workspace, "draft-native-test", &STANDARD.encode(&bytes)).unwrap();
        manifest["modules"] = serde_json::json!(["reading"]);
        manifest["tests"][0]["moduleIds"] = serde_json::json!([reading["id"]]);
        manifest["mediaAssets"] = serde_json::json!([{"id":asset.id,"type":"image","relativePath":asset.relative_path,"mimeType":"image/png","alt":"Original test crop","width":2,"height":2,"sha256":asset.sha256}]);
        reading["schemaVersion"] = Value::from(4);
        let visual = serde_json::json!({"type":"snapshot","assetId":asset.id,"sourcePage":1,"altText":"Original table","crop":{"x":0.0,"y":0.0,"width":1.0,"height":1.0}});
        reading["sections"][0]["contentBlocks"][0]["visual"] = visual.clone();
        let mut context = visual.clone(); context["id"] = Value::from("test-visual-context");
        reading["sections"][0]["questionGroups"][0]["contextBlocks"] = serde_json::json!([context]);
        let pack = serde_json::json!({"manifest":manifest,"modules":[reading]});
        assert!(install_generated_pack(&workspace, &connection, pack.clone(), None).is_err());
        assert!(install_generated_pack(&workspace, &connection, pack.clone(), Some("wrong-draft")).is_err());
        let mut missing = pack.clone(); missing["modules"][0]["sections"][0]["contentBlocks"][0]["visual"]["assetId"] = Value::from("missing-asset");
        assert!(install_generated_pack(&workspace, &connection, missing, Some("draft-native-test")).is_err());
        let mut old_version = pack.clone(); old_version["modules"][0]["schemaVersion"] = Value::from(3);
        assert!(install_generated_pack(&workspace, &connection, old_version, Some("draft-native-test")).is_err());
        let installed = install_generated_pack(&workspace, &connection, pack, Some("draft-native-test")).unwrap();
        drop(connection);
        let reopened = Workspace::open(workspace.root().to_str().unwrap()).unwrap();
        assert_eq!(fs::read(reopened.root().join("packs").join(&installed.id).join(&asset.relative_path)).unwrap(), bytes);
        let report = validate_pack_folder(reopened.root().join("packs").join(&installed.id).to_str().unwrap());
        assert!(report.valid, "{:?}", report.errors);
    }

    #[test]
    fn validates_and_hashes_an_original_pack() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(report.valid, "{:?}", report.errors);
        assert!(report.source_hash.is_some());
        assert_eq!(
            report.media_references,
            vec![
                "media/audio/original-demo-silence.wav",
                "media/audio/original-demo-tones.wav",
                "media/images/original-workshop-attendance.png",
            ]
        );
    }

    #[test]
    fn validates_the_complete_original_reading_v3_sample() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("samples")
            .join("original-daily-reading-pack");
        let module_json = fs::read_to_string(path.join("modules/reading.json")).unwrap();
        serde_json::from_str::<PackModuleV1>(&module_json)
            .expect("the complete sample must deserialize as a native Reading module");
        let report = validate_pack_folder(path.to_str().unwrap());
        assert!(report.valid, "{:?}", report.errors);
        assert!(report.source_hash.is_some());
        assert!(report.media_references.is_empty());
    }

    #[test]
    fn accepts_a_legacy_reading_question_without_an_explicit_number() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut reading = read_fixture_json(&pack, "modules/reading.json");
        reading["sections"][0]["questionGroups"][0]["questions"][1]
            .as_object_mut()
            .unwrap()
            .remove("number");
        write_fixture_json(&pack, "modules/reading.json", &reading);

        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(report.valid, "{:?}", report.errors);
    }

    #[test]
    fn accepts_reading_v2_context_and_owns_stable_nested_annotation_ids() {
        let temp = tempfile::tempdir().unwrap();
        let workspace_path = temp.path().join("workspace");
        let workspace = Workspace::initialize(workspace_path.to_str().unwrap()).unwrap();
        storage::initialize_database(&workspace.database_path()).unwrap();
        let connection = storage::open_database(&workspace.database_path()).unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut reading = read_fixture_json(&pack, "modules/reading.json");
        reading["schemaVersion"] = Value::from(2);
        reading["sections"][0]["questionGroups"][1]["contextBlocks"] =
            structured_context("demo-reading-q05");
        write_fixture_json(&pack, "modules/reading.json", &reading);

        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(report.valid, "{:?}", report.errors);
        install_pack(&workspace, &connection, pack.to_str().unwrap()).unwrap();
        ensure_installed_content_block_id(
            &workspace,
            &connection,
            "original-demo-pack",
            "demo-test-01",
            "reading",
            "demo-context-cell-answer",
        )
        .unwrap();
        ensure_installed_content_block_id(
            &workspace,
            &connection,
            "original-demo-pack",
            "demo-test-01",
            "reading",
            "demo-context-list-item-01",
        )
        .unwrap();
    }

    #[test]
    fn rejects_structured_context_in_reading_v1() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut reading = read_fixture_json(&pack, "modules/reading.json");
        reading["sections"][0]["questionGroups"][1]["contextBlocks"] =
            structured_context("demo-reading-q05");
        write_fixture_json(&pack, "modules/reading.json", &reading);

        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "STRUCTURED_CONTEXT_REQUIRES_READING_V2"));
    }

    #[test]
    fn rejects_cross_group_and_duplicate_table_bindings_in_reading_v2() {
        let temp = tempfile::tempdir().unwrap();
        let cross_group_pack = temp.path().join("cross-group-pack");
        write_valid_pack(&cross_group_pack);
        let mut reading = read_fixture_json(&cross_group_pack, "modules/reading.json");
        reading["schemaVersion"] = Value::from(2);
        reading["sections"][0]["questionGroups"][1]["contextBlocks"] =
            structured_context("demo-reading-q01");
        write_fixture_json(&cross_group_pack, "modules/reading.json", &reading);

        let cross_group_report = validate_pack_folder(cross_group_pack.to_str().unwrap());
        assert!(!cross_group_report.valid);
        assert!(cross_group_report
            .errors
            .iter()
            .any(|error| error.code == "QUESTION_CONTEXT_REFERENCE_INVALID"));

        let duplicate_pack = temp.path().join("duplicate-pack");
        write_valid_pack(&duplicate_pack);
        let mut reading = read_fixture_json(&duplicate_pack, "modules/reading.json");
        reading["schemaVersion"] = Value::from(2);
        let context = structured_context("demo-reading-q05");
        reading["sections"][0]["questionGroups"][1]["contextBlocks"] = context;
        reading["sections"][0]["questionGroups"][1]["contextBlocks"]
            .as_array_mut()
            .unwrap()[2]["rows"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({
                "id": "demo-context-row-duplicate",
                "cells": [
                    { "id": "demo-context-cell-duplicate-label", "text": "Duplicate" },
                    {
                        "id": "demo-context-cell-duplicate-answer",
                        "text": "Second position",
                        "questionId": "demo-reading-q05"
                    }
                ]
            }));
        write_fixture_json(&duplicate_pack, "modules/reading.json", &reading);

        let duplicate_report = validate_pack_folder(duplicate_pack.to_str().unwrap());
        assert!(!duplicate_report.valid);
        assert!(duplicate_report
            .errors
            .iter()
            .any(|error| error.code == "QUESTION_CONTEXT_BINDING_DUPLICATE"));
    }

    #[test]
    fn still_requires_explicit_listening_question_numbers() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut listening = read_fixture_json(&pack, "modules/listening.json");
        listening["sections"][0]["questionGroups"][0]["questions"][0]
            .as_object_mut()
            .unwrap()
            .remove("number");
        write_fixture_json(&pack, "modules/listening.json", &listening);

        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "MISSING_QUESTION_NUMBER"));
    }

    #[test]
    fn rejects_invalid_fill_blank_source_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut reading = read_fixture_json(&pack, "modules/reading.json");
        reading["sections"][0]["questionGroups"][1]["questions"][2]["source"] =
            serde_json::json!({
                "rawText": "",
                "sourcePages": [0],
                "sourceBlock": " ",
                "detectedType": "fill-blank",
                "needsReview": true
            });
        write_fixture_json(&pack, "modules/reading.json", &reading);

        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "INVALID_QUESTION_SOURCE"));
    }

    #[test]
    fn rejects_media_traversal() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut manifest = read_fixture_json(&pack, "manifest.json");
        manifest["mediaAssets"][0]["relativePath"] = Value::String("../outside.wav".into());
        write_fixture_json(&pack, "manifest.json", &manifest);
        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(!report.valid);
        assert!(report.errors.iter().any(|error| error.code == "INVALID_MEDIA_PATH"));
    }

    #[test]
    fn rejects_duplicate_ids_across_nested_entities() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut reading = read_fixture_json(&pack, "modules/reading.json");
        let duplicate_id = reading["sections"][0]["contentBlocks"][0]["id"].clone();
        reading["sections"][0]["contentBlocks"][1]["id"] = duplicate_id;
        write_fixture_json(&pack, "modules/reading.json", &reading);

        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "DUPLICATE_STABLE_ID"));
    }

    #[test]
    fn rejects_unknown_module_id_and_mismatched_module_test_id() {
        let temp = tempfile::tempdir().unwrap();
        let unknown_pack = temp.path().join("unknown-module");
        write_valid_pack(&unknown_pack);
        let mut manifest = read_fixture_json(&unknown_pack, "manifest.json");
        manifest["tests"][0]["moduleIds"][0] = Value::String("missing-module".into());
        write_fixture_json(&unknown_pack, "manifest.json", &manifest);
        let unknown_report = validate_pack_folder(unknown_pack.to_str().unwrap());
        assert!(!unknown_report.valid);
        assert!(unknown_report
            .errors
            .iter()
            .any(|error| error.code == "UNKNOWN_MODULE_ID"));

        let mismatch_pack = temp.path().join("mismatched-test");
        write_valid_pack(&mismatch_pack);
        let mut reading = read_fixture_json(&mismatch_pack, "modules/reading.json");
        reading["testId"] = Value::String("other-test".into());
        write_fixture_json(&mismatch_pack, "modules/reading.json", &reading);
        let mismatch_report = validate_pack_folder(mismatch_pack.to_str().unwrap());
        assert!(!mismatch_report.valid);
        assert!(mismatch_report
            .errors
            .iter()
            .any(|error| error.code == "MODULE_TEST_ID_MISMATCH"));
    }

    #[test]
    fn enforces_single_test_and_unique_module_types_in_v1() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut manifest = read_fixture_json(&pack, "manifest.json");
        let mut second_test = manifest["tests"][0].clone();
        second_test["id"] = Value::String("demo-test-02".into());
        manifest["tests"].as_array_mut().unwrap().push(second_test);
        manifest["modules"]
            .as_array_mut()
            .unwrap()
            .push(Value::String("reading".into()));
        write_fixture_json(&pack, "manifest.json", &manifest);

        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "UNSUPPORTED_TEST_COUNT"));
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "DUPLICATE_MODULE_TYPE"));
    }

    #[test]
    fn rejects_mixed_or_malformed_question_variants() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut reading = read_fixture_json(&pack, "modules/reading.json");
        reading["sections"][0]["questionGroups"][1]["questions"][0]
            ["acceptableAnswers"] = serde_json::json!(["not allowed on a single choice"]);
        write_fixture_json(&pack, "modules/reading.json", &reading);

        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "INVALID_MODULE_SCHEMA"));
    }

    #[test]
    fn rejects_bad_media_asset_reference() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut listening = read_fixture_json(&pack, "modules/listening.json");
        listening["audioAssetId"] = Value::String("missing-audio".into());
        write_fixture_json(&pack, "modules/listening.json", &listening);
        let mut writing = read_fixture_json(&pack, "modules/writing.json");
        writing["sections"][0]["tasks"][0]["imageAssetId"] =
            Value::String("demo-audio-silence-01".into());
        write_fixture_json(&pack, "modules/writing.json", &writing);

        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "INVALID_AUDIO_ASSET_REFERENCE"));
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "INVALID_IMAGE_ASSET_REFERENCE"));
    }

    #[test]
    fn rejects_invalid_declared_media_duration_and_hash() {
        let temp = tempfile::tempdir().unwrap();
        let pack = temp.path().join("pack");
        write_valid_pack(&pack);
        let mut manifest = read_fixture_json(&pack, "manifest.json");
        manifest["mediaAssets"][0]["durationMs"] = Value::from(0);
        manifest["mediaAssets"][0]["sha256"] = Value::String("0".repeat(64));
        write_fixture_json(&pack, "manifest.json", &manifest);

        let report = validate_pack_folder(pack.to_str().unwrap());
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "INVALID_MEDIA_DURATION"));
        assert!(report
            .errors
            .iter()
            .any(|error| error.code == "MEDIA_CHECKSUM_MISMATCH"));
    }

    #[test]
    fn install_and_media_read_stay_inside_workspace() {
        let temp = tempfile::tempdir().unwrap();
        let workspace_path = temp.path().join("workspace");
        let workspace = Workspace::initialize(workspace_path.to_str().unwrap()).unwrap();
        storage::initialize_database(&workspace.database_path()).unwrap();
        let connection = storage::open_database(&workspace.database_path()).unwrap();
        let source = temp.path().join("source-pack");
        write_valid_pack(&source);

        let installed = install_pack(&workspace, &connection, source.to_str().unwrap()).unwrap();
        assert_eq!(installed.id, "original-demo-pack");
        ensure_installed_session_target(
            &workspace,
            &connection,
            "original-demo-pack",
            "demo-test-01",
            "reading",
        )
        .unwrap();
        ensure_installed_question_id(
            &workspace,
            &connection,
            "original-demo-pack",
            "demo-test-01",
            "reading",
            "demo-reading-q01",
        )
        .unwrap();
        ensure_installed_content_block_id(
            &workspace,
            &connection,
            "original-demo-pack",
            "demo-test-01",
            "reading",
            "demo-reading-paragraph-01",
        )
        .unwrap();
        ensure_installed_writing_task_id(
            &workspace,
            &connection,
            "original-demo-pack",
            "demo-test-01",
            "writing",
            "demo-writing-task-01",
        )
        .unwrap();
        assert!(ensure_installed_question_id(
            &workspace,
            &connection,
            "original-demo-pack",
            "demo-test-01",
            "listening",
            "demo-reading-q01",
        )
        .is_err());
        let media = read_pack_media(
            &workspace,
            &connection,
            "original-demo-pack",
            "media/audio/original-demo-silence.wav",
        )
        .unwrap();
        assert_eq!(
            STANDARD.decode(media.base64).unwrap(),
            EMBEDDED_DEMO_FILES[4].1
        );
        assert!(read_pack_media(
            &workspace,
            &connection,
            "original-demo-pack",
            "../workspace.json"
        )
        .is_err());
        let undeclared = workspace
            .packs_dir()
            .join("original-demo-pack")
            .join("media/audio/undeclared.wav");
        fs::write(&undeclared, EMBEDDED_DEMO_FILES[4].1).unwrap();
        assert!(read_pack_media(
            &workspace,
            &connection,
            "original-demo-pack",
            "media/audio/undeclared.wav"
        )
        .is_err());
    }
}
