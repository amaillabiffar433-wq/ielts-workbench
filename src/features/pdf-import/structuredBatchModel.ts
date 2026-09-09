import {
  createDraftOption,
  createStructuredQuestion,
  moveQuestionBetweenGroups,
  replaceDraftOptions,
  type StableIdFactory,
  type StructuredGroupDraft,
  type StructuredImportDraft,
  type StructuredQuestionDraft,
} from "./structuredImportModel";

export type BatchPreviewIssueCode = "EMPTY_INPUT" | "UNPARSED_LINE" | "DUPLICATE_NUMBER" | "NUMBER_CONFLICT" | "EMPTY_PROMPT";

export interface BatchQuestionPreviewItem {
  readonly previewId: string;
  readonly number: number;
  readonly prompt: string;
  readonly options: readonly { readonly label: string; readonly text: string }[];
  readonly sourceLines: readonly number[];
  readonly issues: readonly BatchPreviewIssueCode[];
}

export interface BatchQuestionPreview {
  readonly items: readonly BatchQuestionPreviewItem[];
  readonly unparsedLines: readonly { readonly lineNumber: number; readonly text: string }[];
  readonly canConfirmAll: boolean;
}

export interface BatchQuestionConfirmResult {
  readonly draft: StructuredImportDraft;
  readonly addedQuestionIds: readonly string[];
  readonly errors: readonly string[];
}

export interface BatchAnswerPreviewItem {
  readonly number: number;
  readonly answer: string;
  readonly status: "matched" | "missing-question" | "ambiguous-question" | "duplicate-answer";
  readonly questionId?: string;
}

export interface BatchAnswerPreview {
  readonly items: readonly BatchAnswerPreviewItem[];
  readonly invalidLines: readonly string[];
  readonly canConfirm: boolean;
}

export interface StructuredRuleCandidate {
  readonly candidateId: string;
  readonly sourceSegmentId: string;
  readonly pageNumber: number;
  readonly kind: "passage-boundary" | "group-boundary" | "question" | "option";
  readonly reason: string;
  readonly text: string;
  readonly suggestedTargetId?: string;
}

function allQuestions(draft: StructuredImportDraft): StructuredQuestionDraft[] {
  return draft.passages.flatMap((passage) => passage.questionGroups.flatMap((group) => group.questions));
}

function changed(draft: StructuredImportDraft, passages: StructuredImportDraft["passages"]): StructuredImportDraft {
  return { ...draft, passages, updatedAt: new Date().toISOString() };
}

export function previewBatchQuestions(text: string, draft: StructuredImportDraft): BatchQuestionPreview {
  const lines = text.split(/\r?\n/u);
  const items: Array<Omit<BatchQuestionPreviewItem, "issues">> = [];
  const unparsedLines: { lineNumber: number; text: string }[] = [];
  let current: { number: number; promptParts: string[]; options: { label: string; text: string }[]; sourceLines: number[] } | null = null;

  const finish = () => {
    if (!current) return;
    items.push({
      previewId: `batch-question-${items.length + 1}`,
      number: current.number,
      prompt: current.promptParts.join(" ").trim(),
      options: current.options,
      sourceLines: current.sourceLines,
    });
    current = null;
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const questionMatch = /^(?:Question\s+)?(\d{1,3})\s*(?:[.):-]\s*|\s+)(.*)$/iu.exec(line);
    if (questionMatch) {
      finish();
      current = { number: Number(questionMatch[1]), promptParts: [questionMatch[2]], options: [], sourceLines: [index + 1] };
      return;
    }
    const optionMatch = /^([A-H])(?:[.)])?\s+(.+)$/u.exec(line);
    if (current && optionMatch) {
      current.options.push({ label: optionMatch[1], text: optionMatch[2] });
      current.sourceLines.push(index + 1);
      return;
    }
    if (current) {
      current.promptParts.push(line);
      current.sourceLines.push(index + 1);
      return;
    }
    unparsedLines.push({ lineNumber: index + 1, text: line });
  });
  finish();

  return revalidateBatchQuestionPreview(draft, items, unparsedLines);
}

