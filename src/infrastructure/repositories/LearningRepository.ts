import { z } from "zod";

import {
  AnnotationStyleSchema,
  IsoUtcDateTimeSchema,
  ModuleTypeSchema,
  StableIdSchema,
  TextAnchorSchema,
  type AnnotationStyle,
  type IELTSPack,
  type TextAnchor,
} from "../../domain";

export const WorkspaceSummarySchema = z
  .object({
    path: z.string().min(1),
    id: z.string().min(1).optional(),
    displayName: z.string().min(1),
    databasePath: z.string().min(1).optional(),
    initializedAt: IsoUtcDateTimeSchema.optional(),
  })
  .strict();

export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;

export const ImportImageSchema = z.object({
  id: StableIdSchema, relativePath: z.string().regex(/^media\/images\/visual-[a-f0-9]{64}\.png$/u),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), width: z.number().int().positive().max(6000),
  height: z.number().int().positive().max(6000), byteLength: z.number().int().positive().max(8 * 1024 * 1024),
}).strict();
export type ImportImage = z.infer<typeof ImportImageSchema>;

export const WorkspaceBackupSummarySchema = z.object({
  path: z.string().min(1),
  createdAt: IsoUtcDateTimeSchema,
  sourceWorkspaceId: z.string().min(1),
  fileCount: z.number().int().nonnegative().safe(),
  totalBytes: z.number().int().nonnegative().safe(),
  databaseSha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();

export type WorkspaceBackupSummary = z.infer<typeof WorkspaceBackupSummarySchema>;

export const InstalledPackSummarySchema = z
  .object({
    id: StableIdSchema,
    title: z.string().min(1),
    sourceLabel: z.string().min(1),
    edition: z.string().min(1).optional(),
    language: z.literal("en"),
    modules: z.array(ModuleTypeSchema).min(1),
    installedAt: IsoUtcDateTimeSchema,
    attribution: z.string().min(1).optional(),
  })
  .strict();

export type InstalledPackSummary = z.infer<typeof InstalledPackSummarySchema>;

export const AnswerValueSchema = z.union([z.string(), z.array(z.string())]);
export type AnswerValue = string | readonly string[];

export const AnswerRecordSchema = z
  .object({
    id: z.string().min(1).max(512),
    sessionId: StableIdSchema,
    questionId: StableIdSchema,
    value: AnswerValueSchema,
    updatedAt: IsoUtcDateTimeSchema,
  })
  .strict();

export interface AnswerRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly questionId: string;
  readonly value: AnswerValue;
  readonly updatedAt: string;
}

export interface SaveAnswerInput {
  readonly sessionId: string;
  readonly questionId: string;
  readonly value: AnswerValue;
}

export const SaveAnswerInputSchema = z
  .object({
    sessionId: StableIdSchema,
    questionId: StableIdSchema,
    value: AnswerValueSchema,
  })
  .strict();

export const AnnotationRecordSchema = z
  .object({
    id: StableIdSchema,
    sessionId: StableIdSchema,
    anchor: TextAnchorSchema,
    style: AnnotationStyleSchema,
    note: z.string().max(500).optional(),
    createdAt: IsoUtcDateTimeSchema,
    updatedAt: IsoUtcDateTimeSchema,
  })
  .strict();

export interface AnnotationRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly anchor: TextAnchor;
  readonly style: AnnotationStyle;
  readonly note?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SaveAnnotationInput {
  readonly id?: string;
  readonly sessionId: string;
  readonly anchor: TextAnchor;
  readonly style: AnnotationStyle;
  readonly note?: string;
}

export const VocabularyLearningStateSchema = z.enum(["new", "learning", "familiar", "mastered"]);
export type VocabularyLearningState = z.infer<typeof VocabularyLearningStateSchema>;

export const VocabularyItemSchema = z.object({
  id: StableIdSchema,
  term: z.string().trim().min(1).max(160),
  normalizedTerm: z.string().trim().min(1).max(160),
  sentence: z.string().max(4_000),
  contextBefore: z.string().max(1_000),
  contextAfter: z.string().max(1_000),
  sourcePackId: StableIdSchema.optional(),
  sourceTestId: StableIdSchema.optional(),
  sourceModule: z.literal("reading").optional(),
  sourceBlockId: StableIdSchema.optional(),
  sourceBookTitle: z.string().max(300).optional(),
  sourceTestTitle: z.string().max(300).optional(),
  sourceSectionId: StableIdSchema.optional(),
  sourceSectionTitle: z.string().max(300).optional(),
  sourceQuestionId: StableIdSchema.optional(),
  sourceQuestionNumber: z.number().int().positive().optional(),
  note: z.string().max(2_000),
  learningState: VocabularyLearningStateSchema,
  createdAt: IsoUtcDateTimeSchema,
  updatedAt: IsoUtcDateTimeSchema,
}).strict();

export type VocabularyItem = z.infer<typeof VocabularyItemSchema>;

export const SaveVocabularyItemInputSchema = VocabularyItemSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({ id: StableIdSchema.optional() }).strict();
export type SaveVocabularyItemInput = z.input<typeof SaveVocabularyItemInputSchema>;

export const UpdateVocabularyItemInputSchema = z.object({
  id: StableIdSchema,
  note: z.string().max(2_000),
  learningState: VocabularyLearningStateSchema,
}).strict();
export type UpdateVocabularyItemInput = z.infer<typeof UpdateVocabularyItemInputSchema>;

export const SaveAnnotationInputSchema = z
  .object({
    id: StableIdSchema.optional(),
    sessionId: StableIdSchema,
    anchor: TextAnchorSchema,
    style: AnnotationStyleSchema,
    note: z.string().max(500).optional(),
  })
  .strict();

export const SessionSnapshotSchema = z
  .object({
    sessionId: StableIdSchema,
    packId: StableIdSchema.optional(),
    testId: StableIdSchema.optional(),
    moduleType: ModuleTypeSchema.optional(),
    mode: z.enum(["study", "exam", "review"]).default("study"),
    status: z.enum(["in-progress", "submitted", "abandoned"]).default("in-progress"),
    startedAt: IsoUtcDateTimeSchema.optional(),
    updatedAt: IsoUtcDateTimeSchema.optional(),
    submittedAt: IsoUtcDateTimeSchema.optional(),
    elapsedSeconds: z.number().int().nonnegative().safe().default(0),
    answers: z.array(AnswerRecordSchema).default([]),
    annotations: z.array(AnnotationRecordSchema).default([]),
  })
  .strict();

export interface SessionSnapshot {
  readonly sessionId: string;
  readonly packId?: string;
  readonly testId?: string;
  readonly moduleType?: "reading" | "listening" | "writing";
  readonly mode: "study" | "exam" | "review";
  readonly status: "in-progress" | "submitted" | "abandoned";
  readonly startedAt?: string;
  readonly updatedAt?: string;
  readonly submittedAt?: string;
  readonly elapsedSeconds?: number;
  readonly answers: readonly AnswerRecord[];
  readonly annotations: readonly AnnotationRecord[];
}

export interface CreateSessionInput {
  readonly sessionId?: string;
  readonly packId: string;
  readonly testId: string;
  readonly moduleType: "reading" | "listening" | "writing";
  readonly mode: "study" | "exam";
}

export const CreateSessionInputSchema = z
  .object({
    sessionId: StableIdSchema.optional(),
    packId: StableIdSchema,
    testId: StableIdSchema,
    moduleType: ModuleTypeSchema,
    mode: z.enum(["study", "exam"]),
  })
  .strict();

/**
 * Lightweight persisted session metadata used by Library and bootstrap. It
 * deliberately excludes answers, annotations, and writing content.
 */
export const PracticeSessionSummarySchema = z
  .object({
    sessionId: StableIdSchema,
    packId: StableIdSchema.optional(),
    testId: StableIdSchema.optional(),
    moduleType: ModuleTypeSchema.optional(),
    mode: z.enum(["study", "exam", "review"]),
    status: z.enum(["in-progress", "submitted", "abandoned"]),
    startedAt: IsoUtcDateTimeSchema,
    updatedAt: IsoUtcDateTimeSchema,
    submittedAt: IsoUtcDateTimeSchema.optional(),
    elapsedSeconds: z.number().int().nonnegative().safe(),
  })
  .strict();

export type PracticeSessionSummary = z.infer<typeof PracticeSessionSummarySchema>;

export function sortRecentSessionSummaries(
  summaries: readonly PracticeSessionSummary[],
): PracticeSessionSummary[] {
  return summaries
    .map((summary) => PracticeSessionSummarySchema.parse(summary))
    .sort((left, right) => {
      const updatedAtOrder = right.updatedAt.localeCompare(left.updatedAt);
      return updatedAtOrder !== 0
        ? updatedAtOrder
        : right.sessionId.localeCompare(left.sessionId);
    });
}

export function deriveRecentSessionId(
  summaries: readonly PracticeSessionSummary[],
): string | null {
  return sortRecentSessionSummaries(summaries)[0]?.sessionId ?? null;
}

export const WritingDraftSchema = z
  .object({
    sessionId: StableIdSchema,
    taskId: StableIdSchema,
    content: z.string(),
    wordCount: z.number().int().nonnegative(),
    updatedAt: IsoUtcDateTimeSchema,
  })
  .strict();

export type WritingDraft = z.infer<typeof WritingDraftSchema>;

export interface SaveWritingDraftInput {
  readonly sessionId: string;
  readonly taskId: string;
  readonly content: string;
}

export const SaveWritingDraftInputSchema = z
  .object({
    sessionId: StableIdSchema,
    taskId: StableIdSchema,
    content: z.string(),
  })
  .strict();

export const WritingVersionSchema = z
  .object({
    id: StableIdSchema,
    sessionId: StableIdSchema,
    taskId: StableIdSchema,
    content: z.string(),
    wordCount: z.number().int().nonnegative(),
    reason: z.enum(["manual", "submitted"]),
    createdAt: IsoUtcDateTimeSchema,
  })
  .strict();

export type WritingVersion = z.infer<typeof WritingVersionSchema>;

export interface CreateWritingVersionInput {
  readonly sessionId: string;
  readonly taskId: string;
  readonly content: string;
  readonly reason: "manual" | "submitted";
}

export const CreateWritingVersionInputSchema = z
  .object({
    sessionId: StableIdSchema,
    taskId: StableIdSchema,
    content: z.string(),
    reason: z.enum(["manual", "submitted"]),
  })
  .strict();

export const PackValidationIssueSchema = z
  .object({
    path: z.string(),
    message: z.string().min(1),
    code: z.string().min(1).optional(),
  })
  .strict();

export const PackValidationReportSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(PackValidationIssueSchema),
    warnings: z.array(PackValidationIssueSchema).default([]),
    pack: InstalledPackSummarySchema.optional(),
  })
  .strict();

