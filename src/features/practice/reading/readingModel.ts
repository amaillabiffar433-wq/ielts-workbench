import type { Question, ReadingModule } from "../../../domain";

export type ReadingSection = ReadingModule["sections"][number];
export type ReadingQuestionGroup = ReadingSection["questionGroups"][number];

export type ReadingQuestionEntry = {
  readonly question: Question;
  readonly section: ReadingSection;
  readonly sectionIndex: number;
  readonly group: ReadingQuestionGroup;
  readonly groupIndex: number;
  readonly moduleOrder: number;
  readonly displayNumber: number;
};

export type ReadingQuestionSelection =
  | { readonly kind: "all" }
  | { readonly kind: "passage"; readonly sectionId: string }
  | { readonly kind: "range"; readonly start: number; readonly end: number }
  | { readonly kind: "single"; readonly number: number };

export type ReadingQuestionSelectionResult = {
  readonly entries: readonly ReadingQuestionEntry[];
  readonly error: string | null;
};

export type SelectedReadingQuestionGroup = {
  readonly section: ReadingSection;
  readonly sectionIndex: number;
  readonly group: ReadingQuestionGroup;
  readonly groupIndex: number;
  readonly entries: readonly ReadingQuestionEntry[];
};

export function buildReadingQuestionEntries(module: ReadingModule): ReadingQuestionEntry[] {
  const entries: ReadingQuestionEntry[] = [];
  module.sections.forEach((section, sectionIndex) => {
    section.questionGroups.forEach((group, groupIndex) => {
      group.questions.forEach((question) => {
        const moduleOrder = entries.length;
        entries.push({
          question,
          section,
          sectionIndex,
          group,
          groupIndex,
          moduleOrder,
          displayNumber: question.number ?? moduleOrder + 1,
        });
      });
    });
  });
  return entries;
}

function availableNumberSummary(entries: readonly ReadingQuestionEntry[]): string {
  if (entries.length === 0) return "当前 Reading 模块没有可用题目。";
  const numbers = entries.map((entry) => entry.displayNumber);
  return `当前可用题号为 Question ${Math.min(...numbers)}–${Math.max(...numbers)}。`;
}

function validateUniqueNumber(
  entries: readonly ReadingQuestionEntry[],
  number: number,
): string | null {
  const matches = entries.filter((entry) => entry.displayNumber === number);
  if (matches.length === 0) return `Question ${number} 不存在于当前 Reading 模块。`;
  if (matches.length > 1) return `Question ${number} 在题包中不唯一，无法安全选择。`;
  return null;
}

export function selectReadingQuestions(
  entries: readonly ReadingQuestionEntry[],
  selection: ReadingQuestionSelection,
): ReadingQuestionSelectionResult {
  if (entries.length === 0) {
    return { entries: [], error: "当前 Reading 模块没有可用题目。" };
  }

  if (selection.kind === "all") return { entries, error: null };

  if (selection.kind === "passage") {
    const selected = entries.filter((entry) => entry.section.id === selection.sectionId);
    return selected.length > 0
      ? { entries: selected, error: null }
      : { entries: [], error: "所选 Passage 已不存在或不包含题目。" };
  }

  if (selection.kind === "single") {
    if (!Number.isInteger(selection.number) || selection.number < 1) {
      return { entries: [], error: "请输入有效的单题题号。" };
    }
    const error = validateUniqueNumber(entries, selection.number);
    return error
      ? { entries: [], error: `${error}${error.includes("不存在") ? ` ${availableNumberSummary(entries)}` : ""}` }
      : {
          entries: entries.filter((entry) => entry.displayNumber === selection.number),
          error: null,
        };
  }

  if (!Number.isInteger(selection.start) || !Number.isInteger(selection.end)
      || selection.start < 1 || selection.end < 1) {
    return { entries: [], error: "请输入有效的起止题号。" };
  }
  if (selection.start > selection.end) {
    return { entries: [], error: "起始题号不能大于结束题号。" };
  }

  for (let number = selection.start; number <= selection.end; number += 1) {
    const error = validateUniqueNumber(entries, number);
    if (error) {
      return { entries: [], error: `${error} ${availableNumberSummary(entries)}` };
    }
  }

  return {
    entries: entries.filter(
      (entry) => entry.displayNumber >= selection.start && entry.displayNumber <= selection.end,
    ),
    error: null,
  };
}

export function groupSelectedReadingQuestions(
  entries: readonly ReadingQuestionEntry[],
): SelectedReadingQuestionGroup[] {
  const groups: SelectedReadingQuestionGroup[] = [];
  for (const entry of entries) {
    const previous = groups.at(-1);
    if (previous?.section.id === entry.section.id && previous.group.id === entry.group.id) {
      groups[groups.length - 1] = { ...previous, entries: [...previous.entries, entry] };
    } else {
      groups.push({
        section: entry.section,
        sectionIndex: entry.sectionIndex,
        group: entry.group,
        groupIndex: entry.groupIndex,
        entries: [entry],
      });
    }
  }
  return groups;
}

export function passageLabel(section: ReadingSection, sectionIndex: number): string {
  return `Passage ${sectionIndex + 1} · ${section.title}`;
}

export function questionSelectionLabel(
  selection: ReadingQuestionSelection,
  entries: readonly ReadingQuestionEntry[],
  module: ReadingModule,
): string {
  if (selection.kind === "all") {
    if (entries.length === 0) return "全部题目";
    return `全部题目 · Question ${entries[0].displayNumber}–${entries.at(-1)?.displayNumber}`;
  }
  if (selection.kind === "passage") {
    const sectionIndex = module.sections.findIndex((section) => section.id === selection.sectionId);
    const section = module.sections[sectionIndex];
    return section ? `${passageLabel(section, sectionIndex)} 的题目` : "所选 Passage 的题目";
  }
  if (selection.kind === "single") return `Question ${selection.number}`;
  return `Question ${selection.start}–${selection.end}`;
}
