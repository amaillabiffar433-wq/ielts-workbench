import { z } from "zod";

import { StableIdSchema, parseIeltsPack, type IELTSPack } from "../../domain";
import type { LearningRepository } from "../../infrastructure/repositories/LearningRepository";
import {
  PDF_IMPORT_PARSER_VERSION,
  parseAnswerKey,
  sha256Hex,
  type DetectedQuestionType,
  type ExtractedPdfPage,
} from "./pdfImportModel";

export const STRUCTURED_IMPORT_DRAFT_VERSION = 1 as const;
export const STRUCTURED_IMPORT_PARSER_VERSION = `${PDF_IMPORT_PARSER_VERSION}-structured-1`;
export const STRUCTURED_IMPORT_DRAFT_INDEX_SETTING = "pdfImport.structuredDraftIndex.v1";
export const MAX_STRUCTURED_IMPORT_DRAFT_SETTING_BYTES = 240 * 1024;

export type SupportedImportQuestionType = Exclude<DetectedQuestionType, "matching-headings" | "unsupported">;
export type StructuredImportStage = "structure" | "answers" | "preview";

const SupportedQuestionTypeSchema = z.enum([
  "single-choice",
  "true-false-not-given",
  "short-answer",
  "fill-blank",
]);
const DetectedQuestionTypeSchema = z.enum([
  "single-choice",
  "true-false-not-given",
  "short-answer",
  "fill-blank",
  "matching-headings",
  "unsupported",
]);

const SourcePageSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string(),
}).strict();

const SourceSegmentSchema = z.object({
  id: StableIdSchema,
  pageNumber: z.number().int().positive(),
  text: z.string().min(1),
  disposition: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("unassigned") }).strict(),
    z.object({ kind: z.literal("ignored") }).strict(),
    z.object({
      kind: z.literal("assigned"),
      targetKind: z.enum(["passage", "group", "question"]),
      targetId: StableIdSchema,
    }).strict(),
  ]),
}).strict();

const DraftOptionSchema = z.object({
  id: StableIdSchema,
  label: z.string().trim().min(1).max(16),
  text: z.string(),
}).strict();

const DraftQuestionSchema = z.object({
  id: StableIdSchema,
  number: z.number().int(),
  prompt: z.string(),
  type: DetectedQuestionTypeSchema,
  options: z.array(DraftOptionSchema),
  answer: z.string(),
  rawText: z.string(),
  sourcePages: z.array(z.number().int().positive()),
  sourceBlock: z.string().min(1),
  needsReview: z.boolean(),
}).strict();

const DraftGroupSchema = z.object({
  id: StableIdSchema,
  title: z.string(),
  questionType: z.union([SupportedQuestionTypeSchema, z.literal("mixed")]),
  instructions: z.string(),
  sourcePages: z.array(z.number().int().positive()),
  maxWords: z.number().int().positive().max(20).nullable(),
  sharedOptions: z.array(DraftOptionSchema),
  questions: z.array(DraftQuestionSchema),
}).strict();

const DraftContentBlockSchema = z.object({
  id: StableIdSchema,
  text: z.string(),
  sourcePages: z.array(z.number().int().positive()),
}).strict();

const DraftPassageSchema = z.object({
  id: StableIdSchema,
  title: z.string(),
  contentBlocks: z.array(DraftContentBlockSchema).min(1),
  questionGroups: z.array(DraftGroupSchema),
}).strict();

export const StructuredImportDraftSchema = z.object({
  schemaVersion: z.literal(STRUCTURED_IMPORT_DRAFT_VERSION),
  id: StableIdSchema,
  packId: StableIdSchema,
  testId: StableIdSchema,
  moduleId: StableIdSchema,
  source: z.object({
    fileName: z.string().trim().min(1),
    fileSize: z.number().int().positive(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    pageCount: z.number().int().positive(),
    pages: z.array(SourcePageSchema).min(1),
  }).strict(),
  bookTitle: z.string(),
  testNumber: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  currentStage: z.enum(["structure", "answers", "preview"]),
  initialSuggestionAppliedAt: z.string().datetime().nullable(),
  editorState: z.object({
    activePassageId: StableIdSchema.nullable(),
    activeGroupId: StableIdSchema.nullable(),
    activeQuestionId: StableIdSchema.nullable(),
    selectedSourceSegmentIds: z.array(StableIdSchema),
  }).strict(),
  passages: z.array(DraftPassageSchema),
  sourceSegments: z.array(SourceSegmentSchema),
  answerKeyText: z.string(),
  installedPackId: StableIdSchema.nullable(),
}).strict();

export type StructuredImportDraft = z.infer<typeof StructuredImportDraftSchema>;
export type StructuredSourceSegment = StructuredImportDraft["sourceSegments"][number];
export type StructuredPassageDraft = StructuredImportDraft["passages"][number];
export type StructuredGroupDraft = StructuredPassageDraft["questionGroups"][number];
export type StructuredQuestionDraft = StructuredGroupDraft["questions"][number];
export type StructuredOptionDraft = StructuredQuestionDraft["options"][number];

export interface StableIdFactory {
  (prefix: string): string;
}

export interface StructuredValidationIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface StructuredValidationReport {
  readonly valid: boolean;
  readonly errors: readonly StructuredValidationIssue[];
  readonly warnings: readonly StructuredValidationIssue[];
}

export interface StructuredAnswerApplyResult {
  readonly draft: StructuredImportDraft;
  readonly errors: readonly string[];
  readonly invalidLines: readonly string[];
  readonly appliedQuestionIds: readonly string[];
}

function defaultIdFactory(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function sourceSegments(pages: readonly ExtractedPdfPage[], idFactory: StableIdFactory): StructuredSourceSegment[] {
  return pages.flatMap((page) => page.text
    .split(/\r?\n/u)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({
      id: idFactory("source-segment"),
      pageNumber: page.pageNumber,
      text,
      disposition: { kind: "unassigned" as const },
    })));
}

export function createDraftOption(
  text: string,
  index: number,
  idFactory: StableIdFactory = defaultIdFactory,
): StructuredOptionDraft {
  const match = /^([A-H])(?:[.)])?\s+(.+)$/u.exec(text.trim());
  return {
    id: idFactory("option"),
    label: match?.[1] ?? String.fromCharCode(65 + index),
    text: match?.[2] ?? text.trim(),
  };
}

