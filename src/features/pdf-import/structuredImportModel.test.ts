import { describe, expect, it } from "vitest";

import { InMemoryLearningRepository } from "../../infrastructure/repositories/InMemoryLearningRepository";
import {
  applyStructuredAnswerKey,
  assignSourceSegments,
  buildStructuredReadingPack,
  createStructuredGroup,
  createStructuredImportDraft,
  createStructuredPassage,
  createStructuredQuestion,
  discardStructuredImportDraft,
  findImportedSourceDuplicate,
  ignoreSourceSegments,
  loadStructuredImportDrafts,
  moveArrayItem,
  moveGroupBetweenPassages,
  moveQuestionBetweenGroups,
  replaceDraftOptions,
  saveStructuredImportDraft,
  suggestStructuredImportDraft,
  touchStructuredDraft,
  validateStructuredImportDraft,
  verifyStructuredDraftSource,
  type StableIdFactory,
  type StructuredImportDraft,
} from "./structuredImportModel";

function idSequence(): StableIdFactory {
  let value = 0;
  return (prefix) => `${prefix}-${++value}`;
}

const source = {
  fileName: "original-structured-reading.pdf",
  fileSize: 8192,
  sourceSha256: "e".repeat(64),
  pageCount: 4,
  pages: [
    { pageNumber: 1, text: "READING PASSAGE 1\nRiver Signals\nFirst body line." },
    { pageNumber: 2, text: "Second body line.\nQuestions 1-2\n1 First prompt" },
    { pageNumber: 3, text: "READING PASSAGE 2\nNight Gardens\nQuestions 18-20" },
    { pageNumber: 4, text: "18 Which detail is correct?\nA Moonlight\nB Traffic" },
  ],
};

function question(number: number, id: string, type: "short-answer" | "single-choice" = "short-answer") {
  return createStructuredQuestion({
    id,
    number,
    prompt: type === "single-choice" ? `Which option answers Question ${number}?` : `Prompt ${number}`,
    type,
    options: type === "single-choice" ? [
      { id: `${id}-a`, label: "A", text: "Alpha" },
      { id: `${id}-b`, label: "B", text: "Beta" },
    ] : [],
    answer: type === "single-choice" ? "A" : `answer-${number}`,
    rawText: `${number} Prompt ${number}`,
    sourcePages: [1],
    sourceBlock: `question-${number}`,
    needsReview: false,
  });
}

function validDraft(): StructuredImportDraft {
  const ids = idSequence();
  const initial = createStructuredImportDraft(source, ids, "2026-09-08T01:00:00.000Z");
  const first = createStructuredPassage(1, ids);
  first.title = "River Signals";
  first.contentBlocks[0].text = "A long original passage about river signals.";
  first.questionGroups = [createStructuredGroup({
    title: "Questions 1 and 3 / Short Answer",
    instructions: "Answer both questions.",
    questions: [question(1, "stable-q-1"), question(3, "stable-q-3")],
  }, ids)];
  const second = createStructuredPassage(2, ids);
  second.title = "Night Gardens";
  second.contentBlocks[0].text = "A separate original passage about night gardens.";
  second.questionGroups = [createStructuredGroup({
    title: "Questions 18-20 / Multiple Choice",
    instructions: "Choose the correct option.",
    questions: [question(18, "stable-q-18", "single-choice")],
  }, ids)];
  return touchStructuredDraft(initial, {
    passages: [first, second],
    sourceSegments: initial.sourceSegments.map((segment) => ({ ...segment, disposition: { kind: "ignored" as const } })),
  }, "2026-09-08T01:01:00.000Z");
}

