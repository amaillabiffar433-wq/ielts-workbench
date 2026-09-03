import { parseIeltsPack, type IELTSPack } from "../../domain";
import type { LearningRepository } from "../../infrastructure/repositories/LearningRepository";

export const PDF_IMPORT_PARSER_VERSION = "reading-pdf-mvp-1";
export const MAX_RECOMMENDED_PDF_BYTES = 50 * 1024 * 1024;

export interface PageRange {
  readonly start: number;
  readonly end: number;
}

export interface ExtractedPdfPage {
  readonly pageNumber: number;
  readonly text: string;
}

export interface PdfTextFragment {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

export type DetectedQuestionType =
  | "single-choice"
  | "true-false-not-given"
  | "short-answer"
  | "fill-blank"
  | "matching-headings"
  | "unsupported";

export interface ImportedQuestionDraft {
  readonly localId: string;
  number: number;
  prompt: string;
  type: DetectedQuestionType;
  options: string[];
  answer: string;
  readonly rawText: string;
  readonly sourcePages: number[];
  readonly sourceBlock: string;
  needsReview: boolean;
}

export interface ReadingImportDraft {
  passageTitle: string;
  passageText: string;
  instructions: string;
  questions: ImportedQuestionDraft[];
}

export interface AnswerKeyParseResult {
  readonly answers: Readonly<Record<number, string>>;
  readonly invalidLines: readonly string[];
}

export interface ImportedPackBuildInput {
  readonly sourceFileName: string;
  readonly sourceFileSize: number;
  readonly sourceSha256?: string;
  readonly sourceFingerprint: string;
  readonly bookTitle: string;
  readonly testNumber: string;
  readonly passageNumber: number;
  readonly passagePageRange: PageRange;
  readonly questionPageRange: PageRange;
  readonly answerKeyPageRange?: PageRange;
  readonly importedAt: string;
  readonly dedupeKey: string;
  readonly draft: ReadingImportDraft;
}

export interface PdfFileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export interface PdfFileValidation {
  readonly valid: boolean;
  readonly error?: string;
  readonly warning?: string;
}

export function validatePdfFile(file: PdfFileLike): PdfFileValidation {
  const hasPdfExtension = file.name.toLocaleLowerCase().endsWith(".pdf");
  const hasPdfMime = file.type === "application/pdf";
  if (!hasPdfExtension && !hasPdfMime) {
    return { valid: false, error: "请选择 PDF 文件（.pdf / application/pdf）。" };
  }
  if (file.size <= 0) return { valid: false, error: "PDF 文件为空。" };
  if (file.size > MAX_RECOMMENDED_PDF_BYTES) {
    return {
      valid: true,
      warning: "文件超过 50 MB；本向导只会按需渲染页面，但文本提取仍可能较慢。",
    };
  }
  return { valid: true };
}

export function validatePageRange(range: PageRange, pageCount: number, label: string): string | null {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
    return `${label}必须使用整数页码。`;
  }
  if (range.start < 1 || range.end < 1) return `${label}从第 1 页开始。`;
  if (range.end < range.start) return `${label}结束页不能早于开始页。`;
  if (range.end > pageCount) return `${label}不能超过 PDF 的 ${pageCount} 页。`;
  return null;
}

export function mergePdfTextFragments(fragments: readonly PdfTextFragment[]): string {
  if (fragments.length === 0) return "";
  const sorted = [...fragments]
    .filter((fragment) => fragment.text.trim() !== "")
    .sort((left, right) => Math.abs(left.y - right.y) > 2 ? right.y - left.y : left.x - right.x);
  const lines: Array<{ y: number; height: number; fragments: PdfTextFragment[] }> = [];
  for (const fragment of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.y - fragment.y) <= Math.max(2, fragment.height * 0.35));
    if (line) {
      line.fragments.push(fragment);
      line.fragments.sort((left, right) => left.x - right.x);
      line.height = Math.max(line.height, fragment.height);
    } else {
      lines.push({ y: fragment.y, height: fragment.height, fragments: [fragment] });
    }
  }
  lines.sort((left, right) => right.y - left.y);
  return lines
    .map((line) => line.fragments.map((fragment) => fragment.text.trim()).join(" ").replace(/\s+/g, " "))
    .join("\n")
    .trim();
}

