import { describe, expect, it } from "vitest";

import type { ReadingModule } from "../../../domain";
import { originalDemoPack } from "../../../infrastructure/demo/originalDemoPack";
import {
  buildReadingQuestionEntries,
  buildReadingQuestionGroupOptions,
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

function moduleWithNonContinuousGroup(): ReadingModule {
  const module = multiPassageModule();
  const questions = module.sections[0].questionGroups[0].questions;
  return {
    ...module,
    sections: [{
      ...module.sections[0],
      questionGroups: [
        {
          ...module.sections[0].questionGroups[0],
          id: "stable-matching-group",
          title: "Questions 14, 18 / Matching Headings",
          questions: [
            { ...questions[0], id: "matching-q14", number: 14 },
            { ...questions[1], id: "matching-q18", number: 18 },
          ],
        },
        {
          ...module.sections[0].questionGroups[0],
          id: "stable-other-group",
          title: "Questions 15–16 / Other Group",
          questions: [
            { ...questions[0], id: "other-q15", number: 15 },
            { ...questions[1], id: "other-q16", number: 16 },
          ],
        },
      ],
    }],
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

  it("selects one stable group without mixing sibling groups or filling number gaps", () => {
    const entries = buildReadingQuestionEntries(moduleWithNonContinuousGroup());
    const result = selectReadingQuestions(entries, {
      kind: "group",
      questionGroupId: "stable-matching-group",
    });
    expect(result.error).toBeNull();
    expect(result.entries.map((entry) => ({
      number: entry.displayNumber,
      questionId: entry.question.id,
      questionGroupId: entry.group.id,
      sectionId: entry.section.id,
    }))).toEqual([
      { number: 14, questionId: "matching-q14", questionGroupId: "stable-matching-group", sectionId: "section-1" },
      { number: 18, questionId: "matching-q18", questionGroupId: "stable-matching-group", sectionId: "section-1" },
    ]);
    expect(result.entries.some((entry) => entry.question.id === "other-q15")).toBe(false);
    expect(groupSelectedReadingQuestions(result.entries)).toHaveLength(1);
  });

  it("uses stable group IDs for options and reports a removed group explicitly", () => {
    const entries = buildReadingQuestionEntries(moduleWithNonContinuousGroup());
    const options = buildReadingQuestionGroupOptions(entries);
    expect(options.map((option) => option.questionGroupId)).toEqual([
      "stable-matching-group",
      "stable-other-group",
    ]);
    expect(options[0].label).toBe("Passage 1 · One · Questions 14, 18 · Matching Headings");
    expect(selectReadingQuestions(entries, { kind: "group", questionGroupId: "removed-group" }).error)
      .toContain("题组已不存在");
  });

  it("keeps the existing single-Passage pack selectable by its stored group ID", () => {
    const reading = originalDemoPack.modules.find((candidate) => candidate.type === "reading");
    if (!reading || reading.type !== "reading") throw new Error("Reading fixture missing");
    const entries = buildReadingQuestionEntries(reading);
    const storedGroupId = reading.sections[0].questionGroups[0].id;
    const selected = selectReadingQuestions(entries, { kind: "group", questionGroupId: storedGroupId });
    expect(selected.error).toBeNull();
    expect(selected.entries.map((entry) => entry.group.id)).toEqual(
      Array(reading.sections[0].questionGroups[0].questions.length).fill(storedGroupId),
    );
  });
});