describe("structured PDF draft identity and editing", () => {
  it("creates a generic editable multi-passage suggestion from standard headings only once", () => {
    const ids = idSequence();
    const initial = createStructuredImportDraft({
      ...source,
      pageCount: 3,
      pages: [
        { pageNumber: 1, text: "Uncertain cover note.\nREADING PASSAGE 1\nFirst Title\nBody one.\nQuestions 1-2 / Short Answer\nNO MORE THAN TWO WORDS\n1 First?\n2 Second?\nQuestions 3-3 / Short Answer\n3 Third?" },
        { pageNumber: 2, text: "READING PASSAGE 2\nSecond Title\nBody two.\nQuestions 14-18 / TRUE FALSE NOT GIVEN\n14 Statement.\n18 Target statement.\nQuestions 19-19 / Multiple Choice\nShared options: A Alpha; B Beta\n19 Choice?" },
        { pageNumber: 3, text: "READING PASSAGE 3\nThird Title\nBody three.\nQuestions 20-20 / Sentence Completion\n20 Fill ________.\nQuestions 21-21 / Short Answer\n21 Last?" },
      ],
    }, ids);
    const suggested = suggestStructuredImportDraft(initial, ids, "2026-09-08T01:10:00.000Z");
    expect(suggested.passages).toHaveLength(3);
    expect(suggested.passages.map((passage) => passage.questionGroups.length)).toEqual([2, 2, 2]);
    expect(suggested.sourceSegments.find((segment) => segment.text === "Uncertain cover note.")?.disposition.kind).toBe("unassigned");
    expect(suggested.passages[1].questionGroups[0].questions.find((item) => item.number === 18)?.id).toMatch(/^question-/);
    expect(suggested.passages[0].questionGroups[0].maxWords).toBe(2);
    expect(suggested.passages[1].questionGroups[1].sharedOptions.map((item) => item.label)).toEqual(["A", "B"]);
    expect(() => suggestStructuredImportDraft(suggested, ids)).toThrow("保护稳定 ID");
  });

  it("creates stable IDs immediately and preserves them through title edits and reorder", () => {
    const draft = validDraft();
    const idsBefore = draft.passages.map((passage) => passage.id);
    const renamed = { ...draft.passages[0], title: "Renamed without identity change" };
    const passages = moveArrayItem([renamed, draft.passages[1]], 0, 1);
    expect(passages.map((passage) => passage.id)).toEqual(idsBefore.reverse());
    expect(passages[1].questionGroups[0].questions[0].id).toBe("stable-q-1");
  });

  it("supports arbitrary passage counts without a fixed three-passage limit", () => {
    const ids = idSequence();
    const passages = Array.from({ length: 5 }, (_, index) => createStructuredPassage(index + 1, ids));
    expect(passages).toHaveLength(5);
    expect(new Set(passages.map((passage) => passage.id)).size).toBe(5);
  });

  it("assigns same-page fragments to different passages and one passage across pages", () => {
    const ids = idSequence();
    let draft = createStructuredImportDraft(source, ids);
    const second = createStructuredPassage(2, ids);
    draft = touchStructuredDraft(draft, { passages: [...draft.passages, second] });
    const pageOne = draft.sourceSegments.filter((segment) => segment.pageNumber === 1);
    const pageTwo = draft.sourceSegments.find((segment) => segment.pageNumber === 2)!;
    draft = assignSourceSegments(draft, [pageOne[0].id, pageTwo.id], { kind: "passage", id: draft.passages[0].id });
    draft = assignSourceSegments(draft, [pageOne[1].id], { kind: "passage", id: second.id });
    expect(draft.passages[0].contentBlocks[0].sourcePages).toEqual([1, 2]);
    expect(draft.passages[1].contentBlocks[0].sourcePages).toEqual([1]);
  });

  it("moves a question between groups without regenerating its ID or number", () => {
    const draft = validDraft();
    const targetGroupId = draft.passages[1].questionGroups[0].id;
    const moved = moveQuestionBetweenGroups(draft, "stable-q-3", targetGroupId);
    expect(moved.passages[0].questionGroups[0].questions.map((item) => item.id)).toEqual(["stable-q-1"]);
    expect(moved.passages[1].questionGroups[0].questions.at(-1)).toMatchObject({ id: "stable-q-3", number: 3 });
  });

  it("moves a complete group between passages without changing group or question identity", () => {
    const draft = validDraft();
    const group = draft.passages[0].questionGroups[0];
    const moved = moveGroupBetweenPassages(draft, group.id, draft.passages[1].id);
    expect(moved.passages[0].questionGroups).toEqual([]);
    expect(moved.passages[1].questionGroups.at(-1)?.id).toBe(group.id);
    expect(moved.passages[1].questionGroups.at(-1)?.questions.map((item) => item.id)).toEqual(["stable-q-1", "stable-q-3"]);
  });

  it("retains option IDs while option labels and text are edited", () => {
    const ids = idSequence();
    const existing = replaceDraftOptions([], "A First\nB Second", ids);
    const edited = replaceDraftOptions(existing, "A Updated\nB Still second\nC New", ids);
    expect(edited.slice(0, 2).map((option) => option.id)).toEqual(existing.map((option) => option.id));
    expect(edited[2].id).not.toBe(existing[1].id);
  });
});

