import { describe, expect, it } from "vitest";

import type { ReadingModule } from "../../../domain";
import { originalDemoPack } from "../../../infrastructure/demo/originalDemoPack";
import {
  buildReadingQuestionEntries,
  groupSelectedReadingQuestions,
  selectReadingQuestions,
} from "./readingModel";

function multiPassageModule(): ReadingModule {
  const original = originalDemoPack.modules.find((module) => module.type === "reading");
  if (!original || original.type !== "reading") throw new Error("Reading fixture missing");
  return {
    ...original,
    sections: [
      { ...original.sections[0], id: "section-1", title: "One", questionGroups: [{ ...original.sections[0].questionGroups[0], id: "group-1", questions: original.sections[0].questionGroups[0].questions.slice(0, 2) }] },
      { ...original.sections[0], id: "section-2", title: "Two", questionGroups: [{ ...original.sections[0].questionGroups[0], id: "group-2", questions: original.sections[0].questionGroups[0].questions.slice(0, 2).map((question, index) => ({ ...question, id: `second-q-${index + 1}`, number: index + 3 })) }] },
      { ...original.sections[0], id: "section-3", title: "Three", questionGroups: [{ ...original.sections[0].questionGroups[0], id: "group-3", questions: original.sections[0].questionGroups[0].questions.slice(0, 2).map((question, index) => ({ ...question, id: `third-q-${index + 1}`, number: index + 5 })) }] },
    ],
  };
}

describe("Reading question selection", () => {
  it("keeps full-module order and section/group identity", () => {
    const entries = buildReadingQuestionEntries(multiPassageModule());
    expect(entries.map((entry) => [entry.displayNumber, entry.section.id, entry.group.id])).toEqual([
      [1, "section-1", "group-1"],
      [2, "section-1", "group-1"],
      [3, "section-2", "group-2"],
      [4, "section-2", "group-2"],
      [5, "section-3", "group-3"],
      [6, "section-3", "group-3"],
    ]);
  });

  it("selects all, one passage, a cross-passage range, and one question", () => {
    const entries = buildReadingQuestionEntries(multiPassageModule());
    expect(selectReadingQuestions(entries, { kind: "all" }).entries).toHaveLength(6);
    expect(selectReadingQuestions(entries, { kind: "passage", sectionId: "section-2" }).entries.map((entry) => entry.displayNumber)).toEqual([3, 4]);
    const range = selectReadingQuestions(entries, { kind: "range", start: 2, end: 5 });
    expect(range.entries.map((entry) => entry.displayNumber)).toEqual([2, 3, 4, 5]);
    expect(groupSelectedReadingQuestions(range.entries).map((group) => group.section.id)).toEqual(["section-1", "section-2", "section-3"]);
    expect(selectReadingQuestions(entries, { kind: "single", number: 4 }).entries[0].question.id).toBe("second-q-2");
  });

  it("reports reversed, missing, out-of-range, duplicate, and empty selections", () => {
    const entries = buildReadingQuestionEntries(multiPassageModule());
    expect(selectReadingQuestions(entries, { kind: "range", start: 5, end: 2 }).error).toContain("起始题号");
    expect(selectReadingQuestions(entries, { kind: "range", start: 2, end: 9 }).error).toContain("Question 7");
    expect(selectReadingQuestions(entries, { kind: "single", number: 18 }).error).toContain("不存在");
    expect(selectReadingQuestions(entries, { kind: "passage", sectionId: "missing" }).error).toContain("不存在");
    expect(selectReadingQuestions([], { kind: "all" }).error).toContain("没有可用题目");
    const duplicate = [...entries, { ...entries[0], question: { ...entries[0].question, id: "duplicate" } }];
    expect(selectReadingQuestions(duplicate, { kind: "single", number: 1 }).error).toContain("不唯一");
  });

  it("derives a missing display number from the stable full-module order", () => {
    const module = multiPassageModule();
    const question = module.sections[1].questionGroups[0].questions[0];
    const withoutNumber = { ...question } as { number?: number };
    delete withoutNumber.number;
    const fixture = {
      ...module,
      sections: module.sections.map((section, sectionIndex) => sectionIndex === 1
        ? { ...section, questionGroups: [{ ...section.questionGroups[0], questions: [withoutNumber, ...section.questionGroups[0].questions.slice(1)] }] }
        : section),
    } as ReadingModule;
    expect(buildReadingQuestionEntries(fixture)[2]).toMatchObject({ displayNumber: 3, moduleOrder: 2 });
  });
});
