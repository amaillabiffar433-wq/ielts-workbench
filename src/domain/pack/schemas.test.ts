import { describe, expect, it } from "vitest";

import manifest from "../../../samples/original-demo-pack/manifest.json";
import listening from "../../../samples/original-demo-pack/modules/listening.json";
import reading from "../../../samples/original-demo-pack/modules/reading.json";
import writing from "../../../samples/original-demo-pack/modules/writing.json";
import multiPassageManifest from "../../../samples/original-multi-passage-pack/manifest.json";
import multiPassageReading from "../../../samples/original-multi-passage-pack/modules/reading.json";
import dailyReadingManifest from "../../../samples/original-daily-reading-pack/manifest.json";
import dailyReading from "../../../samples/original-daily-reading-pack/modules/reading.json";
import { IELTSPackSchema, QuestionSchema, parseIeltsPack } from "./schemas";

const originalDemoInput = {
  manifest,
  modules: [reading, listening, writing],
};

describe("IELTSPackSchema", () => {
  it("accepts and freezes the complete original demo pack", () => {
    const parsed = parseIeltsPack(originalDemoInput);

    expect(parsed.manifest.schemaVersion).toBe(1);
    expect(parsed.modules.map((module) => module.type)).toEqual([
      "reading",
      "listening",
      "writing",
    ]);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.modules[0].sections)).toBe(true);
  });

  it("accepts the original three-Passage Reading sample through the pack schema", () => {
    const parsed = parseIeltsPack({ manifest: multiPassageManifest, modules: [multiPassageReading] });
    const readingModule = parsed.modules[0];
    expect(readingModule.type).toBe("reading");
    if (readingModule.type !== "reading") throw new Error("Reading module missing");
    const questions = readingModule.sections.flatMap((section) =>
      section.questionGroups.flatMap((group) => group.questions),
    );
    expect(readingModule.sections).toHaveLength(3);
    expect(questions).toHaveLength(21);
    expect(questions.find((question) => question.number === 18)?.id).toBe("northbridge-q18");
  });

  it("accepts the complete original Reading v3 sample with forty stable questions", () => {
    const parsed = parseIeltsPack({ manifest: dailyReadingManifest, modules: [dailyReading] });
    const readingModule = parsed.modules[0];
    expect(readingModule.type).toBe("reading");
    if (readingModule.type !== "reading") throw new Error("Reading module missing");
    const questions = readingModule.sections.flatMap((section) =>
      section.questionGroups.flatMap((group) => group.questions),
    );
    expect(readingModule.schemaVersion).toBe(3);
    expect(readingModule.sections).toHaveLength(3);
    expect(questions.map((question) => question.number)).toEqual(
      Array.from({ length: 40 }, (_, index) => index + 1),
    );
    expect(new Set(questions.map((question) => question.id)).size).toBe(40);
    expect(questions.find((question) => question.number === 18)?.type).toBe("multiple-choice");
    expect(readingModule.sections.flatMap((section) => section.questionGroups)
      .flatMap((group) => group.contextBlocks ?? [])
      .map((block) => block.type)).toEqual(expect.arrayContaining(["table", "completion"]));
  });

  it("rejects unsupported schema versions", () => {
    const invalid = structuredClone(originalDemoInput);
    invalid.manifest.schemaVersion = 2;

    expect(IELTSPackSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects duplicate stable IDs across domain entities", () => {
    const invalid = structuredClone(originalDemoInput);
    const section = invalid.modules[0].sections[0] as {
      contentBlocks: Array<{ id: string }>;
    };
    section.contentBlocks[1].id = section.contentBlocks[0].id;

    const result = IELTSPackSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("already used"))).toBe(true);
    }
  });

  it("rejects module references that are absent from the pack", () => {
    const invalid = structuredClone(originalDemoInput);
    invalid.manifest.tests[0].moduleIds[0] = "missing-reading-module";

    expect(IELTSPackSchema.safeParse(invalid).success).toBe(false);
  });

  it("keeps the fixed-file v1 contract to one test and one module per type", () => {
    const multipleTests = structuredClone(originalDemoInput);
    multipleTests.manifest.tests.push({
      id: "demo-test-02",
      title: "Unsupported second test",
      moduleIds: ["demo-reading-01"],
    });
    expect(IELTSPackSchema.safeParse(multipleTests).success).toBe(false);

    const duplicateReading = structuredClone(originalDemoInput);
    const extraReading = structuredClone(reading);
    extraReading.id = "demo-reading-02";
    duplicateReading.modules.push(extraReading);
    duplicateReading.manifest.tests[0].moduleIds.push(extraReading.id);
    const result = IELTSPackSchema.safeParse(duplicateReading);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("at most one reading"))).toBe(true);
    }
  });

  it("assigns missing legacy Reading numbers from the stable full-module order", () => {
    const legacy = structuredClone(originalDemoInput);
    const legacyReading = legacy.modules[0] as unknown as {
      sections: Array<{ questionGroups: Array<{ questions: Array<{ id: string; number?: number }> }> }>;
    };
    const questions = legacyReading.sections[0].questionGroups.flatMap((group) => group.questions);
    delete (questions[3] as { number?: number }).number;

    const parsed = parseIeltsPack(legacy);
    const readingModule = parsed.modules.find((module) => module.type === "reading");
    if (!readingModule || readingModule.type !== "reading") throw new Error("Reading module missing");
    const parsedQuestions = readingModule.sections.flatMap((section) =>
      section.questionGroups.flatMap((group) => group.questions),
    );
    expect(parsedQuestions[3].number).toBe(4);
    expect(parsedQuestions[3].id).toBe(questions[3].id);
  });

  it("accepts declared Reading module v2 table/list context while retaining manifest v1", () => {
    const input = structuredClone({ manifest: multiPassageManifest, modules: [multiPassageReading] });
    type MutableQuestion = { id: string; type: string };
    type MutableGroup = { id: string; questions: MutableQuestion[]; contextBlocks?: unknown[] };
    const readingModule = input.modules[0] as unknown as {
      schemaVersion: number;
      sections: Array<{ questionGroups: MutableGroup[] }>;
    };
    readingModule.schemaVersion = 2;
    const candidateGroups = readingModule.sections.flatMap((section) => section.questionGroups);
    const group = candidateGroups.find((candidate) =>
      candidate.questions.some((question) => question.type === "short-answer" || question.type === "fill-blank"),
    );
    if (!group) throw new Error("Fixture needs a text question group");
    const question = group.questions.find((candidate) => candidate.type === "short-answer" || candidate.type === "fill-blank");
    if (!question) throw new Error("Fixture needs a text question");
    group.contextBlocks = [
      { id: "context-paragraph-1", type: "paragraph", text: "Use the original timetable." },
      { id: "context-list-1", type: "list", style: "ordered", items: [{ id: "context-list-item-1", text: "Read each row." }] },
      {
        id: "context-table-1",
        type: "table",
        hasHeaderRow: true,
        hasRowHeaders: true,
        rows: [
          { id: "context-row-1", cells: [{ id: "context-cell-1", text: "Route" }, { id: "context-cell-2", text: "Detail" }] },
          { id: "context-row-2", cells: [{ id: "context-cell-3", text: "East" }, { id: "context-cell-4", text: "Answer", questionId: question.id }] },
        ],
      },
    ];

    const parsed = parseIeltsPack(input);
    expect(parsed.manifest.schemaVersion).toBe(1);
    expect(parsed.modules[0].schemaVersion).toBe(2);
    if (parsed.modules[0].type !== "reading") throw new Error("Reading module missing");
    const parsedGroup = parsed.modules[0].sections
      .flatMap((section) => section.questionGroups)
      .find((candidate) => candidate.id === group.id);
    expect(parsedGroup?.contextBlocks).toHaveLength(3);
  });

  it("rejects structured context in Reading v1 and invalid or duplicate table bindings in v2", () => {
    const input = structuredClone({ manifest: multiPassageManifest, modules: [multiPassageReading] });
    const firstGroup = input.modules[0].sections[0].questionGroups[0] as typeof input.modules[0]["sections"][number]["questionGroups"][number] & { contextBlocks?: unknown[] };
    const otherQuestionId = input.modules[0].sections[1].questionGroups[0].questions[0].id;
    firstGroup.contextBlocks = [{
      id: "context-table-invalid",
      type: "table",
      hasHeaderRow: false,
      hasRowHeaders: false,
      rows: [{
        id: "context-row-invalid",
        cells: [
          { id: "context-cell-invalid-1", text: "First", questionId: otherQuestionId },
          { id: "context-cell-invalid-2", text: "Second", questionId: otherQuestionId },
        ],
      }],
    }];
    expect(IELTSPackSchema.safeParse(input).success).toBe(false);
    input.modules[0].schemaVersion = 2;
    expect(IELTSPackSchema.safeParse(input).success).toBe(false);
  });

  it("rejects duplicate persistent context IDs across the pack", () => {
    const input = structuredClone({ manifest: multiPassageManifest, modules: [multiPassageReading] });
    input.modules[0].schemaVersion = 2;
    const group = input.modules[0].sections[0].questionGroups[0] as typeof input.modules[0]["sections"][number]["questionGroups"][number] & { contextBlocks?: unknown[] };
    group.contextBlocks = [{
      id: input.modules[0].sections[0].contentBlocks[0].id,
      type: "paragraph",
      text: "This ID collides with an existing passage block.",
    }];
    expect(IELTSPackSchema.safeParse(input).success).toBe(false);
  });
});

