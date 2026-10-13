import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import {
  AnnotationStyleSchema,
  IsoUtcDateTimeSchema,
  ModuleTypeSchema,
  RelativePackPathSchema,
  StableIdSchema,
  TextAnchorSchema,
  parseIeltsPack,
  type AnnotationStyle,
  type IELTSPack,
} from "../../domain";
import {
  AnswerValueSchema,
  ImportImageSchema,
  BootstrapStateSchema,
  CreateSessionInputSchema,
  CreateWritingVersionInputSchema,
  InstalledPackSummarySchema,
  PackValidationReportSchema,
  PracticeSessionSummarySchema,
  SaveAnnotationInputSchema,
  SaveAnswerInputSchema,
  SaveWritingDraftInputSchema,
  SessionSnapshotSchema,
  SaveVocabularyItemInputSchema,
  UpdateVocabularyItemInputSchema,
  VocabularyItemSchema,
  ReviewItemSchema,
  ReviewRatingSchema,
  SaveReviewItemInputSchema,
  WorkspaceSummarySchema,
  WorkspaceBackupSummarySchema,
  ObsidianExportResultSchema,
  WritingDraftSchema,
  WritingVersionSchema,
  deriveRecentSessionId,
  sortRecentSessionSummaries,
  type AnnotationRecord,
  type AnswerRecord,
  type BootstrapState,
  type CreateSessionInput,
  type CreateWritingVersionInput,
  type InstalledPackSummary,
  type LearningRepository,
  type PackValidationReport,
  type PracticeSessionSummary,
  type SaveAnnotationInput,
  type SaveAnswerInput,
  type SaveWritingDraftInput,
  type SessionSnapshot,
  type SaveVocabularyItemInput,
  type UpdateVocabularyItemInput,
  type VocabularyItem,
  type ReviewItem,
  type ReviewRating,
  type SaveReviewItemInput,
  type WritingDraft,
  type WritingVersion,
  type WorkspaceBackupSummary,
  type ObsidianExportResult,
} from "./LearningRepository";

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

// Rust Option fields arrive as null; keep domain inputs strict and normalize only
// the known optional IPC fields. Required nulls and unknown fields still fail.
function nativeOptionalFields(value: unknown, keys: readonly string[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = { ...value } as Record<string, unknown>;
  for (const key of keys) if (record[key] === null) delete record[key];
  return record;
}
const NativeVocabularyItemSchema = z.preprocess(value => nativeOptionalFields(value, [
  "sourcePackId", "sourceTestId", "sourceModule", "sourceBlockId", "sourceBookTitle",
  "sourceTestTitle", "sourceSectionId", "sourceSectionTitle", "sourceQuestionId", "sourceQuestionNumber",
]), VocabularyItemSchema);

const RawBootstrapStateSchema = z.object({
  configured: z.boolean(),
  available: z.boolean(),
  workspacePath: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

const RawWorkspaceInfoSchema = z.object({
  workspacePath: z.string().min(1),
  workspaceId: z.string().min(1),
  createdAt: IsoUtcDateTimeSchema,
  databaseFile: z.string().min(1),
});

const RawPackManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: StableIdSchema,
  title: z.string().min(1),
  sourceLabel: z.string().min(1),
  edition: z.string().nullable().optional(),
  language: z.literal("en"),
  modules: z.array(ModuleTypeSchema),
  createdAt: IsoUtcDateTimeSchema,
  attribution: z.string().nullable().optional(),
});

const RawInstalledPackSchema = z.object({
  id: StableIdSchema,
  title: z.string().min(1),
  sourceLabel: z.string().min(1),
  edition: z.string().nullable().optional(),
  manifest: z.unknown(),
  installedAt: IsoUtcDateTimeSchema,
});

const RawAnswerRecordSchema = z.object({
  sessionId: StableIdSchema,
  questionId: StableIdSchema,
  answer: z.unknown(),
  updatedAt: IsoUtcDateTimeSchema,
});

const RawAnnotationRecordSchema = z.object({
  id: StableIdSchema,
  sessionId: StableIdSchema,
  kind: z.string().min(1),
  color: z.string().nullable().optional(),
  anchor: TextAnchorSchema,
  note: z.string().nullable().optional(),
  createdAt: IsoUtcDateTimeSchema,
  updatedAt: IsoUtcDateTimeSchema,
});

const RawPracticeSessionSchema = z.object({
  id: StableIdSchema,
  packId: StableIdSchema.nullable().optional(),
  testId: StableIdSchema.nullable().optional(),
  module: ModuleTypeSchema.nullable().optional(),
  mode: z.enum(["study", "exam", "review"]),
  status: z.enum(["in-progress", "submitted", "abandoned"]),
  startedAt: IsoUtcDateTimeSchema,
  updatedAt: IsoUtcDateTimeSchema,
  completedAt: IsoUtcDateTimeSchema.nullable().optional(),
  elapsedSeconds: z.number().int().nonnegative().safe().default(0),
});

const RawSessionSnapshotSchema = z.object({
  sessionId: StableIdSchema,
  session: RawPracticeSessionSchema.nullable().optional(),
  answers: z.array(RawAnswerRecordSchema).default([]),
  annotations: z.array(RawAnnotationRecordSchema).default([]),
});

const RawSettingRecordSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  updatedAt: IsoUtcDateTimeSchema,
});