describe("structured PDF answers and validation", () => {
  it("maps an unambiguous pasted answer key to stable question IDs", () => {
    const draft = validDraft();
    const result = applyStructuredAnswerKey(draft, "1 revised\n18 B");
    expect(result.errors).toEqual([]);
    expect(result.appliedQuestionIds).toEqual(["stable-q-1", "stable-q-18"]);
    expect(result.draft.passages[1].questionGroups[0].questions[0].answer).toBe("B");
  });

  it("blocks duplicate answer lines and ambiguous duplicate question numbers without partial application", () => {
    const draft = validDraft();
    const duplicateLine = applyStructuredAnswerKey(draft, "18 A\n18 B");
    expect(duplicateLine.errors[0]).toContain("出现多次");
    expect(duplicateLine.draft).toBe(draft);

    const duplicatedQuestion = structuredClone(draft);
    duplicatedQuestion.passages[0].questionGroups[0].questions[0].number = 18;
    const ambiguous = applyStructuredAnswerKey(duplicatedQuestion, "18 B");
    expect(ambiguous.errors.join(" ")).toContain("无法按题号唯一映射");
    expect(ambiguous.appliedQuestionIds).toEqual([]);
  });

  it("distinguishes blocking structure errors from blank-answer warnings", () => {
    const draft = validDraft();
    draft.passages[0].questionGroups[0].questions[0].answer = "";
    draft.passages[0].questionGroups[0].questions[0].needsReview = true;
    const warningOnly = validateStructuredImportDraft(draft);
    expect(warningOnly.valid).toBe(true);
    expect(warningOnly.warnings.some((item) => item.code === "ANSWER_UNPROVIDED")).toBe(true);
    expect(warningOnly.warnings.some((item) => item.code === "QUESTION_REVIEW_REQUIRED")).toBe(true);

    draft.passages[0].questionGroups[0].questions[0].prompt = "";
    const blocked = validateStructuredImportDraft(draft);
    expect(blocked.valid).toBe(false);
    expect(blocked.errors.some((item) => item.code === "QUESTION_PROMPT_REQUIRED")).toBe(true);
  });

  it("requires every extracted fragment to be assigned or explicitly ignored", () => {
    const ids = idSequence();
    const draft = createStructuredImportDraft(source, ids);
    expect(validateStructuredImportDraft(draft).errors.some((item) => item.code === "SOURCE_SEGMENT_UNASSIGNED")).toBe(true);
    const ignored = ignoreSourceSegments(draft, draft.sourceSegments.map((segment) => segment.id));
    expect(validateStructuredImportDraft(ignored).errors.some((item) => item.code === "SOURCE_SEGMENT_UNASSIGNED")).toBe(false);
  });

  it("blocks unsupported detected types instead of silently converting them", () => {
    const draft = validDraft();
    draft.passages[0].questionGroups[0].questions[0].type = "matching-headings";
    const report = validateStructuredImportDraft(draft);
    expect(report.errors.find((item) => item.code === "QUESTION_TYPE_UNSUPPORTED")?.message).toContain("不能把");
  });
});

describe("structured PDF persistence and pack conversion", () => {
  it("round-trips source snapshots, edit stage, answers, and stable IDs through repository settings", async () => {
    const repository = new InMemoryLearningRepository();
    const draft = touchStructuredDraft(validDraft(), { currentStage: "answers", answerKeyText: "18 A" });
    await saveStructuredImportDraft(repository, draft);
    const [restored] = await loadStructuredImportDrafts(repository);
    expect(restored.currentStage).toBe("answers");
    expect(restored.source.pages[3].text).toContain("18 Which detail");
    expect(restored.passages[1].questionGroups[0].questions[0].id).toBe("stable-q-18");

    await discardStructuredImportDraft(repository, draft.id);
    expect(await loadStructuredImportDrafts(repository)).toEqual([]);
  });

  it("allows source recovery only when SHA-256, byte length, and page count all match", () => {
    const draft = validDraft();
    expect(verifyStructuredDraftSource(draft, {
      sourceSha256: draft.source.sourceSha256,
      fileSize: draft.source.fileSize,
      pageCount: draft.source.pageCount,
    })).toBeNull();
    expect(verifyStructuredDraftSource(draft, {
      sourceSha256: "f".repeat(64),
      fileSize: draft.source.fileSize,
      pageCount: draft.source.pageCount,
    })).toContain("SHA-256 不匹配");
  });

  it("builds multiple passages and non-contiguous complete groups using their stable IDs", async () => {
    const draft = validDraft();
    const pack = await buildStructuredReadingPack(draft, "2026-09-08T02:00:00.000Z");
    const module = pack.modules[0];
    if (module.type !== "reading") throw new Error("Expected Reading module");
    expect(module.sections).toHaveLength(2);
    expect(module.sections[0].questionGroups[0].questions.map((item) => item.number)).toEqual([1, 3]);
    expect(module.sections[0].questionGroups[0].id).toBe(draft.passages[0].questionGroups[0].id);
    expect(module.sections[1].questionGroups[0].questions[0].id).toBe("stable-q-18");
  });

  it("keeps source dedupe separate from pack ID conflicts and never overwrites an installed pack", async () => {
    const repository = new InMemoryLearningRepository();
    const draft = validDraft();
    const pack = await buildStructuredReadingPack(draft);
    await repository.installImportedPack(pack);
    expect((await findImportedSourceDuplicate(repository, draft.source.sourceSha256))?.manifest.id).toBe(draft.packId);
    await expect(repository.installImportedPack(pack)).rejects.toThrow("already installed");
  });

  it("retains the editable draft when formal installation fails", async () => {
    const repository = new InMemoryLearningRepository();
    const draft = validDraft();
    await saveStructuredImportDraft(repository, draft);
    const pack = await buildStructuredReadingPack(draft);
    await repository.installImportedPack(pack);
    await expect(repository.installImportedPack(pack)).rejects.toThrow("already installed");
    expect((await loadStructuredImportDrafts(repository))[0].id).toBe(draft.id);
  });

  it("reports an oversized source snapshot before the native setting boundary can reject it", async () => {
    const repository = new InMemoryLearningRepository();
    const oversized = createStructuredImportDraft({
      ...source,
      pages: [{ pageNumber: 1, text: "original text line\n".repeat(15_000) }],
    }, idSequence());
    await expect(saveStructuredImportDraft(repository, oversized)).rejects.toThrow("安全上限");
    expect(await loadStructuredImportDrafts(repository)).toEqual([]);
  });
});
