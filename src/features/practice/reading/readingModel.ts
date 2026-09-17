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
  | { readonly kind: "group"; readonly questionGroupId: string }
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

export type ReadingQuestionGroupOption = SelectedReadingQuestionGroup & {
  readonly questionGroupId: string;
  readonly label: string;
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
  if (entries.length === 0) return "This Reading module has no available questions.";
  const numbers = entries.map((entry) => entry.displayNumber);
  return `Available question numbers are ${Math.min(...numbers)}–${Math.max(...numbers)}.`;
}

function validateUniqueNumber(
  entries: readonly ReadingQuestionEntry[],
  number: number,
): string | null {
  const matches = entries.filter((entry) => entry.displayNumber === number);
  if (matches.length === 0) return `Question ${number} does not exist in this Reading module.`;
  if (matches.length > 1) return `Question ${number} is not unique in this pack and cannot be selected safely.`;
  return null;
}

export function selectReadingQuestions(
  entries: readonly ReadingQuestionEntry[],
  selection: ReadingQuestionSelection,
): ReadingQuestionSelectionResult {
  if (entries.length === 0) {
    return { entries: [], error: "This Reading module has no available questions." };
  }

  if (selection.kind === "all") return { entries, error: null };

  if (selection.kind === "passage") {
    const selected = entries.filter((entry) => entry.section.id === selection.sectionId);
    return selected.length > 0
      ? { entries: selected, error: null }
      : { entries: [], error: "The selected passage no longer exists or contains no questions." };
  }

  if (selection.kind === "group") {
    const selected = entries.filter((entry) => entry.group.id === selection.questionGroupId);
    return selected.length > 0
      ? { entries: selected, error: null }
      : { entries: [], error: "The selected question group no longer exists or contains no questions." };
  }

  if (selection.kind === "single") {
    if (!Number.isInteger(selection.number) || selection.number < 1) {
      return { entries: [], error: "Enter a valid question number." };
    }
    const error = validateUniqueNumber(entries, selection.number);
    return error
      ? { entries: [], error: `${error}${error.includes("does not exist") ? ` ${availableNumberSummary(entries)}` : ""}` }
      : {
          entries: entries.filter((entry) => entry.displayNumber === selection.number),
          error: null,
        };
  }

  if (!Number.isInteger(selection.start) || !Number.isInteger(selection.end)
      || selection.start < 1 || selection.end < 1) {
    return { entries: [], error: "Enter a valid start and end question number." };
  }
  if (selection.start > selection.end) {
    return { entries: [], error: "The start question cannot be greater than the end question." };
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

const questionTypeLabels: Readonly<Record<Question["type"], string>> = {
  "single-choice": "Single Choice",
  "multiple-choice": "Multiple Choice",
  "true-false-not-given": "True / False / Not Given",
  "yes-no-not-given": "Yes / No / Not Given",
  matching: "Matching",
  "short-answer": "Short Answer",
  "fill-blank": "Fill in the Blank",
};

function questionNumberLabel(entries: readonly ReadingQuestionEntry[]): string {
  const numbers = entries.map((entry) => entry.displayNumber);
  if (numbers.length === 1) return `Question ${numbers[0]}`;
  const isContinuous = numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1);
  return isContinuous
    ? `Questions ${numbers[0]}–${numbers.at(-1)}`
    : `Questions ${numbers.join(", ")}`;
}

function questionGroupDescriptor(group: SelectedReadingQuestionGroup): string {
  const title = group.group.title?.trim() ?? "";
  const titleWithoutNumberPrefix = title.replace(
    /^questions?\s+\d+(?:(?:\s*[-–—]\s*\d+)|(?:\s*,\s*\d+)*)\s*(?:[/:·—-]\s*)?/i,
    "",
  ).trim();
  if (titleWithoutNumberPrefix) return titleWithoutNumberPrefix;
  const questionTypes = [...new Set(group.entries.map((entry) => entry.question.type))];
  return questionTypes.length === 1 ? questionTypeLabels[questionTypes[0]] : "Mixed Questions";
}

export function buildReadingQuestionGroupOptions(
  entries: readonly ReadingQuestionEntry[],
): ReadingQuestionGroupOption[] {
  return groupSelectedReadingQuestions(entries).map((group) => ({
    ...group,
    questionGroupId: group.group.id,
    label: `${passageLabel(group.section, group.sectionIndex)} · ${questionNumberLabel(group.entries)} · ${questionGroupDescriptor(group)}`,
  }));
}

export function questionSelectionLabel(
  selection: ReadingQuestionSelection,
  entries: readonly ReadingQuestionEntry[],
  module: ReadingModule,
): string {
  if (selection.kind === "all") {
    if (entries.length === 0) return "All questions";
    return `All questions · Question ${entries[0].displayNumber}–${entries.at(-1)?.displayNumber}`;
  }
  if (selection.kind === "passage") {
    const sectionIndex = module.sections.findIndex((section) => section.id === selection.sectionId);
    const section = module.sections[sectionIndex];
    return section ? `${passageLabel(section, sectionIndex)} questions` : "Selected passage questions";
  }
  if (selection.kind === "group") {
    return buildReadingQuestionGroupOptions(entries).find(
      (option) => option.questionGroupId === selection.questionGroupId,
    )?.label ?? "Selected question group";
  }
  if (selection.kind === "single") return `Question ${selection.number}`;
  return `Question ${selection.start}–${selection.end}`;
}
