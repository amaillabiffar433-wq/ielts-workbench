import { describe, expect, it } from "vitest";

import type { VocabularyItem } from "../../infrastructure/repositories/LearningRepository";
import { formatVocabularyExport } from "./vocabularyExport";

const item: VocabularyItem = {
  id: "vocabulary-one",
  term: "discrepancy",
  normalizedTerm: "discrepancy",
  entryKind: "word",
  sentence: "Researchers noticed a discrepancy in the records.",
  contextBefore: "noticed a ",
  contextAfter: " in the records",
  sourcePackId: "cambridge-17-pack",
  sourceTestId: "cambridge-17-test-2",
  sourceModule: "reading",
  sourceBlockId: "passage-one-block",
  sourceBookTitle: "Cambridge IELTS 17 Academic",
  sourceTestTitle: "Test 2",
  sourceSectionId: "passage-one",
  sourceSectionTitle: "Reading Passage 1",
  sourceQuestionNumber: 7,
  note: "Review this word",
  learningState: "learning",
  createdAt: "2026-09-16T08:00:00.000Z",
  updatedAt: "2026-09-16T08:00:00.000Z",
};

describe("vocabulary export", () => {
  it("keeps the original context and source in Markdown", () => {
    const output = formatVocabularyExport([item], "markdown");
    expect(output).toContain("# English Learning Notebook");
    expect(output).toContain("## Cambridge IELTS 17 Academic / Test 2 / Reading Passage 1");
    expect(output).toContain("### discrepancy");
    expect(output).toContain(item.sentence);
    expect(output).toContain("Question: 7");
    expect(output).toContain("Status: learning");
  });

  it("produces round-trippable JSON and quoted UTF-8 CSV", () => {
    expect(JSON.parse(formatVocabularyExport([item], "json"))).toEqual([item]);
    const csv = formatVocabularyExport([{ ...item, note: 'comma, quote " kept' }], "csv");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"comma, quote "" kept"');
    expect(csv).toContain('"Cambridge IELTS 17 Academic / Test 2 / Reading Passage 1"');
  });
});
