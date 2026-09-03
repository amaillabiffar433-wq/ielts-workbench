import { describe, expect, it } from "vitest";

import { InMemoryLearningRepository } from "../../infrastructure/repositories/InMemoryLearningRepository";
import {
  applyAnswerKey,
  buildImportedReadingPack,
  createImportDedupeKey,
  createReadingImportDraft,
  detectPassageTitle,
  detectQuestions,
  findDuplicateImportedPack,
  mergePdfTextFragments,
  parseAnswerKey,
  validatePageRange,
  validatePdfFile,
  type ImportedPackBuildInput,
  type ReadingImportDraft,
} from "./pdfImportModel";

const passagePages = [{
  pageNumber: 2,
  text: "READING PASSAGE 1\nRooftop Gardens\nSmall rooftop gardens can cool city buildings.\nThey also provide habitats for insects.",
}];

const questionPages = [{
  pageNumber: 3,
  text: [
    "Questions 1-2",
    "Do the following statements agree? TRUE / FALSE / NOT GIVEN",
    "1 Rooftop gardens can reduce heat.",
    "2 Every city requires rooftop gardens.",
    "Questions 3-3",
    "Choose the correct answer.",
    "3 Which benefit is mentioned?",
    "A Lower temperatures",
    "B Faster traffic",
    "C Taller buildings",
  ].join("\n"),
}];

function buildInput(draft: ReadingImportDraft): ImportedPackBuildInput {
  return {
    sourceFileName: "original-reading-sample.pdf",
    sourceFileSize: 4096,
    sourceSha256: "b".repeat(64),
    sourceFingerprint: "b".repeat(64),
    bookTitle: "Original Practice Notes",
    testNumber: "1",
    passageNumber: 1,
    passagePageRange: { start: 2, end: 2 },
    questionPageRange: { start: 3, end: 3 },
    importedAt: "2026-09-03T05:00:00.000Z",
    dedupeKey: "a".repeat(64),
    draft,
  };
}

describe("PDF import validation", () => {
  it("accepts PDF MIME or extension and rejects unrelated files", () => {
    expect(validatePdfFile({ name: "sample.pdf", size: 12, type: "" }).valid).toBe(true);
    expect(validatePdfFile({ name: "sample.bin", size: 12, type: "application/pdf" }).valid).toBe(true);
    expect(validatePdfFile({ name: "notes.txt", size: 12, type: "text/plain" })).toMatchObject({ valid: false });
    expect(validatePdfFile({ name: "empty.pdf", size: 0, type: "application/pdf" })).toMatchObject({ valid: false });
  });

  it("warns for large PDFs without rejecting them", () => {
    const result = validatePdfFile({ name: "large.pdf", size: 51 * 1024 * 1024, type: "application/pdf" });
    expect(result.valid).toBe(true);
    expect(result.warning).toContain("50 MB");
  });

  it("validates one-based inclusive page ranges", () => {
    expect(validatePageRange({ start: 1, end: 2 }, 3, "Passage 页码")).toBeNull();
    expect(validatePageRange({ start: 0, end: 1 }, 3, "Passage 页码")).toContain("第 1 页");
    expect(validatePageRange({ start: 3, end: 2 }, 3, "Passage 页码")).toContain("结束页");
    expect(validatePageRange({ start: 1, end: 4 }, 3, "Passage 页码")).toContain("3 页");
  });
});

describe("PDF text and structure detection", () => {
  it("merges positioned text fragments into ordered lines", () => {
    const text = mergePdfTextFragments([
      { text: "gardens", x: 80, y: 700, height: 10 },
      { text: "Rooftop", x: 10, y: 700, height: 10 },
      { text: "cool cities", x: 10, y: 680, height: 10 },
    ]);
    expect(text).toBe("Rooftop gardens\ncool cities");
  });

  it("detects the passage title following the selected passage heading", () => {
    expect(detectPassageTitle(passagePages, 1)).toBe("Rooftop Gardens");
    expect(detectPassageTitle(passagePages, 2)).toBe("Reading Passage 2");
  });

  it("detects TFNG and multiple-choice questions with source pages", () => {
    const questions = detectQuestions(questionPages);
    expect(questions.map((question) => question.number)).toEqual([1, 2, 3]);
    expect(questions[0]).toMatchObject({ type: "true-false-not-given", sourcePages: [3] });
    expect(questions[2].type).toBe("single-choice");
    expect(questions[2].options).toEqual(["A Lower temperatures", "B Faster traffic", "C Taller buildings"]);
  });

  it("retains unrecognized question text as an unsupported draft", () => {
    const [question] = detectQuestions([{ pageNumber: 7, text: "Unnumbered diagram labels need manual organization." }]);
    expect(question).toMatchObject({ type: "unsupported", needsReview: true, sourcePages: [7] });
    expect(question.rawText).toContain("diagram labels");
  });

  it("creates an editable draft without dropping the passage body", () => {
    const draft = createReadingImportDraft(passagePages, questionPages, 1);
    expect(draft.passageTitle).toBe("Rooftop Gardens");
    expect(draft.passageText).toContain("Small rooftop gardens");
    expect(draft.passageText).not.toContain("READING PASSAGE 1");
    expect(draft.questions).toHaveLength(3);
  });
});

