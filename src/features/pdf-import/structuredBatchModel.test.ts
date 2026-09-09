import { describe, expect, it } from "vitest";

import { createStructuredImportDraft, createStructuredQuestion, type StableIdFactory } from "./structuredImportModel";
import {
  applyGroupDefaults,
  applyPreviewedAnswers,
  applyQuestionRangeAssignment,
  confirmBatchQuestions,
  generateStructuredRuleCandidates,
  previewBatchAnswers,
  previewBatchQuestions,
  previewQuestionRangeAssignment,
} from "./structuredBatchModel";

function ids(): StableIdFactory {
  let next = 0;
  return (prefix) => `${prefix}-${++next}`;
}

function draft() {
  const idFactory = ids();
  const result = createStructuredImportDraft({
    fileName: "original.pdf",
    fileSize: 128,
    sourceSha256: "a".repeat(64),
    pageCount: 1,
    pages: [{ pageNumber: 1, text: "READING PASSAGE 1\nQuestions 1-3\n1 First question\nA Alpha" }],
  }, idFactory, "2026-09-09T00:00:00.000Z");
  result.passages[0].contentBlocks[0].text = "Original passage";
  result.passages[0].questionGroups[0].questions = [createStructuredQuestion({ id: "question-existing", number: 1, prompt: "Existing", needsReview: false }, idFactory)];
  return result;
}

describe("structured batch import", () => {
  it("previews and confirms multiple questions without overwriting an existing number", () => {
    const source = draft();
    const preview = previewBatchQuestions("2. Second prompt\nA Alpha\nB Beta\n3 Third prompt", source);
    expect(preview.canConfirmAll).toBe(true);
    expect(preview.items.map((item) => [item.number, item.options.length])).toEqual([[2, 2], [3, 0]]);
    const confirmed = confirmBatchQuestions(source, source.passages[0].questionGroups[0].id, preview, preview.items.map((item) => item.previewId), ids());
    expect(confirmed.errors).toEqual([]);
    expect(confirmed.addedQuestionIds).toHaveLength(2);
    expect(confirmed.draft.passages[0].questionGroups[0].questions.map((question) => question.number)).toEqual([1, 2, 3]);
    expect(source.passages[0].questionGroups[0].questions).toHaveLength(1);
  });

  it("blocks duplicate, conflicting, and unparsed question input before confirmation", () => {
    const source = draft();
    const preview = previewBatchQuestions("orphan\n1 Existing conflict\n2 New\n2 Duplicate", source);
    expect(preview.canConfirmAll).toBe(false);
    expect(preview.unparsedLines).toHaveLength(1);
    expect(preview.items[0].issues).toContain("NUMBER_CONFLICT");
    expect(preview.items[1].issues).toContain("DUPLICATE_NUMBER");
    expect(confirmBatchQuestions(source, source.passages[0].questionGroups[0].id, preview, preview.items.map((item) => item.previewId)).draft).toBe(source);
  });

  it("previews answer mapping and applies only an entirely unambiguous preview", () => {
    const source = draft();
    const valid = previewBatchAnswers("1. alpha", source);
    expect(valid.canConfirm).toBe(true);
    expect(valid.items[0]).toMatchObject({ status: "matched", questionId: "question-existing" });
    expect(applyPreviewedAnswers(source, valid).passages[0].questionGroups[0].questions[0].answer).toBe("alpha");

    const invalid = previewBatchAnswers("1 alpha\n1 beta\n9 missing", source);
    expect(invalid.canConfirm).toBe(false);
    expect(invalid.items.map((item) => item.status)).toEqual(["duplicate-answer", "duplicate-answer", "missing-question"]);
    expect(applyPreviewedAnswers(source, invalid)).toBe(source);
  });

  it("moves a complete previewed range by stable question IDs", () => {
    const source = draft();
    const firstGroup = source.passages[0].questionGroups[0];
    firstGroup.questions.push(createStructuredQuestion({ id: "question-two", number: 2, prompt: "Second" }));
    source.passages[0].questionGroups.push({ ...firstGroup, id: "target-group", questions: [] });
    const preview = previewQuestionRangeAssignment(source, 1, 2, "target-group");
    expect(preview).toEqual({ questionIds: ["question-existing", "question-two"], errors: [] });
    const moved = applyQuestionRangeAssignment(source, preview, "target-group");
    expect(moved.passages[0].questionGroups[1].questions.map((question) => question.id)).toEqual(["question-existing", "question-two"]);
  });

  it("applies group defaults without changing stable group, question, or answer identity", () => {
    const source = draft();
    const group = source.passages[0].questionGroups[0];
    group.questions[0].answer = "kept answer";
    const before = {
      groupId: group.id,
      questionId: group.questions[0].id,
      number: group.questions[0].number,
      answer: group.questions[0].answer,
    };

    const updated = applyGroupDefaults(source, group.id, {
      questionType: "matching",
      instructions: "Match each statement with the correct option.",
      maxWords: null,
      sharedOptionsText: "A First option\nB Second option",
    });
    const updatedGroup = updated.passages[0].questionGroups[0];

    expect({
      groupId: updatedGroup.id,
      questionId: updatedGroup.questions[0].id,
      number: updatedGroup.questions[0].number,
      answer: updatedGroup.questions[0].answer,
    }).toEqual(before);
    expect(updatedGroup).toMatchObject({
      questionType: "matching",
      instructions: "Match each statement with the correct option.",
    });
    expect(updatedGroup.sharedOptions.map((option) => [option.label, option.text])).toEqual([
      ["A", "First option"],
      ["B", "Second option"],
    ]);
  });

  it("creates explainable source candidates without changing the draft", () => {
    const source = draft();
    const before = JSON.stringify(source);
    const candidates = generateStructuredRuleCandidates(source);
    expect(candidates.map((candidate) => candidate.kind)).toEqual(["passage-boundary", "group-boundary", "question", "option"]);
    expect(candidates.every((candidate) => candidate.reason.length > 0 && candidate.sourceSegmentId.length > 0)).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
  });
});