describe("QuestionSchema discriminated union", () => {
  it.each([
    {
      id: "question-single",
      number: 1,
      type: "single-choice",
      prompt: "Choose one.",
      options: [
        { id: "question-single-a", label: "A", text: "First" },
        { id: "question-single-b", label: "B", text: "Second" },
      ],
      correctOptionId: "question-single-a",
    },
    {
      id: "question-tfng",
      number: 2,
      type: "true-false-not-given",
      prompt: "Decide.",
      correctAnswer: "not-given",
    },
    {
      id: "question-ynng",
      number: 5,
      type: "yes-no-not-given",
      prompt: "Decide whether the writer agrees.",
      correctAnswer: "no",
    },
    {
      id: "question-multiple",
      number: 6,
      type: "multiple-choice",
      prompt: "Choose two.",
      points: 2,
      options: [
        { id: "question-multiple-a", label: "A", text: "First" },
        { id: "question-multiple-b", label: "B", text: "Second" },
        { id: "question-multiple-c", label: "C", text: "Third" },
      ],
      selectionCount: 2,
      additionalNumbers: [7],
      scoringMode: "per-correct-option",
      correctOptionIds: ["question-multiple-a", "question-multiple-c"],
    },
    {
      id: "question-matching",
      number: 8,
      type: "matching",
      prompt: "Match the feature.",
      matchingKind: "features",
      allowOptionReuse: true,
      options: [
        { id: "question-matching-a", label: "A", text: "First" },
        { id: "question-matching-b", label: "B", text: "Second" },
      ],
      correctOptionId: "question-matching-b",
    },
    {
      id: "question-short",
      number: 3,
      type: "short-answer",
      prompt: "Answer briefly.",
      acceptableAnswers: ["solar panels"],
      maxWords: 2,
    },
    {
      id: "question-blank",
      number: 4,
      type: "fill-blank",
      prompt: "Complete it.",
      sentence: "The fixture is {{blank}}.",
      acceptableAnswers: ["silent"],
    },
  ])("accepts the $type branch", (question) => {
    expect(QuestionSchema.safeParse(question).success).toBe(true);
  });

  it("rejects a single-choice answer that does not reference an option", () => {
    const result = QuestionSchema.safeParse({
      id: "question-invalid-choice",
      number: 1,
      type: "single-choice",
      prompt: "Choose one.",
      options: [
        { id: "invalid-a", label: "A", text: "First" },
        { id: "invalid-b", label: "B", text: "Second" },
      ],
      correctOptionId: "invalid-c",
    });

    expect(result.success).toBe(false);
  });

  it("rejects mixed fields from another discriminant branch", () => {
    const result = QuestionSchema.safeParse({
      id: "question-invalid-mixed",
      number: 1,
      type: "true-false-not-given",
      prompt: "Decide.",
      correctAnswer: "true",
      acceptableAnswers: ["true"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a fill-blank sentence without exactly one marker", () => {
    const result = QuestionSchema.safeParse({
      id: "question-invalid-blank",
      number: 1,
      type: "fill-blank",
      prompt: "Complete it.",
      sentence: "There is no marker.",
      acceptableAnswers: ["answer"],
    });

    expect(result.success).toBe(false);
  });
});