export function replaceDraftOptions(
  existing: readonly StructuredOptionDraft[],
  text: string,
  idFactory: StableIdFactory = defaultIdFactory,
): StructuredOptionDraft[] {
  return text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const parsed = createDraftOption(line, index, idFactory);
    return existing[index] ? { ...parsed, id: existing[index].id } : parsed;
  });
}

export function createStructuredQuestion(
  partial: Partial<StructuredQuestionDraft> = {},
  idFactory: StableIdFactory = defaultIdFactory,
): StructuredQuestionDraft {
  const id = partial.id ?? idFactory("question");
  return {
    id,
    number: partial.number ?? 1,
    prompt: partial.prompt ?? "",
    type: partial.type ?? "short-answer",
    options: partial.options?.map((option) => ({ ...option })) ?? [],
    answer: partial.answer ?? "",
    rawText: partial.rawText ?? partial.prompt ?? "",
    sourcePages: uniqueNumbers(partial.sourcePages ?? []),
    sourceBlock: partial.sourceBlock ?? `manual:${id}`,
    needsReview: partial.needsReview ?? true,
  };
}

export function createStructuredGroup(
  partial: Partial<StructuredGroupDraft> = {},
  idFactory: StableIdFactory = defaultIdFactory,
): StructuredGroupDraft {
  return {
    id: partial.id ?? idFactory("question-group"),
    title: partial.title ?? "New question group",
    questionType: partial.questionType ?? "short-answer",
    instructions: partial.instructions ?? "Review the instructions for this group.",
    sourcePages: uniqueNumbers(partial.sourcePages ?? []),
    maxWords: partial.maxWords ?? null,
    sharedOptions: partial.sharedOptions?.map((option) => ({ ...option })) ?? [],
    questions: partial.questions?.map((question) => createStructuredQuestion(question, idFactory)) ?? [],
  };
}

export function createStructuredPassage(
  number: number,
  idFactory: StableIdFactory = defaultIdFactory,
): StructuredPassageDraft {
  const id = idFactory("passage");
  return {
    id,
    title: `Reading Passage ${number}`,
    contentBlocks: [{ id: idFactory("content-block"), text: "", sourcePages: [] }],
    questionGroups: [createStructuredGroup({}, idFactory)],
  };
}

export function createStructuredImportDraft(
  source: {
    readonly fileName: string;
    readonly fileSize: number;
    readonly sourceSha256: string;
    readonly pageCount: number;
    readonly pages: readonly ExtractedPdfPage[];
  },
  idFactory: StableIdFactory = defaultIdFactory,
  createdAt = nowIso(),
): StructuredImportDraft {
  const identity = idFactory("pdf-structured");
  const suffix = identity.replace(/[^A-Za-z0-9]/g, "").slice(-12).toLocaleLowerCase();
  const packId = `pdf-reading-${source.sourceSha256.slice(0, 10)}-${suffix}`;
  const firstPassage = createStructuredPassage(1, idFactory);
  return StructuredImportDraftSchema.parse({
    schemaVersion: STRUCTURED_IMPORT_DRAFT_VERSION,
    id: identity,
    packId,
    testId: `${packId}-test`,
    moduleId: `${packId}-reading`,
    source: {
      ...source,
      pages: source.pages.map((page) => ({ ...page })),
    },
    bookTitle: source.fileName.replace(/\.pdf$/iu, "") || "Local Reading PDF",
    testNumber: "1",
    createdAt,
    updatedAt: createdAt,
    currentStage: "structure",
    initialSuggestionAppliedAt: null,
    editorState: {
      activePassageId: firstPassage.id,
      activeGroupId: firstPassage.questionGroups[0].id,
      activeQuestionId: null,
      selectedSourceSegmentIds: [],
    },
    passages: [firstPassage],
    sourceSegments: sourceSegments(source.pages, idFactory),
    answerKeyText: "",
    installedPackId: null,
  });
}