describe("answer keys and IELTSPack conversion", () => {
  it("parses numbered answer lines and preserves invalid lines", () => {
    const result = parseAnswerKey("1. FALSE\n2 TRUE\n3: A\nanswer heading");
    expect(result.answers).toEqual({ 1: "FALSE", 2: "TRUE", 3: "A" });
    expect(result.invalidLines).toEqual(["answer heading"]);
  });

  it("applies answers by stable question number", () => {
    const draft = createReadingImportDraft(passagePages, questionPages, 1);
    const questions = applyAnswerKey(draft.questions, { 2: "NOT GIVEN", 3: "A" });
    expect(questions[0].answer).toBe("");
    expect(questions[1].answer).toBe("NOT GIVEN");
    expect(questions[2].answer).toBe("A");
  });

  it("builds a valid Reading-only IELTSPack with import metadata", () => {
    const draft = createReadingImportDraft(passagePages, questionPages, 1);
    draft.questions = applyAnswerKey(draft.questions, { 1: "FALSE", 2: "NOT GIVEN", 3: "A" });
    draft.questions.forEach((question) => { question.needsReview = false; });
    const pack = buildImportedReadingPack(buildInput(draft));
    expect(pack.manifest.id).toBe(`pdf-reading-${"a".repeat(16)}`);
    expect(pack.manifest.importMetadata).toMatchObject({
      sourceFileName: "original-reading-sample.pdf",
      pageNumberBase: 1,
      needsReview: false,
    });
    expect(pack.modules).toHaveLength(1);
    expect(pack.modules[0].type).toBe("reading");
    if (pack.modules[0].type !== "reading") throw new Error("Expected a Reading module");
    const questions = pack.modules[0].sections[0].questionGroups[0].questions;
    expect(questions[0]).toMatchObject({ type: "true-false-not-given", correctAnswer: "false" });
    expect(questions[2]).toMatchObject({ type: "single-choice" });
  });

  it("keeps unsupported questions answerable and unscored when the key is absent", () => {
    const draft: ReadingImportDraft = {
      passageTitle: "Original Passage",
      passageText: "An original short paragraph.",
      instructions: "Review manually.",
      questions: [{
        localId: "draft-1",
        number: 1,
        prompt: "Label the diagram.",
        type: "unsupported",
        options: [],
        answer: "",
        rawText: "1 Label the diagram.",
        sourcePages: [4],
        sourceBlock: "question-1",
        needsReview: true,
      }],
    };
    const pack = buildImportedReadingPack(buildInput(draft));
    if (pack.modules[0].type !== "reading") throw new Error("Expected a Reading module");
    expect(pack.modules[0].sections[0].questionGroups[0].questions[0]).toMatchObject({
      type: "short-answer",
      acceptableAnswers: [],
      source: { detectedType: "unsupported", needsReview: true },
    });
  });

  it("creates stable dedupe keys and detects an installed duplicate", async () => {
    const first = await createImportDedupeKey("fingerprint", { start: 2, end: 2 }, { start: 3, end: 3 }, 1);
    const second = await createImportDedupeKey("fingerprint", { start: 2, end: 2 }, { start: 3, end: 3 }, 1);
    const different = await createImportDedupeKey("fingerprint", { start: 2, end: 2 }, { start: 4, end: 4 }, 1);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(different).not.toBe(first);

    const draft = createReadingImportDraft(passagePages, questionPages, 1);
    const pack = buildImportedReadingPack({ ...buildInput(draft), dedupeKey: first });
    const repository = new InMemoryLearningRepository();
    await repository.installImportedPack(pack);
    expect((await findDuplicateImportedPack(repository, first))?.manifest.id).toBe(pack.manifest.id);
    await expect(repository.installImportedPack(pack)).rejects.toThrow("already installed");
  });
});