const RawWritingDraftSchema = z.object({
  sessionId: StableIdSchema,
  taskId: StableIdSchema,
  content: z.string(),
  wordCount: z.number().int().nonnegative(),
  updatedAt: IsoUtcDateTimeSchema,
});

const RawWritingVersionSchema = z.object({
  id: StableIdSchema,
  sessionId: StableIdSchema,
  taskId: StableIdSchema,
  kind: z.enum(["manual", "submitted"]),
  content: z.string(),
  wordCount: z.number().int().nonnegative(),
  createdAt: IsoUtcDateTimeSchema,
});

const RawValidationIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().nullable().optional(),
});

const RawPackValidationReportSchema = z.object({
  valid: z.boolean(),
  errors: z.array(RawValidationIssueSchema),
  warnings: z.array(RawValidationIssueSchema).default([]),
  manifest: RawPackManifestSchema.nullable().optional(),
});

const RawPackMediaPayloadSchema = z.object({
  relativePath: z.string().min(1),
  mimeType: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  base64: z.string(),
});

function displayNameFromPath(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) ?? path;
}

function joinWorkspacePath(path: string, child: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  return `${path.replace(/[\\/]+$/, "")}${separator}${child}`;
}

function rawManifestFromRecord(record: z.infer<typeof RawInstalledPackSchema>) {
  return RawPackManifestSchema.parse(record.manifest);
}

function mapInstalledPack(recordInput: unknown): InstalledPackSummary {
  const record = RawInstalledPackSchema.parse(recordInput);
  const manifest = rawManifestFromRecord(record);
  return InstalledPackSummarySchema.parse({
    id: record.id,
    title: record.title,
    sourceLabel: record.sourceLabel,
    ...(record.edition == null ? {} : { edition: record.edition }),
    language: "en",
    modules: manifest.modules,
    installedAt: record.installedAt,
    ...(manifest.attribution == null ? {} : { attribution: manifest.attribution }),
  });
}

function styleToBackend(style: AnnotationStyle): { kind: string; color: string | null } {
  if (style === "underline") {
    return { kind: "underline", color: null };
  }
  return { kind: "highlight", color: style.replace("highlight-", "") };
}

function styleFromBackend(kind: string, color?: string | null): AnnotationStyle {
  if (kind === "underline") {
    return "underline";
  }
  if (kind === "highlight" && color) {
    return AnnotationStyleSchema.parse(`highlight-${color}`);
  }
  throw new Error(`Unsupported annotation style from native repository: ${kind}/${color ?? "none"}`);
}

function mapAnswer(input: unknown): AnswerRecord {
  const raw = RawAnswerRecordSchema.parse(input);
  return {
    id: `answer:${raw.sessionId}:${raw.questionId}`,
    sessionId: raw.sessionId,
    questionId: raw.questionId,
    value: AnswerValueSchema.parse(raw.answer),
    updatedAt: raw.updatedAt,
  };
}