function questionType(instructions: string, prompt: string, options: readonly string[]): DetectedQuestionType {
  const context = `${instructions}\n${prompt}`.toLocaleUpperCase();
  if (/TRUE\s*\/\s*FALSE\s*\/\s*NOT\s+GIVEN|TRUE,?\s+FALSE\s+OR\s+NOT\s+GIVEN/.test(context)) {
    return "true-false-not-given";
  }
  if (/MATCH(?:ING)?\s+(?:EACH\s+)?HEADINGS?/.test(context)) return "matching-headings";
  if (options.length >= 2 || /CHOOSE\s+(?:THE\s+)?CORRECT/.test(context)) return "single-choice";
  if (/COMPLETE/.test(context) && /_{3,}|\.{3,}/.test(prompt)) return "fill-blank";
  if (/SHORT\s+ANSWER|NO\s+MORE\s+THAN|COMPLETE/.test(context)) return "short-answer";
  return "unsupported";
}

function normalizedLines(pages: readonly ExtractedPdfPage[]): Array<{ pageNumber: number; text: string }> {
  return pages.flatMap((page) => page.text
    .split(/\r?\n/u)
    .map((text) => ({ pageNumber: page.pageNumber, text: text.trim() }))
    .filter((line) => line.text !== ""));
}

export function detectPassageTitle(pages: readonly ExtractedPdfPage[], passageNumber: number): string {
  const lines = normalizedLines(pages);
  const headingPattern = new RegExp(`READING\\s+PASSAGE\\s+${passageNumber}\\b`, "i");
  const headingIndex = lines.findIndex((line) => headingPattern.test(line.text));
  if (headingIndex >= 0) {
    const candidate = lines.slice(headingIndex + 1).find((line) =>
      !/^questions?\b/i.test(line.text) && !/^you should spend\b/i.test(line.text),
    );
    if (candidate) return candidate.text;
  }
  return `Reading Passage ${passageNumber}`;
}

function passageBody(pages: readonly ExtractedPdfPage[], title: string, passageNumber: number): string {
  const header = new RegExp(`^READING\\s+PASSAGE\\s+${passageNumber}\\b`, "i");
  let titleRemoved = false;
  return normalizedLines(pages)
    .filter((line) => {
      if (header.test(line.text)) return false;
      if (!titleRemoved && line.text === title) {
        titleRemoved = true;
        return false;
      }
      return true;
    })
    .map((line) => line.text)
    .join("\n")
    .trim();
}

export function detectQuestions(pages: readonly ExtractedPdfPage[]): ImportedQuestionDraft[] {
  const lines = normalizedLines(pages);
  const questions: ImportedQuestionDraft[] = [];
  let instructions = "Review the extracted question text and choose an answer.";
  let current: {
    number: number;
    promptParts: string[];
    options: string[];
    raw: string[];
    pages: Set<number>;
    instruction: string;
  } | null = null;

  const finish = () => {
    if (!current) return;
    const prompt = current.promptParts.join(" ").replace(/\s+/g, " ").trim();
    const type = questionType(current.instruction, prompt, current.options);
    questions.push({
      localId: `detected-${questions.length + 1}`,
      number: current.number,
      prompt: prompt || `Question ${current.number}`,
      type,
      options: [...current.options],
      answer: "",
      rawText: current.raw.join("\n"),
      sourcePages: [...current.pages].sort((left, right) => left - right),
      sourceBlock: `question-${current.number}`,
      needsReview: type === "unsupported" || type === "matching-headings",
    });
    current = null;
  };

  for (const line of lines) {
    if (/^questions?\s+\d+/i.test(line.text)) {
      finish();
      instructions = line.text;
      continue;
    }
    if (!current && /^(choose|complete|match|do the following|write|true\b|yes\b)/i.test(line.text)) {
      instructions = `${instructions}\n${line.text}`;
      continue;
    }
    const questionMatch = /^(\d{1,3})(?:[.)])?\s+(.+)$/u.exec(line.text);
    if (questionMatch) {
      finish();
      current = {
        number: Number(questionMatch[1]),
        promptParts: [questionMatch[2]],
        options: [],
        raw: [line.text],
        pages: new Set([line.pageNumber]),
        instruction: instructions,
      };
      continue;
    }
    if (!current) continue;
    current.raw.push(line.text);
    current.pages.add(line.pageNumber);
    const optionMatch = /^([A-H])(?:[.)])?\s+(.+)$/u.exec(line.text);
    if (optionMatch) current.options.push(`${optionMatch[1]} ${optionMatch[2]}`);
    else current.promptParts.push(line.text);
  }
  finish();

  if (questions.length > 0) return questions;
  const rawText = pages.map((page) => page.text).join("\n").trim();
  return rawText
    ? [{
        localId: "detected-1",
        number: 1,
        prompt: rawText,
        type: "unsupported",
        options: [],
        answer: "",
        rawText,
        sourcePages: pages.map((page) => page.pageNumber),
        sourceBlock: "questions-raw-1",
        needsReview: true,
      }]
    : [];
}