export function touchStructuredDraft(
  draft: StructuredImportDraft,
  update: Partial<Omit<StructuredImportDraft, "schemaVersion" | "id" | "createdAt">>,
  updatedAt = nowIso(),
): StructuredImportDraft {
  return StructuredImportDraftSchema.parse({ ...draft, ...update, updatedAt });
}

function suggestedQuestionType(text: string): StructuredGroupDraft["questionType"] {
  const normalized = text.toLocaleUpperCase();
  if (normalized.includes("TRUE FALSE") || normalized.includes("NOT GIVEN")) return "true-false-not-given";
  if (normalized.includes("MULTIPLE CHOICE") || normalized.includes("CHOOSE")) return "single-choice";
  if (normalized.includes("SENTENCE COMPLETION") || normalized.includes("FILL")) return "fill-blank";
  return "short-answer";
}

function suggestedMaxWords(text: string): number | null {
  const match = /NO MORE THAN\s+(ONE|TWO|THREE|FOUR|FIVE|\d+)\s+WORDS?/iu.exec(text);
  if (!match) return null;
  const words: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return words[match[1].toLocaleUpperCase()] ?? Number(match[1]);
}

function suggestedSharedOptions(text: string, idFactory: StableIdFactory): StructuredOptionDraft[] {
  const match = /Shared options:\s*(.+)$/iu.exec(text);
  if (!match) return [];
  return match[1].split(/\s*;\s*/u).map((option, index) => createDraftOption(option, index, idFactory));
}

/**
 * Produces an editable first suggestion from conventional IELTS headings. It
 * deliberately leaves uncertain lines unassigned for explicit human action.
 * Running it twice is blocked so already-created stable IDs cannot drift.
 */
export function suggestStructuredImportDraft(
  draft: StructuredImportDraft,
  idFactory: StableIdFactory = defaultIdFactory,
  appliedAt = nowIso(),
): StructuredImportDraft {
  if (draft.initialSuggestionAppliedAt) {
    throw new Error("初始结构建议已经生成；为保护稳定 ID，不能在同一草稿中重新生成。请继续人工编辑。 ");
  }
  const passages: StructuredPassageDraft[] = [];
  const byNumber = new Map<number, StructuredPassageDraft>();
  const sourceSegments: StructuredSourceSegment[] = draft.sourceSegments.map((segment) => ({
    ...segment,
    disposition: { kind: "unassigned" as const },
  }));
  let currentPassage: StructuredPassageDraft | null = null;
  let currentGroup: StructuredGroupDraft | null = null;
  let currentQuestion: StructuredQuestionDraft | null = null;
  let expectingPassageTitle = false;

  const mark = (segmentId: string, kind: "passage" | "group" | "question", targetId: string) => {
    const segment = sourceSegments.find((item) => item.id === segmentId);
    if (segment) segment.disposition = { kind: "assigned", targetKind: kind, targetId };
  };

  for (const segment of sourceSegments) {
    const passageMatch = /^READING PASSAGE\s+(\d+)\b(.*)$/iu.exec(segment.text);
    if (passageMatch) {
      const passageNumber = Number(passageMatch[1]);
      currentPassage = byNumber.get(passageNumber) ?? createStructuredPassage(passageNumber, idFactory);
      if (!byNumber.has(passageNumber)) {
        currentPassage.questionGroups = [];
        passages.push(currentPassage);
        byNumber.set(passageNumber, currentPassage);
      }
      currentGroup = null;
      currentQuestion = null;
      expectingPassageTitle = passageMatch[2].trim() === "";
      mark(segment.id, "passage", currentPassage.id);
      continue;
    }
    if (!currentPassage) {
      continue;
    }
    if (expectingPassageTitle) {
      currentPassage.title = segment.text;
      expectingPassageTitle = false;
      mark(segment.id, "passage", currentPassage.id);
      continue;
    }
    if (/^Questions?\s+\d+/iu.test(segment.text)) {
      currentGroup = createStructuredGroup({
        title: segment.text,
        questionType: suggestedQuestionType(segment.text),
        instructions: "",
        sourcePages: [segment.pageNumber],
        questions: [],
      }, idFactory);
      currentPassage.questionGroups.push(currentGroup);
      currentQuestion = null;
      mark(segment.id, "group", currentGroup.id);
      continue;
    }
    if (currentGroup) {
      const questionMatch = /^(\d{1,3})(?:[.)])?\s+(.+)$/u.exec(segment.text);
      if (questionMatch) {
        currentQuestion = createStructuredQuestion({
          number: Number(questionMatch[1]),
          prompt: questionMatch[2],
          type: currentGroup.questionType === "mixed" ? "short-answer" : currentGroup.questionType,
          rawText: segment.text,
          sourcePages: [segment.pageNumber],
          sourceBlock: segment.id,
          needsReview: true,
        }, idFactory);
        currentGroup.questions.push(currentQuestion);
        mark(segment.id, "question", currentQuestion.id);
        continue;
      }
      if (currentGroup.questions.length === 0) {
        currentGroup.instructions = [currentGroup.instructions, segment.text].filter(Boolean).join("\n");
        currentGroup.sourcePages = uniqueNumbers([...currentGroup.sourcePages, segment.pageNumber]);
        currentGroup.maxWords ??= suggestedMaxWords(segment.text);
        const options = suggestedSharedOptions(segment.text, idFactory);
        if (options.length > 0) currentGroup.sharedOptions = options;
        mark(segment.id, "group", currentGroup.id);
        continue;
      }
      const optionMatch = /^([A-H])(?:[.)])?\s+(.+)$/u.exec(segment.text);
      if (optionMatch && currentQuestion?.type === "single-choice") {
        currentQuestion.options.push(createDraftOption(segment.text, currentQuestion.options.length, idFactory));
        currentQuestion.rawText = [currentQuestion.rawText, segment.text].join("\n");
        currentQuestion.sourcePages = uniqueNumbers([...currentQuestion.sourcePages, segment.pageNumber]);
        mark(segment.id, "question", currentQuestion.id);
      }
      continue;
    }
    const block = currentPassage.contentBlocks[0];
    block.text = [block.text, segment.text].filter(Boolean).join("\n");
    block.sourcePages = uniqueNumbers([...block.sourcePages, segment.pageNumber]);
    mark(segment.id, "passage", currentPassage.id);
  }

  if (passages.length === 0) throw new Error("没有识别到 READING PASSAGE 标题；请保留空白草稿并手工建立 Passage。");
  const firstPassage = passages[0];
  return touchStructuredDraft(draft, {
    passages,
    sourceSegments,
    initialSuggestionAppliedAt: appliedAt,
    editorState: {
      activePassageId: firstPassage.id,
      activeGroupId: firstPassage.questionGroups[0]?.id ?? null,
      activeQuestionId: firstPassage.questionGroups[0]?.questions[0]?.id ?? null,
      selectedSourceSegmentIds: [],
    },
  }, appliedAt);
}