export type PackValidationIssue = z.infer<typeof PackValidationIssueSchema>;
export type PackValidationReport = z.infer<typeof PackValidationReportSchema>;

export const BootstrapStateSchema = z
  .object({
    configured: z.boolean(),
    available: z.boolean(),
    workspace: WorkspaceSummarySchema.nullable(),
    error: z.string().nullable(),
    installedPacks: z.array(InstalledPackSummarySchema).default([]),
    recentSessions: z.array(PracticeSessionSummarySchema).default([]),
    recentSessionId: StableIdSchema.nullable().default(null),
  })
  .strict();

export type BootstrapState = z.infer<typeof BootstrapStateSchema>;

/**
 * The only persistence boundary used by React features. Immutable pack source
 * data and mutable learner state intentionally use separate methods/storage.
 */
export interface LearningRepository {
  getBootstrapState(): Promise<BootstrapState>;
  initializeWorkspace(path: string): Promise<BootstrapState>;
  createWorkspaceBackup(destinationParent: string): Promise<WorkspaceBackupSummary>;
  restoreWorkspaceBackup(backupPath: string, destinationParent: string): Promise<BootstrapState>;

  listInstalledPacks(): Promise<InstalledPackSummary[]>;
  loadPack(packId: string): Promise<IELTSPack | null>;
  validatePackFolder(path: string): Promise<PackValidationReport>;
  installPack(path: string): Promise<InstalledPackSummary>;
  installImportedPack(pack: IELTSPack, draftId?: string): Promise<InstalledPackSummary>;
  saveImportImage(draftId: string, bytes: Uint8Array<ArrayBuffer>): Promise<ImportImage>;
  readImportImage(draftId: string, assetId: string): Promise<Uint8Array<ArrayBuffer>>;
  readPackMedia(packId: string, relativePath: string): Promise<Uint8Array<ArrayBuffer>>;