export function createReadingImportDraft(
  passagePages: readonly ExtractedPdfPage[],
  questionPages: readonly ExtractedPdfPage[],
  passageNumber: number,
): ReadingImportDraft {
  const passageTitle = detectPassageTitle(passagePages, passageNumber);
  return {
    passageTitle,
    passageText: passageBody(passagePages, passageTitle, passageNumber),
    instructions: "Questions imported from the selected PDF pages. Review every item before use.",
    questions: detectQuestions(questionPages),
  };
}

export function parseAnswerKey(text: string): AnswerKeyParseResult {
  const answers: Record<number, string> = {};
  const invalidLines: string[] = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^(\d{1,3})\s*(?:[.):-]\s*|\s+)(.+)$/u.exec(line);
    if (!match || !match[2].trim()) {
      invalidLines.push(rawLine);
      continue;
    }
    answers[Number(match[1])] = match[2].trim();
  }
  return { answers, invalidLines };
}

export function applyAnswerKey(
  questions: readonly ImportedQuestionDraft[],
  answers: Readonly<Record<number, string>>,
): ImportedQuestionDraft[] {
  return questions.map((question) => ({
    ...question,
    options: [...question.options],
    sourcePages: [...question.sourcePages],
    answer: answers[question.number] ?? question.answer,
  }));
}

function answerValues(answer: string): string[] {
  return answer.trim() ? answer.split(/\s*[/|]\s*/u).filter(Boolean) : [];
}

function normalizeBooleanAnswer(answer: string): "true" | "false" | "not-given" | undefined {
  const normalized = answer.trim().toLocaleLowerCase().replace(/[\s_]+/g, "-");
  if (normalized === "true" || normalized === "false" || normalized === "not-given") return normalized;
  return undefined;
}

function contentBlocks(text: string, prefix: string) {
  const paragraphs = text.split(/\n{2,}/u).map((value) => value.trim()).filter(Boolean);
  const values = paragraphs.length > 0 ? paragraphs : ["No passage text was extracted; manual review is required."];
  return values.map((value, index) => ({
    id: `${prefix}-block-${index + 1}`,
    kind: index === 0 && values.length > 1 ? "paragraph" as const : "paragraph" as const,
    text: value,
  }));
}

function safeOption(questionId: string, option: string, index: number) {
  const match = /^([A-H])\s+(.+)$/u.exec(option.trim());
  return {
    id: `${questionId}-option-${(match?.[1] ?? String(index + 1)).toLocaleLowerCase()}`,
    label: match?.[1] ?? String(index + 1),
    text: match?.[2] ?? option.trim(),
  };
}