export function moveArrayItem<T>(values: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= values.length || toIndex < 0 || toIndex >= values.length) {
    return [...values];
  }
  const next = [...values];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function moveQuestionBetweenGroups(
  draft: StructuredImportDraft,
  questionId: string,
  targetGroupId: string,
): StructuredImportDraft {
  let selected: StructuredQuestionDraft | null = null;
  const withoutQuestion = draft.passages.map((passage) => ({
    ...passage,
    questionGroups: passage.questionGroups.map((group) => ({
      ...group,
      questions: group.questions.filter((question) => {
        if (question.id === questionId) selected = question;
        return question.id !== questionId;
      }),
    })),
  }));
  if (!selected) return draft;
  let targetFound = false;
  const passages = withoutQuestion.map((passage) => ({
    ...passage,
    questionGroups: passage.questionGroups.map((group) => {
      if (group.id !== targetGroupId) return group;
      targetFound = true;
      return { ...group, questions: [...group.questions, selected!] };
    }),
  }));
  return targetFound ? touchStructuredDraft(draft, { passages }) : draft;
}

export function moveGroupBetweenPassages(
  draft: StructuredImportDraft,
  groupId: string,
  targetPassageId: string,
): StructuredImportDraft {
  let selected: StructuredGroupDraft | null = null;
  const withoutGroup = draft.passages.map((passage) => ({
    ...passage,
    questionGroups: passage.questionGroups.filter((group) => {
      if (group.id === groupId) selected = group;
      return group.id !== groupId;
    }),
  }));
  if (!selected) return draft;
  let targetFound = false;
  const passages = withoutGroup.map((passage) => {
    if (passage.id !== targetPassageId) return passage;
    targetFound = true;
    return { ...passage, questionGroups: [...passage.questionGroups, selected!] };
  });
  return targetFound ? touchStructuredDraft(draft, { passages }) : draft;
}

export function verifyStructuredDraftSource(
  draft: StructuredImportDraft,
  candidate: { readonly sourceSha256: string; readonly fileSize: number; readonly pageCount: number },
): string | null {
  if (candidate.sourceSha256 !== draft.source.sourceSha256) {
    return `所选文件 SHA-256 不匹配。草稿来源为 ${draft.source.sourceSha256.slice(0, 12)}…，本次选择为 ${candidate.sourceSha256.slice(0, 12)}…。`;
  }
  if (candidate.fileSize !== draft.source.fileSize || candidate.pageCount !== draft.source.pageCount) {
    return "来源 SHA-256 虽匹配，但文件大小或页数元数据不一致；为避免覆盖来源快照，已拒绝绑定。";
  }
  return null;
}