  createSession(input: CreateSessionInput): Promise<SessionSnapshot>;
  listRecentSessions(): Promise<PracticeSessionSummary[]>;
  loadSession(sessionId: string): Promise<SessionSnapshot | null>;
  submitSession(sessionId: string): Promise<SessionSnapshot>;
  updateSessionElapsed(sessionId: string, elapsedSeconds: number): Promise<void>;
  saveAnswer(input: SaveAnswerInput): Promise<AnswerRecord>;
  saveAnnotation(input: SaveAnnotationInput): Promise<AnnotationRecord>;
  deleteAnnotation(annotationId: string): Promise<void>;

  listVocabularyItems(): Promise<VocabularyItem[]>;
  saveVocabularyItem(input: SaveVocabularyItemInput): Promise<VocabularyItem>;
  updateVocabularyItem(input: UpdateVocabularyItemInput): Promise<VocabularyItem>;
  deleteVocabularyItem(itemId: string): Promise<void>;

  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  loadWritingDraft(sessionId: string, taskId: string): Promise<WritingDraft | null>;
  saveWritingDraft(input: SaveWritingDraftInput): Promise<WritingDraft>;
  createWritingVersion(input: CreateWritingVersionInput): Promise<WritingVersion>;
  listWritingVersions(sessionId: string, taskId: string): Promise<WritingVersion[]>;
}