export function revalidateBatchQuestionPreview(
  draft: StructuredImportDraft,
  items: readonly Omit<BatchQuestionPreviewItem, "issues">[],
  unparsedLines: BatchQuestionPreview["unparsedLines"] = [],
): BatchQuestionPreview {
  const existingNumbers = new Set(allQuestions(draft).flatMap((question) => [question.number, ...question.additionalNumbers]));
  const previewNumbers = items.map((item) => item.number);
  const result = items.map((item) => {
    const issues: BatchPreviewIssueCode[] = [];
    if (!item.prompt) issues.push("EMPTY_PROMPT");
    if (previewNumbers.filter((number) => number === item.number).length > 1) issues.push("DUPLICATE_NUMBER");
    if (existingNumbers.has(item.number)) issues.push("NUMBER_CONFLICT");
    return { ...item, issues };
  });
  return {
    items: result,
    unparsedLines,
    canConfirmAll: result.length > 0 && result.every((item) => item.issues.length === 0) && unparsedLines.length === 0,
  };
}

export function confirmBatchQuestions(
  draft: StructuredImportDraft,
  targetGroupId: string,
  preview: BatchQuestionPreview,
  acceptedPreviewIds: readonly string[],
  idFactory?: StableIdFactory,
): BatchQuestionConfirmResult {
  const groupExists = draft.passages.some((passage) => passage.questionGroups.some((group) => group.id === targetGroupId));
  if (!groupExists) return { draft, addedQuestionIds: [], errors: ["目标题组已不存在，未写入任何题目。"] };
  const accepted = new Set(acceptedPreviewIds);
  const selected = preview.items.filter((item) => accepted.has(item.previewId));
  const invalid = selected.filter((item) => item.issues.length > 0);
  if (invalid.length > 0 || selected.length === 0) {
    return { draft, addedQuestionIds: [], errors: invalid.length > 0 ? ["选中的预览含重复、冲突或空题干，未写入任何题目。"] : ["没有选择可确认的预览题目。"] };
  }
  const addedQuestionIds: string[] = [];
  const passages = draft.passages.map((passage) => ({
    ...passage,
    questionGroups: passage.questionGroups.map((group) => {
      if (group.id !== targetGroupId) return group;
      const additions = selected.map((item) => {
        const question = createStructuredQuestion({
          number: item.number,
          prompt: item.prompt,
          rawText: item.sourceLines.map((lineNumber) => `line:${lineNumber}`).join(","),
          sourceBlock: "manual:batch-paste",
          type: item.options.length >= 2 ? "single-choice" : group.questionType === "mixed" ? "short-answer" : group.questionType,
          options: item.options.map((option, index) => createDraftOption(`${option.label} ${option.text}`, index, idFactory)),
          needsReview: true,
        }, idFactory);
        addedQuestionIds.push(question.id);
        return question;
      });
      return { ...group, questions: [...group.questions, ...additions] };
    }),
  }));
  return { draft: changed(draft, passages), addedQuestionIds, errors: [] };
}

export function previewBatchAnswers(text: string, draft: StructuredImportDraft): BatchAnswerPreview {
  const questionsByNumber = new Map<number, StructuredQuestionDraft[]>();
  allQuestions(draft).forEach((question) => {
    for (const number of [question.number, ...question.additionalNumbers]) {
      questionsByNumber.set(number, [...(questionsByNumber.get(number) ?? []), question]);
    }
  });
  const seen = new Set<number>();
  const duplicateNumbers = new Set<number>();
  const invalidLines: string[] = [];
  const parsed: { number: number; answer: string }[] = [];
  text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const match = /^(\d{1,3})\s*(?:[.):-]\s*|\s+)(.+)$/u.exec(line);
    if (!match) {
      invalidLines.push(line);
      return;
    }
    const number = Number(match[1]);
    if (seen.has(number)) duplicateNumbers.add(number);
    seen.add(number);
    parsed.push({ number, answer: match[2].trim() });
  });
  const items = parsed.map(({ number, answer }): BatchAnswerPreviewItem => {
    const candidates = questionsByNumber.get(number) ?? [];
    const status = duplicateNumbers.has(number)
      ? "duplicate-answer"
      : candidates.length === 0
        ? "missing-question"
        : candidates.length > 1
          ? "ambiguous-question"
          : "matched";
    return { number, answer, status, ...(status === "matched" ? { questionId: candidates[0].id } : {}) };
  });
  return { items, invalidLines, canConfirm: items.length > 0 && invalidLines.length === 0 && items.every((item) => item.status === "matched") };
}

export function applyPreviewedAnswers(draft: StructuredImportDraft, preview: BatchAnswerPreview): StructuredImportDraft {
  if (!preview.canConfirm) return draft;
  const answers = new Map(preview.items.map((item) => [item.questionId!, item.answer]));
  return changed(draft, draft.passages.map((passage) => ({
    ...passage,
    questionGroups: passage.questionGroups.map((group) => ({
      ...group,
      questions: group.questions.map((question) => answers.has(question.id) ? { ...question, answer: answers.get(question.id)! } : question),
    })),
  })));
}