export function assignSourceSegments(
  draft: StructuredImportDraft,
  segmentIds: readonly string[],
  target: { readonly kind: "passage" | "group" | "question"; readonly id: string },
): StructuredImportDraft {
  const selected = draft.sourceSegments.filter((segment) => segmentIds.includes(segment.id));
  if (selected.length === 0) return draft;
  const text = selected.map((segment) => segment.text).join("\n");
  const pages = uniqueNumbers(selected.map((segment) => segment.pageNumber));
  let targetFound = false;
  const passages = draft.passages.map((passage) => {
    if (target.kind === "passage" && passage.id === target.id) {
      targetFound = true;
      const block = passage.contentBlocks[0];
      return {
        ...passage,
        contentBlocks: [{
          ...block,
          text: [block.text.trim(), text].filter(Boolean).join("\n"),
          sourcePages: uniqueNumbers([...block.sourcePages, ...pages]),
        }, ...passage.contentBlocks.slice(1)],
      };
    }
    return {
      ...passage,
      questionGroups: passage.questionGroups.map((group) => {
        if (target.kind === "group" && group.id === target.id) {
          targetFound = true;
          return {
            ...group,
            instructions: [group.instructions.trim(), text].filter(Boolean).join("\n"),
            sourcePages: uniqueNumbers([...group.sourcePages, ...pages]),
          };
        }
        return {
          ...group,
          questions: group.questions.map((question) => {
            if (target.kind !== "question" || question.id !== target.id) return question;
            targetFound = true;
            return {
              ...question,
              prompt: [question.prompt.trim(), text].filter(Boolean).join(" "),
              rawText: [question.rawText.trim(), text].filter(Boolean).join("\n"),
              sourcePages: uniqueNumbers([...question.sourcePages, ...pages]),
            };
          }),
        };
      }),
    };
  });
  if (!targetFound) return draft;
  const idSet = new Set(segmentIds);
  return touchStructuredDraft(draft, {
    passages,
    sourceSegments: draft.sourceSegments.map((segment) => idSet.has(segment.id)
      ? { ...segment, disposition: { kind: "assigned", targetKind: target.kind, targetId: target.id } }
      : segment),
  });
}

export function ignoreSourceSegments(
  draft: StructuredImportDraft,
  segmentIds: readonly string[],
): StructuredImportDraft {
  const ids = new Set(segmentIds);
  return touchStructuredDraft(draft, {
    sourceSegments: draft.sourceSegments.map((segment) => ids.has(segment.id)
      ? { ...segment, disposition: { kind: "ignored" } }
      : segment),
  });
}

export function applyStructuredAnswerKey(
  draft: StructuredImportDraft,
  answerText: string,
): StructuredAnswerApplyResult {
  const parsed = parseAnswerKey(answerText);
  const answerLines = answerText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const answerNumbers = answerLines.flatMap((line) => {
    const match = /^(\d{1,3})\s*(?:[.):-]\s*|\s+)/u.exec(line);
    return match ? [Number(match[1])] : [];
  });
  const duplicateAnswerNumbers = [...new Set(answerNumbers.filter((number, index) => answerNumbers.indexOf(number) !== index))];
  const questions = draft.passages.flatMap((passage) => passage.questionGroups.flatMap((group) => group.questions));
  const errors: string[] = duplicateAnswerNumbers.map((number) => `Answer Key 中 Question ${number} 出现多次。`);
  const byNumber = new Map<number, StructuredQuestionDraft[]>();
  questions.forEach((question) => byNumber.set(question.number, [...(byNumber.get(question.number) ?? []), question]));
  for (const number of Object.keys(parsed.answers).map(Number)) {
    const candidates = byNumber.get(number) ?? [];
    if (candidates.length === 0) errors.push(`Answer Key 的 Question ${number} 在当前 Reading 结构中不存在。`);
    if (candidates.length > 1) errors.push(`Question ${number} 对应 ${candidates.length} 道题，无法按题号唯一映射。`);
  }
  if (errors.length > 0 || parsed.invalidLines.length > 0) {
    return { draft, errors, invalidLines: parsed.invalidLines, appliedQuestionIds: [] };
  }
  const appliedQuestionIds: string[] = [];
  const passages = draft.passages.map((passage) => ({
    ...passage,
    questionGroups: passage.questionGroups.map((group) => ({
      ...group,
      questions: group.questions.map((question) => {
        const answer = parsed.answers[question.number];
        if (answer === undefined) return question;
        appliedQuestionIds.push(question.id);
        return { ...question, answer };
      }),
    })),
  }));
  return {
    draft: touchStructuredDraft(draft, { passages, answerKeyText: answerText }),
    errors: [],
    invalidLines: [],
    appliedQuestionIds,
  };
}

function issue(
  severity: StructuredValidationIssue["severity"],
  code: string,
  path: string,
  message: string,
): StructuredValidationIssue {
  return { severity, code, path, message };
}