function mapAnnotation(input: unknown): AnnotationRecord {
  const raw = RawAnnotationRecordSchema.parse(input);
  return {
    id: raw.id,
    sessionId: raw.sessionId,
    anchor: raw.anchor,
    style: styleFromBackend(raw.kind, raw.color),
    ...(raw.note == null ? {} : { note: raw.note }),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function mapSessionSnapshot(input: unknown): SessionSnapshot {
  const raw = RawSessionSnapshotSchema.parse(input);
  const session = raw.session;
  return SessionSnapshotSchema.parse({
    sessionId: raw.sessionId,
    ...(session?.packId == null ? {} : { packId: session.packId }),
    ...(session?.testId == null ? {} : { testId: session.testId }),
    ...(session?.module == null ? {} : { moduleType: session.module }),
    mode: session?.mode ?? "study",
    status: session?.status ?? "in-progress",
    ...(session ? { startedAt: session.startedAt, updatedAt: session.updatedAt } : {}),
    ...(session?.completedAt == null ? {} : { submittedAt: session.completedAt }),
    elapsedSeconds: session?.elapsedSeconds ?? 0,
    answers: raw.answers.map(mapAnswer),
    annotations: raw.annotations.map(mapAnnotation),
  });
}

function mapPracticeSessionSummary(input: unknown): PracticeSessionSummary {
  const raw = RawPracticeSessionSchema.parse(input);
  return PracticeSessionSummarySchema.parse({
    sessionId: raw.id,
    ...(raw.packId == null ? {} : { packId: raw.packId }),
    ...(raw.testId == null ? {} : { testId: raw.testId }),
    ...(raw.module == null ? {} : { moduleType: raw.module }),
    mode: raw.mode,
    status: raw.status,
    startedAt: raw.startedAt,
    updatedAt: raw.updatedAt,
    ...(raw.completedAt == null ? {} : { submittedAt: raw.completedAt }),
    elapsedSeconds: raw.elapsedSeconds,
  });
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export class TauriLearningRepository implements LearningRepository {
  constructor(private readonly invokeCommand: TauriInvoke = invoke) {}

  async getBootstrapState(): Promise<BootstrapState> {
    const raw = RawBootstrapStateSchema.parse(await this.invokeCommand("get_bootstrap_state"));
    const workspacePath = raw.workspacePath ?? null;
    const [installedPacks, recentSessions] = raw.available
      ? await Promise.all([this.listInstalledPacks(), this.listRecentSessions()])
      : [[], []];
    return BootstrapStateSchema.parse({
      configured: raw.configured,
      available: raw.available,
      workspace:
        workspacePath === null
          ? null
          : {
              path: workspacePath,
              ...(raw.workspaceId == null ? {} : { id: raw.workspaceId }),
              displayName: displayNameFromPath(workspacePath),
              databasePath: joinWorkspacePath(workspacePath, "ielts-workbench.sqlite3"),
            },
      error: raw.error ?? null,
      installedPacks,
      recentSessions,
      recentSessionId: deriveRecentSessionId(recentSessions),
    });
  }

  async initializeWorkspace(path: string): Promise<BootstrapState> {
    const validatedPath = z.string().trim().min(1).parse(path);
    const raw = RawWorkspaceInfoSchema.parse(
      await this.invokeCommand("initialize_workspace", { path: validatedPath }),
    );
    const workspace = WorkspaceSummarySchema.parse({
      path: raw.workspacePath,
      id: raw.workspaceId,
      displayName: displayNameFromPath(raw.workspacePath),
      databasePath: joinWorkspacePath(raw.workspacePath, raw.databaseFile),
      initializedAt: raw.createdAt,
    });
    const [installedPacks, recentSessions] = await Promise.all([
      this.listInstalledPacks(),
      this.listRecentSessions(),
    ]);
    return BootstrapStateSchema.parse({
      configured: true,
      available: true,
      workspace,
      error: null,
      installedPacks,
      recentSessions,
      recentSessionId: deriveRecentSessionId(recentSessions),
    });
  }

  async createWorkspaceBackup(destinationParent: string): Promise<WorkspaceBackupSummary> {
    const validatedPath = z.string().trim().min(1).parse(destinationParent);
    return WorkspaceBackupSummarySchema.parse(await this.invokeCommand("create_workspace_backup", {
      destinationParent: validatedPath,
    }));
  }

  async restoreWorkspaceBackup(backupPath: string, destinationParent: string): Promise<BootstrapState> {
    const validatedBackupPath = z.string().trim().min(1).parse(backupPath);
    const validatedDestination = z.string().trim().min(1).parse(destinationParent);
    RawWorkspaceInfoSchema.parse(await this.invokeCommand("restore_workspace_backup", {
      backupPath: validatedBackupPath,
      destinationParent: validatedDestination,
    }));
    return this.getBootstrapState();
  }

  async exportObsidianDailyBrief(vaultPath: string, date: string, markdown: string): Promise<ObsidianExportResult> {
    const input = z.object({
      vaultPath: z.string().trim().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
      markdown: z.string().trim().min(1).max(128 * 1024),
    }).parse({ vaultPath, date, markdown });
    return ObsidianExportResultSchema.parse(await this.invokeCommand("export_obsidian_daily_brief", input));
  }

  async listInstalledPacks(): Promise<InstalledPackSummary[]> {
    const records = z.array(z.unknown()).parse(await this.invokeCommand("list_installed_packs"));
    return records.map(mapInstalledPack);
  }

  async loadPack(packId: string): Promise<IELTSPack | null> {
    const validatedPackId = StableIdSchema.parse(packId);
    const raw = await this.invokeCommand<unknown>("load_pack", { packId: validatedPackId });
    if (raw === null) {
      return null;
    }
    return parseIeltsPack(typeof raw === "string" ? JSON.parse(raw) : raw);
  }

  async validatePackFolder(path: string): Promise<PackValidationReport> {
    const validatedPath = z.string().trim().min(1).parse(path);
    const raw = RawPackValidationReportSchema.parse(
      await this.invokeCommand("validate_pack_folder", { path: validatedPath }),
    );
    return PackValidationReportSchema.parse({
      valid: raw.valid,
      errors: raw.errors.map((issue) => ({
        path: issue.path ?? "",
        message: issue.message,
        code: issue.code,
      })),
      warnings: raw.warnings.map((issue) => ({
        path: issue.path ?? "",
        message: issue.message,
        code: issue.code,
      })),
      ...(raw.manifest == null
        ? {}
        : {
            pack: {
              id: raw.manifest.id,
              title: raw.manifest.title,
              sourceLabel: raw.manifest.sourceLabel,
              ...(raw.manifest.edition == null ? {} : { edition: raw.manifest.edition }),
              language: "en",
              modules: raw.manifest.modules,
              installedAt: raw.manifest.createdAt,
              ...(raw.manifest.attribution == null ? {} : { attribution: raw.manifest.attribution }),
            },
          }),
    });
  }

  async installPack(path: string): Promise<InstalledPackSummary> {
    const validatedPath = z.string().trim().min(1).parse(path);
    return mapInstalledPack(
      await this.invokeCommand("install_pack", { path: validatedPath }),
    );
  }

  async installImportedPack(packInput: IELTSPack, draftId?: string): Promise<InstalledPackSummary> {
    const pack = parseIeltsPack(packInput);
    return mapInstalledPack(
      await this.invokeCommand("install_generated_pack", { pack, ...(draftId ? { draftId: StableIdSchema.parse(draftId) } : {}) }),
    );
  }

  async readPackMedia(packId: string, relativePath: string): Promise<Uint8Array<ArrayBuffer>> {
    const validatedPackId = StableIdSchema.parse(packId);
    const validatedRelativePath = RelativePackPathSchema.parse(relativePath);
    const payload = RawPackMediaPayloadSchema.parse(
      await this.invokeCommand("read_pack_media", {
        packId: validatedPackId,
        relativePath: validatedRelativePath,
      }),
    );
    const bytes = decodeBase64(payload.base64);
    if (bytes.byteLength !== payload.byteLength) {
      throw new Error(
        `Native media length mismatch for ${payload.relativePath}: expected ${payload.byteLength}, received ${bytes.byteLength}`,
      );
    }
    return bytes;
  }

  async saveImportImage(draftId: string, bytes: Uint8Array<ArrayBuffer>) {
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("图片不能超过 8 MiB。");
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return ImportImageSchema.parse(await this.invokeCommand("save_import_image", { draftId: StableIdSchema.parse(draftId), base64: btoa(binary) }));
  }

  async readImportImage(draftId: string, assetId: string) {
    return decodeBase64(z.string().parse(await this.invokeCommand("read_import_image", {
      draftId: StableIdSchema.parse(draftId), assetId: StableIdSchema.parse(assetId),
    })));
  }

  async createSession(input: CreateSessionInput): Promise<SessionSnapshot> {
    const validated = CreateSessionInputSchema.parse(input);
    const rawSession = RawPracticeSessionSchema.parse(
      await this.invokeCommand("create_session", {
        input: {
          id: validated.sessionId ?? null,
          packId: validated.packId,
          testId: validated.testId,
          module: validated.moduleType,
          mode: validated.mode,
        },
      }),
    );
    return mapSessionSnapshot(
      await this.invokeCommand("load_session", { sessionId: rawSession.id }),
    );
  }

  async listRecentSessions(): Promise<PracticeSessionSummary[]> {
    const records = z.array(z.unknown()).parse(
      await this.invokeCommand("list_recent_sessions"),
    );
    return sortRecentSessionSummaries(records.map(mapPracticeSessionSummary));
  }

  async loadSession(sessionId: string): Promise<SessionSnapshot | null> {
    const raw = await this.invokeCommand<unknown>("load_session", {
      sessionId: StableIdSchema.parse(sessionId),
    });
    if (raw === null) {
      return null;
    }
    return mapSessionSnapshot(raw);
  }

  async submitSession(sessionId: string): Promise<SessionSnapshot> {
    const validatedSessionId = StableIdSchema.parse(sessionId);
    return mapSessionSnapshot(
      await this.invokeCommand("submit_session", { sessionId: validatedSessionId }),
    );
  }

  async updateSessionElapsed(sessionId: string, elapsedSeconds: number): Promise<void> {
    const validatedSessionId = StableIdSchema.parse(sessionId);
    const validatedElapsed = z.number().int().nonnegative().safe().parse(elapsedSeconds);
    RawPracticeSessionSchema.parse(await this.invokeCommand("update_session_elapsed", {
      sessionId: validatedSessionId,
      elapsedSeconds: validatedElapsed,
    }));
  }

  async saveAnswer(input: SaveAnswerInput): Promise<AnswerRecord> {
    const validated = SaveAnswerInputSchema.parse(input);
    return mapAnswer(
      await this.invokeCommand("save_answer", {
        input: {
          sessionId: validated.sessionId,
          questionId: validated.questionId,
          answer: validated.value,
        },
      }),
    );
  }

  async saveAnnotation(input: SaveAnnotationInput): Promise<AnnotationRecord> {
    const validated = SaveAnnotationInputSchema.parse(input);
    const backendStyle = styleToBackend(validated.style);
    return mapAnnotation(
      await this.invokeCommand("save_annotation", {
        input: {
          id: validated.id ?? null,
          sessionId: validated.sessionId,
          kind: backendStyle.kind,
          color: backendStyle.color,
          anchor: validated.anchor,
          note: validated.note ?? null,
        },
      }),
    );
  }

  async deleteAnnotation(annotationId: string): Promise<void> {
    await this.invokeCommand("delete_annotation", {
      annotationId: StableIdSchema.parse(annotationId),
    });
  }

  async listVocabularyItems(): Promise<VocabularyItem[]> {
    return z.array(NativeVocabularyItemSchema).parse(
      await this.invokeCommand("list_vocabulary_items"),
    );
  }

  async saveVocabularyItem(input: SaveVocabularyItemInput): Promise<VocabularyItem> {
    const validated = SaveVocabularyItemInputSchema.parse(input);
    return NativeVocabularyItemSchema.parse(
      await this.invokeCommand("save_vocabulary_item", { input: validated }),
    );
  }

  async updateVocabularyItem(input: UpdateVocabularyItemInput): Promise<VocabularyItem> {
    const validated = UpdateVocabularyItemInputSchema.parse(input);
    return NativeVocabularyItemSchema.parse(
      await this.invokeCommand("update_vocabulary_item", { input: validated }),
    );
  }

  async deleteVocabularyItem(itemId: string): Promise<void> {
    await this.invokeCommand("delete_vocabulary_item", {
      itemId: StableIdSchema.parse(itemId),
    });
  }

  async listReviewItems(): Promise<ReviewItem[]> {
    return z.array(ReviewItemSchema).parse(
      await this.invokeCommand("list_review_items"),
    );
  }

  async saveReviewItem(input: SaveReviewItemInput): Promise<ReviewItem> {
    const validated = SaveReviewItemInputSchema.parse(input);
    return ReviewItemSchema.parse(
      await this.invokeCommand("save_review_item", { input: validated }),
    );
  }

  async gradeReviewItem(itemId: string, rating: ReviewRating): Promise<ReviewItem> {
    return ReviewItemSchema.parse(
      await this.invokeCommand("grade_review_item", {
        itemId: StableIdSchema.parse(itemId),
        rating: ReviewRatingSchema.parse(rating),
      }),
    );
  }

  async getSetting(key: string): Promise<string | null> {
    const validatedKey = z.string().trim().min(1).max(256).parse(key);
    const raw = await this.invokeCommand<unknown>("get_setting", { key: validatedKey });
    if (raw === null) {
      return null;
    }
    const record = RawSettingRecordSchema.parse(raw);
    return typeof record.value === "string" ? record.value : JSON.stringify(record.value);
  }

  async setSetting(key: string, value: string): Promise<void> {
    const validatedKey = z.string().trim().min(1).max(256).parse(key);
    await this.invokeCommand("set_setting", { key: validatedKey, value });
  }

  async loadWritingDraft(sessionId: string, taskId: string): Promise<WritingDraft | null> {
    const raw = await this.invokeCommand<unknown>("load_writing_draft", {
      sessionId: StableIdSchema.parse(sessionId),
      taskId: StableIdSchema.parse(taskId),
    });
    if (raw === null) {
      return null;
    }
    return WritingDraftSchema.parse(RawWritingDraftSchema.parse(raw));
  }

  async saveWritingDraft(input: SaveWritingDraftInput): Promise<WritingDraft> {
    const validated = SaveWritingDraftInputSchema.parse(input);
    const raw = RawWritingDraftSchema.parse(
      await this.invokeCommand("save_writing_draft", { input: validated }),
    );
    return WritingDraftSchema.parse(raw);
  }

  async createWritingVersion(input: CreateWritingVersionInput): Promise<WritingVersion> {
    const validated = CreateWritingVersionInputSchema.parse(input);
    const raw = RawWritingVersionSchema.parse(
      await this.invokeCommand("create_writing_version", {
        input: {
          id: null,
          sessionId: validated.sessionId,
          taskId: validated.taskId,
          kind: validated.reason,
          content: validated.content,
        },
      }),
    );
    const { kind, ...record } = raw;
    return WritingVersionSchema.parse({ ...record, reason: kind });
  }

  async listWritingVersions(sessionId: string, taskId: string): Promise<WritingVersion[]> {
    const records = z.array(RawWritingVersionSchema).parse(
      await this.invokeCommand("list_writing_versions", {
        sessionId: StableIdSchema.parse(sessionId),
        taskId: StableIdSchema.parse(taskId),
      }),
    );
    return records.map(({ kind, ...record }) =>
      WritingVersionSchema.parse({ ...record, reason: kind }),
    );
  }
}