export function previewQuestionRangeAssignment(
  draft: StructuredImportDraft,
  startNumber: number,
  endNumber: number,
  targetGroupId: string,
): { readonly questionIds: readonly string[]; readonly errors: readonly string[] } {
  if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber) || startNumber < 1 || endNumber < startNumber) {
    return { questionIds: [], errors: ["题号范围无效。"] };
  }
  if (!draft.passages.some((passage) => passage.questionGroups.some((group) => group.id === targetGroupId))) {
    return { questionIds: [], errors: ["目标题组已不存在。"] };
  }
  const selected = allQuestions(draft).filter((question) => question.number >= startNumber && question.number <= endNumber);
  const numbers = new Set(selected.map((question) => question.number));
  const missing = Array.from({ length: endNumber - startNumber + 1 }, (_, index) => startNumber + index).filter((number) => !numbers.has(number));
  return { questionIds: selected.map((question) => question.id), errors: missing.length > 0 ? [`范围内缺少 Question ${missing.join(", ")}。`] : [] };
}

export function applyQuestionRangeAssignment(
  draft: StructuredImportDraft,
  preview: { readonly questionIds: readonly string[]; readonly errors: readonly string[] },
  targetGroupId: string,
): StructuredImportDraft {
  if (preview.errors.length > 0) return draft;
  return preview.questionIds.reduce((current, questionId) => moveQuestionBetweenGroups(current, questionId, targetGroupId), draft);
}

export interface GroupDefaultsInput {
  readonly questionType: StructuredGroupDraft["questionType"];
  readonly instructions: string;
  readonly maxWords: number | null;
  readonly sharedOptionsText: string;
}

export function applyGroupDefaults(
  draft: StructuredImportDraft,
  groupId: string,
  input: GroupDefaultsInput,
): StructuredImportDraft {
  return changed(draft, draft.passages.map((passage) => ({
    ...passage,
    questionGroups: passage.questionGroups.map((group) => group.id !== groupId ? group : {
      ...group,
      questionType: input.questionType,
      instructions: input.instructions,
      maxWords: input.maxWords,
      sharedOptions: replaceDraftOptions(group.sharedOptions, input.sharedOptionsText),
      questions: group.questions.map((question) => input.questionType === "mixed" ? question : {
        ...question,
        type: input.questionType,
        needsReview: true,
      }),
    }),
  })));
}

export function generateStructuredRuleCandidates(draft: StructuredImportDraft): StructuredRuleCandidate[] {
  return draft.sourceSegments.flatMap((segment): StructuredRuleCandidate[] => {
    const text = segment.text.trim();
    const base = { sourceSegmentId: segment.id, pageNumber: segment.pageNumber, text };
    if (/^(?:reading\s+)?passage\s+[1-9]/iu.test(text)) {
      const number = Number(text.match(/[1-9]/u)?.[0]);
      return [{ ...base, candidateId: `rule:${segment.id}:passage`, kind: "passage-boundary", reason: "行首出现明确 Passage 标题。", suggestedTargetId: draft.passages[number - 1]?.id }];
    }
    if (/^Questions?\s+\d+(?:\s*[-–]\s*\d+)?/iu.test(text)) {
      const start = Number(text.match(/\d+/u)?.[0]);
      const target = draft.passages.flatMap((passage) => passage.questionGroups).find((group) => group.questions.some((question) => question.number === start));
      return [{ ...base, candidateId: `rule:${segment.id}:group`, kind: "group-boundary", reason: "行首出现明确 Questions 题号或区间。", suggestedTargetId: target?.id }];
    }
    if (/^(?:Question\s+)?\d{1,3}\s*(?:[.):-]\s*|\s+)/iu.test(text)) {
      const number = Number(text.match(/\d+/u)?.[0]);
      const target = allQuestions(draft).find((question) => question.number === number);
      return [{ ...base, candidateId: `rule:${segment.id}:question`, kind: "question", reason: "行首出现明确题号。", suggestedTargetId: target?.id }];
    }
    if (/^[A-H](?:[.)])?\s+\S/u.test(text)) {
      return [{ ...base, candidateId: `rule:${segment.id}:option`, kind: "option", reason: "行首符合 A-H 选项格式。" }];
    }
    return [];
  });
}