export function validateStructuredImportDraft(draftInput: StructuredImportDraft): StructuredValidationReport {
  const parsed = StructuredImportDraftSchema.safeParse(draftInput);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((item) => issue(
      "error",
      "DRAFT_SCHEMA",
      item.path.join("."),
      item.message,
    ));
    return { valid: false, errors, warnings: [] };
  }
  const draft = parsed.data;
  const issues: StructuredValidationIssue[] = [];
  if (!draft.bookTitle.trim()) issues.push(issue("error", "BOOK_TITLE_REQUIRED", "bookTitle", "Book title 不能为空。"));
  if (!draft.testNumber.trim()) issues.push(issue("error", "TEST_NUMBER_REQUIRED", "testNumber", "Test number 不能为空。"));
  if (draft.passages.length === 0) issues.push(issue("error", "PASSAGE_REQUIRED", "passages", "至少需要一个 Passage。"));

  const allIds: Array<{ id: string; path: string }> = [
    { id: draft.id, path: "id" },
    { id: draft.packId, path: "packId" },
    { id: draft.testId, path: "testId" },
    { id: draft.moduleId, path: "moduleId" },
  ];
  const numberOwners = new Map<number, string[]>();
  const validTargets = new Set<string>();
  draft.passages.forEach((passage, passageIndex) => {
    const passagePath = `passages.${passageIndex}`;
    allIds.push({ id: passage.id, path: `${passagePath}.id` });
    validTargets.add(`passage:${passage.id}`);
    if (!passage.title.trim()) issues.push(issue("error", "PASSAGE_TITLE_REQUIRED", `${passagePath}.title`, `Passage ${passageIndex + 1} 缺少标题。`));
    const body = passage.contentBlocks.map((block) => block.text).join("\n").trim();
    if (!body) issues.push(issue("error", "PASSAGE_TEXT_REQUIRED", `${passagePath}.contentBlocks`, `${passage.title || `Passage ${passageIndex + 1}`} 缺少正文。`));
    passage.contentBlocks.forEach((block, blockIndex) => allIds.push({ id: block.id, path: `${passagePath}.contentBlocks.${blockIndex}.id` }));
    if (passage.questionGroups.length === 0) issues.push(issue("error", "GROUP_REQUIRED", `${passagePath}.questionGroups`, `${passage.title || `Passage ${passageIndex + 1}`} 至少需要一个题组。`));
    passage.questionGroups.forEach((group, groupIndex) => {
      const groupPath = `${passagePath}.questionGroups.${groupIndex}`;
      allIds.push({ id: group.id, path: `${groupPath}.id` });
      validTargets.add(`group:${group.id}`);
      if (!group.instructions.trim()) issues.push(issue("error", "GROUP_INSTRUCTIONS_REQUIRED", `${groupPath}.instructions`, "题组说明不能为空。"));
      if (group.questions.length === 0) issues.push(issue("error", "QUESTION_REQUIRED", `${groupPath}.questions`, `${group.title || "题组"} 至少需要一道题。`));
      group.sharedOptions.forEach((option, optionIndex) => allIds.push({ id: option.id, path: `${groupPath}.sharedOptions.${optionIndex}.id` }));
      group.questions.forEach((question, questionIndex) => {
        const questionPath = `${groupPath}.questions.${questionIndex}`;
        allIds.push({ id: question.id, path: `${questionPath}.id` });
        validTargets.add(`question:${question.id}`);
        question.options.forEach((option, optionIndex) => allIds.push({ id: option.id, path: `${questionPath}.options.${optionIndex}.id` }));
        numberOwners.set(question.number, [...(numberOwners.get(question.number) ?? []), question.id]);
        if (!Number.isInteger(question.number) || question.number < 1) issues.push(issue("error", "QUESTION_NUMBER_INVALID", `${questionPath}.number`, "题号必须是正整数。"));
        if (!question.prompt.trim()) issues.push(issue("error", "QUESTION_PROMPT_REQUIRED", `${questionPath}.prompt`, `Question ${question.number} 缺少题干。`));
        if (!SupportedQuestionTypeSchema.safeParse(question.type).success) {
          issues.push(issue("error", "QUESTION_TYPE_UNSUPPORTED", `${questionPath}.type`, `Question ${question.number} 必须人工改为当前支持的题型；不能把 ${question.type} 伪装为已结构化。`));
        }
        const options = question.options.length > 0 ? question.options : group.sharedOptions;
        if (question.type === "single-choice" && options.length < 2) issues.push(issue("error", "CHOICE_OPTIONS_REQUIRED", `${questionPath}.options`, `Question ${question.number} 至少需要两个自身或共享选项。`));
        if (question.type === "single-choice" && options.length >= 2) {
          const labels = options.map((option) => option.label.toLocaleUpperCase());
          if (new Set(labels).size !== labels.length) issues.push(issue("error", "CHOICE_LABEL_DUPLICATE", `${questionPath}.options`, `Question ${question.number} 的选项标签必须唯一。`));
          if (question.answer.trim() && !labels.includes(question.answer.trim().toLocaleUpperCase())) {
            issues.push(issue("error", "CHOICE_ANSWER_INVALID", `${questionPath}.answer`, `Question ${question.number} 的答案必须匹配一个选项标签。`));
          }
        }
        if (question.type === "true-false-not-given" && question.answer.trim() && !normalizeBooleanAnswer(question.answer)) {
          issues.push(issue("error", "TFNG_ANSWER_INVALID", `${questionPath}.answer`, `Question ${question.number} 的答案必须是 TRUE、FALSE 或 NOT GIVEN。`));
        }
        if (question.type === "fill-blank") {
          const blanks = (question.prompt.match(/\{\{blank\}\}|_{3,}|\.{3,}/gu) ?? []).length;
          if (blanks !== 1) issues.push(issue("error", "FILL_BLANK_MARKER_REQUIRED", `${questionPath}.prompt`, `Question ${question.number} 的填空题干需要且只能有一个空位标记。`));
        }
        if (question.needsReview) issues.push(issue("warning", "QUESTION_REVIEW_REQUIRED", `${questionPath}.needsReview`, `Question ${question.number} 仍标记为需要人工复核。`));
        if (!question.answer.trim()) issues.push(issue("warning", "ANSWER_UNPROVIDED", `${questionPath}.answer`, `Question ${question.number} 未提供答案，将按未评分题处理。`));
        if (question.sourcePages.length === 0) issues.push(issue("warning", "QUESTION_SOURCE_UNREFERENCED", `${questionPath}.sourcePages`, `Question ${question.number} 没有来源页引用，已视为人工新增内容。`));
      });
    });
  });

  for (const [number, owners] of numberOwners) {
    if (owners.length > 1) issues.push(issue("error", "QUESTION_NUMBER_DUPLICATE", "passages", `Question ${number} 在 Reading 模块中重复，答案映射会产生歧义。`));
  }
  const idPaths = new Map<string, string[]>();
  allIds.forEach(({ id, path }) => idPaths.set(id, [...(idPaths.get(id) ?? []), path]));
  for (const [id, paths] of idPaths) {
    if (paths.length > 1) issues.push(issue("error", "STABLE_ID_DUPLICATE", paths.join(", "), `稳定 ID ${id} 重复。`));
  }
  for (const segment of draft.sourceSegments) {
    if (segment.disposition.kind === "unassigned") {
      issues.push(issue("error", "SOURCE_SEGMENT_UNASSIGNED", `sourceSegments.${segment.id}`, `第 ${segment.pageNumber} 页仍有未分配来源片段：${segment.text.slice(0, 48)}`));
    }
    if (segment.disposition.kind === "assigned" && !validTargets.has(`${segment.disposition.targetKind}:${segment.disposition.targetId}`)) {
      issues.push(issue("error", "SOURCE_TARGET_MISSING", `sourceSegments.${segment.id}`, "来源片段指向的结构已被删除，请重新分配或明确忽略。"));
    }
  }
  const errors = issues.filter((item) => item.severity === "error");
  const warnings = issues.filter((item) => item.severity === "warning");
  return { valid: errors.length === 0, errors, warnings };
}

