import { describe, expect, it } from "vitest";

import manifest from "../../../samples/original-demo-pack/manifest.json";
import listening from "../../../samples/original-demo-pack/modules/listening.json";
import reading from "../../../samples/original-demo-pack/modules/reading.json";
import writing from "../../../samples/original-demo-pack/modules/writing.json";
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