export function buildImportedReadingPack(input: ImportedPackBuildInput): IELTSPack {
  const identity = input.dedupeKey.slice(0, 16);
  const packId = `pdf-reading-${identity}`;
  const testId = `${packId}-test`;
  const moduleId = `${packId}-reading`;
  const sectionId = `${moduleId}-passage-${input.passageNumber}`;
  const questions = input.draft.questions.map((draftQuestion, index) => {
    const questionId = `${sectionId}-q-${draftQuestion.number}-${index + 1}`;
    const base = {
      id: questionId,
      number: draftQuestion.number,
      prompt: draftQuestion.prompt.trim() || `Question ${draftQuestion.number}`,
      points: 1,
      source: {
        rawText: draftQuestion.rawText || draftQuestion.prompt,
        sourcePages: draftQuestion.sourcePages,
        sourceBlock: draftQuestion.sourceBlock,
        detectedType: draftQuestion.type,
        needsReview: draftQuestion.needsReview || draftQuestion.answer.trim() === "",
      },
    };
    if (draftQuestion.type === "single-choice" && draftQuestion.options.filter((option) => option.trim()).length >= 2) {
      const options = draftQuestion.options.filter((option) => option.trim()).map((option, optionIndex) => safeOption(questionId, option, optionIndex));
      const answerLabel = draftQuestion.answer.trim().toLocaleUpperCase();
      const correctOptionId = options.find((option) => option.label.toLocaleUpperCase() === answerLabel)?.id;
      return { ...base, type: "single-choice" as const, options, ...(correctOptionId ? { correctOptionId } : {}) };
    }
    if (draftQuestion.type === "true-false-not-given") {
      const correctAnswer = normalizeBooleanAnswer(draftQuestion.answer);
      return { ...base, type: "true-false-not-given" as const, ...(correctAnswer ? { correctAnswer } : {}) };
    }
    if (draftQuestion.type === "fill-blank") {
      const sentence = /_{3,}|\.{3,}/.test(draftQuestion.prompt)
        ? draftQuestion.prompt.replace(/_{3,}|\.{3,}/, "{{blank}}")
        : `${draftQuestion.prompt} {{blank}}`;
      return { ...base, type: "fill-blank" as const, sentence, acceptableAnswers: answerValues(draftQuestion.answer), caseSensitive: false };
    }
    return { ...base, type: "short-answer" as const, acceptableAnswers: answerValues(draftQuestion.answer), caseSensitive: false };
  });

  return parseIeltsPack({
    manifest: {
      schemaVersion: 1,
      id: packId,
      title: `${input.bookTitle} · Test ${input.testNumber} · Passage ${input.passageNumber}`,
      sourceLabel: "Local PDF assisted import",
      language: "en",
      modules: ["reading"],
      createdAt: input.importedAt,
      tests: [{ id: testId, title: `Test ${input.testNumber}`, moduleIds: [moduleId] }],
      mediaAssets: [],
      importMetadata: {
        sourceFileName: input.sourceFileName,
        sourceFileSize: input.sourceFileSize,
        ...(input.sourceSha256 ? { sourceSha256: input.sourceSha256 } : {}),
        sourceFingerprint: input.sourceFingerprint,
        bookTitle: input.bookTitle,
        testNumber: input.testNumber,
        module: "reading",
        passageNumber: input.passageNumber,
        passagePageRange: input.passagePageRange,
        questionPageRange: input.questionPageRange,
        ...(input.answerKeyPageRange ? { answerKeyPageRange: input.answerKeyPageRange } : {}),
        importedAt: input.importedAt,
        extractionMode: "pdf-text-layer",
        parserVersion: PDF_IMPORT_PARSER_VERSION,
        pageNumberBase: 1,
        needsReview: input.draft.questions.some((question) => question.needsReview || !question.answer.trim()),
        dedupeKey: input.dedupeKey,
      },
    },
    modules: [{
      schemaVersion: 1,
      id: moduleId,
      testId,
      type: "reading",
      title: input.draft.passageTitle,
      sections: [{
        id: sectionId,
        title: input.draft.passageTitle,
        contentBlocks: contentBlocks(input.draft.passageText, sectionId),
        questionGroups: [{
          id: `${sectionId}-questions`,
          title: `Questions ${questions[0]?.number ?? 1}–${questions.at(-1)?.number ?? questions.length}`,
          instructions: input.draft.instructions,
          questions,
        }],
      }],
    }],
  });
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function createImportDedupeKey(
  sourceFingerprint: string,
  passagePageRange: PageRange,
  questionPageRange: PageRange,
  passageNumber: number,
): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify({
    sourceFingerprint,
    passagePageRange,
    questionPageRange,
    passageNumber,
  }));
  return sha256Hex(payload.buffer);
}

export async function findDuplicateImportedPack(
  repository: LearningRepository,
  dedupeKey: string,
): Promise<IELTSPack | null> {
  const summaries = await repository.listInstalledPacks();
  for (const summary of summaries) {
    const pack = await repository.loadPack(summary.id);
    if (pack?.manifest.importMetadata?.dedupeKey === dedupeKey) return pack;
  }
  return null;
}