function answerValues(answer: string): string[] {
  return answer.trim() ? answer.split(/\s*[/|]\s*/u).filter(Boolean) : [];
}

function normalizeBooleanAnswer(answer: string): "true" | "false" | "not-given" | undefined {
  const normalized = answer.trim().toLocaleLowerCase().replace(/[\s_]+/g, "-");
  return normalized === "true" || normalized === "false" || normalized === "not-given" ? normalized : undefined;
}

function optionForQuestion(questionId: string, option: StructuredOptionDraft) {
  return { id: `${questionId}-option-${option.id}`, label: option.label, text: option.text.trim() };
}

function groupInstructions(group: StructuredGroupDraft): string {
  const lines = [group.instructions.trim()];
  if (group.maxWords) lines.push(`NO MORE THAN ${group.maxWords} WORD${group.maxWords === 1 ? "" : "S"}.`);
  if (group.sharedOptions.length > 0) {
    lines.push("Shared options:", ...group.sharedOptions.map((option) => `${option.label} ${option.text}`));
  }
  return lines.filter(Boolean).join("\n");
}

export async function createStructuredSourceDedupeKey(sourceSha256: string): Promise<string> {
  const payload = new TextEncoder().encode(`reading-pdf-structured-source:${sourceSha256}`);
  return sha256Hex(payload.buffer);
}

export async function buildStructuredReadingPack(
  draftInput: StructuredImportDraft,
  importedAt = nowIso(),
): Promise<IELTSPack> {
  const draft = StructuredImportDraftSchema.parse(draftInput);
  const validation = validateStructuredImportDraft(draft);
  if (!validation.valid) throw new Error(`结构化草稿仍有 ${validation.errors.length} 个阻塞错误。`);
  const dedupeKey = await createStructuredSourceDedupeKey(draft.source.sourceSha256);
  const sections = draft.passages.map((passage) => ({
    id: passage.id,
    title: passage.title.trim(),
    contentBlocks: passage.contentBlocks.filter((block) => block.text.trim()).map((block) => ({
      id: block.id,
      kind: "paragraph" as const,
      text: block.text.trim(),
    })),
    questionGroups: passage.questionGroups.map((group) => ({
      id: group.id,
      title: group.title.trim() || undefined,
      instructions: groupInstructions(group),
      questions: group.questions.map((question) => {
        const source = question.sourcePages.length > 0 ? {
          rawText: question.rawText.trim() || question.prompt.trim(),
          sourcePages: question.sourcePages,
          sourceBlock: question.sourceBlock,
          detectedType: question.type,
          needsReview: question.needsReview || !question.answer.trim(),
        } : undefined;
        const base = { id: question.id, number: question.number, prompt: question.prompt.trim(), points: 1, ...(source ? { source } : {}) };
        if (question.type === "single-choice") {
          const optionDrafts = question.options.length > 0 ? question.options : group.sharedOptions;
          const options = optionDrafts.map((option) => optionForQuestion(question.id, option));
          const answerLabel = question.answer.trim().toLocaleUpperCase();
          const correctOptionId = options.find((option) => option.label.toLocaleUpperCase() === answerLabel)?.id;
          return { ...base, type: "single-choice" as const, options, ...(correctOptionId ? { correctOptionId } : {}) };
        }
        if (question.type === "true-false-not-given") {
          const correctAnswer = normalizeBooleanAnswer(question.answer);
          return { ...base, type: "true-false-not-given" as const, ...(correctAnswer ? { correctAnswer } : {}) };
        }
        if (question.type === "fill-blank") {
          const sentence = question.prompt.replace(/_{3,}|\.{3,}/u, "{{blank}}");
          return { ...base, type: "fill-blank" as const, sentence, acceptableAnswers: answerValues(question.answer), ...(group.maxWords ? { maxWords: group.maxWords } : {}), caseSensitive: false };
        }
        return { ...base, type: "short-answer" as const, acceptableAnswers: answerValues(question.answer), ...(group.maxWords ? { maxWords: group.maxWords } : {}), caseSensitive: false };
      }),
    })),
  }));
  const sourcePages = draft.source.pages.map((page) => page.pageNumber);
  const sourceRange = { start: Math.min(...sourcePages), end: Math.max(...sourcePages) };
  return parseIeltsPack({
    manifest: {
      schemaVersion: 1,
      id: draft.packId,
      title: `${draft.bookTitle.trim()} · Test ${draft.testNumber.trim()}`,
      sourceLabel: "Local PDF manually confirmed structured import",
      language: "en",
      modules: ["reading"],
      createdAt: importedAt,
      tests: [{ id: draft.testId, title: `Test ${draft.testNumber.trim()}`, moduleIds: [draft.moduleId] }],
      mediaAssets: [],
      importMetadata: {
        sourceFileName: draft.source.fileName,
        sourceFileSize: draft.source.fileSize,
        sourceSha256: draft.source.sourceSha256,
        sourceFingerprint: draft.source.sourceSha256,
        bookTitle: draft.bookTitle.trim(),
        testNumber: draft.testNumber.trim(),
        module: "reading",
        passageNumber: 1,
        passagePageRange: sourceRange,
        questionPageRange: sourceRange,
        importedAt,
        extractionMode: "pdf-text-layer",
        parserVersion: STRUCTURED_IMPORT_PARSER_VERSION,
        pageNumberBase: 1,
        needsReview: draft.passages.some((passage) => passage.questionGroups.some((group) => group.questions.some((question) => question.needsReview || !question.answer.trim()))),
        dedupeKey,
      },
    },
    modules: [{
      schemaVersion: 1,
      id: draft.moduleId,
      testId: draft.testId,
      type: "reading",
      title: draft.bookTitle.trim(),
      sections,
    }],
  });
}

export async function findImportedSourceDuplicate(
  repository: LearningRepository,
  sourceSha256: string,
): Promise<IELTSPack | null> {
  const summaries = await repository.listInstalledPacks();
  for (const summary of summaries) {
    const pack = await repository.loadPack(summary.id);
    if (pack?.manifest.importMetadata?.sourceSha256 === sourceSha256) return pack;
  }
  return null;
}

const DraftIndexSchema = z.array(z.object({
  id: StableIdSchema,
  updatedAt: z.string().datetime(),
}).strict());

function draftSettingKey(draftId: string): string {
  return `pdfImport.structuredDraft.v1.${StableIdSchema.parse(draftId)}`;
}

async function loadStructuredDraftIndex(repository: LearningRepository) {
  const raw = await repository.getSetting(STRUCTURED_IMPORT_DRAFT_INDEX_SETTING);
  return raw ? DraftIndexSchema.parse(JSON.parse(raw)) : [];
}

export async function loadStructuredImportDrafts(repository: LearningRepository): Promise<StructuredImportDraft[]> {
  const index = await loadStructuredDraftIndex(repository);
  const drafts = await Promise.all(index.map(async (entry) => {
    const raw = await repository.getSetting(draftSettingKey(entry.id));
    return raw ? StructuredImportDraftSchema.parse(JSON.parse(raw)) : null;
  }));
  return drafts.filter((draft): draft is StructuredImportDraft => draft !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveStructuredImportDraft(
  repository: LearningRepository,
  draftInput: StructuredImportDraft,
): Promise<StructuredImportDraft> {
  const draft = StructuredImportDraftSchema.parse(draftInput);
  const payload = JSON.stringify(draft);
  const nativeJsonBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (nativeJsonBytes > MAX_STRUCTURED_IMPORT_DRAFT_SETTING_BYTES) {
    throw new Error(`结构化草稿为 ${nativeJsonBytes} bytes，超过工作区单条草稿 ${MAX_STRUCTURED_IMPORT_DRAFT_SETTING_BYTES} bytes 的安全上限。请缩小来源页范围后重试。`);
  }
  await repository.setSetting(draftSettingKey(draft.id), payload);
  const index = await loadStructuredDraftIndex(repository);
  const nextIndex = [{ id: draft.id, updatedAt: draft.updatedAt }, ...index.filter((item) => item.id !== draft.id)];
  await repository.setSetting(STRUCTURED_IMPORT_DRAFT_INDEX_SETTING, JSON.stringify(nextIndex));
  return draft;
}

export async function discardStructuredImportDraft(
  repository: LearningRepository,
  draftId: string,
): Promise<void> {
  const validatedId = StableIdSchema.parse(draftId);
  const index = await loadStructuredDraftIndex(repository);
  await repository.setSetting(
    STRUCTURED_IMPORT_DRAFT_INDEX_SETTING,
    JSON.stringify(index.filter((item) => item.id !== validatedId)),
  );
  await repository.setSetting(draftSettingKey(validatedId), "");
}
