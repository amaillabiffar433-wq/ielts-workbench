import type { ReadingModule } from "../../../domain";
import {
  buildReadingQuestionEntries,
  selectReadingQuestions,
  type ReadingQuestionSelection,
} from "./readingModel";

export type ReadingPaneView = "passage" | "questions" | "whole";
export type ReadingQuestionScope = "all" | "passage" | "group" | "range" | "single";

export type ReadingPaneState = {
  readonly view: ReadingPaneView;
  readonly passageId: string;
  readonly questionScope: ReadingQuestionScope;
  readonly questionPassageId: string;
  readonly questionGroupId: string;
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly singleNumber: number;
  readonly scrollPositions: Readonly<Record<string, number>>;
};

export type ReadingViewState = {
  readonly version: 1;
  readonly left: ReadingPaneState;
  readonly right: ReadingPaneState;
};

export type NormalizedReadingViewState = {
  readonly state: ReadingViewState;
  readonly recovered: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function cleanScrollPositions(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, scrollTop]) => (
        key.length <= 256
        && typeof scrollTop === "number"
        && Number.isFinite(scrollTop)
        && scrollTop >= 0
      ))
      .slice(0, 64),
  ) as Record<string, number>;
}

export function createDefaultReadingViewState(module: ReadingModule): ReadingViewState {
  const entries = buildReadingQuestionEntries(module);
  const firstSectionId = module.sections[0]?.id ?? "";
  const firstQuestionNumber = entries[0]?.displayNumber ?? 1;
  const lastQuestionNumber = entries.at(-1)?.displayNumber ?? firstQuestionNumber;
  const base = {
    passageId: firstSectionId,
    questionScope: "passage" as const,
    questionPassageId: firstSectionId,
    questionGroupId: entries[0]?.group.id ?? "",
    rangeStart: firstQuestionNumber,
    rangeEnd: lastQuestionNumber,
    singleNumber: firstQuestionNumber,
    scrollPositions: {},
  };
  return {
    version: 1,
    left: { ...base, view: "passage" },
    right: { ...base, view: "questions" },
  };
}

export function paneQuestionSelection(state: ReadingPaneState): ReadingQuestionSelection {
  switch (state.questionScope) {
    case "all": return { kind: "all" };
    case "passage": return { kind: "passage", sectionId: state.questionPassageId };
    case "group": return { kind: "group", questionGroupId: state.questionGroupId };
    case "range": return { kind: "range", start: state.rangeStart, end: state.rangeEnd };
    case "single": return { kind: "single", number: state.singleNumber };
  }
}

export function readingPaneContentKey(state: ReadingPaneState): string {
  if (state.view === "passage") return `passage:${state.passageId}`;
  if (state.view === "whole") return "whole";
  const selection = paneQuestionSelection(state);
  if (selection.kind === "all") return "questions:all";
  if (selection.kind === "passage") return `questions:passage:${selection.sectionId}`;
  if (selection.kind === "group") return `questions:group:${selection.questionGroupId}`;
  if (selection.kind === "single") return `questions:single:${selection.number}`;
  return `questions:range:${selection.start}-${selection.end}`;
}

function normalizePane(
  input: unknown,
  fallback: ReadingPaneState,
  module: ReadingModule,
): { state: ReadingPaneState; recovered: boolean } {
  if (!isRecord(input)) return { state: fallback, recovered: input !== undefined };
  let recovered = false;
  const sectionIds = new Set(module.sections.map((section) => section.id));
  const entries = buildReadingQuestionEntries(module);
  const questionGroupIds = new Set(entries.map((entry) => entry.group.id));

  const view = input.view === "passage" || input.view === "questions" || input.view === "whole"
    ? input.view
    : fallback.view;
  if (view !== input.view) recovered = true;

  const passageId = typeof input.passageId === "string" && sectionIds.has(input.passageId)
    ? input.passageId
    : fallback.passageId;
  if (passageId !== input.passageId) recovered = true;

  const questionPassageId = typeof input.questionPassageId === "string"
      && sectionIds.has(input.questionPassageId)
    ? input.questionPassageId
    : fallback.questionPassageId;
  if (questionPassageId !== input.questionPassageId) recovered = true;

  let questionScope: ReadingQuestionScope = input.questionScope === "all"
      || input.questionScope === "passage"
      || input.questionScope === "group"
      || input.questionScope === "range"
      || input.questionScope === "single"
    ? input.questionScope
    : fallback.questionScope;
  if (questionScope !== input.questionScope) recovered = true;

  const questionGroupId = typeof input.questionGroupId === "string"
      && questionGroupIds.has(input.questionGroupId)
    ? input.questionGroupId
    : fallback.questionGroupId;
  if (questionScope === "group" && questionGroupId !== input.questionGroupId) recovered = true;

  const rangeStart = numberOr(input.rangeStart, fallback.rangeStart);
  const rangeEnd = numberOr(input.rangeEnd, fallback.rangeEnd);
  const singleNumber = numberOr(input.singleNumber, fallback.singleNumber);
  if (rangeStart !== input.rangeStart || rangeEnd !== input.rangeEnd || singleNumber !== input.singleNumber) {
    recovered = true;
  }

  const candidate: ReadingPaneState = {
    view,
    passageId,
    questionScope,
    questionPassageId,
    questionGroupId,
    rangeStart,
    rangeEnd,
    singleNumber,
    scrollPositions: cleanScrollPositions(input.scrollPositions),
  };
  if (questionScope !== "all" && selectReadingQuestions(entries, paneQuestionSelection(candidate)).error) {
    questionScope = "all";
    recovered = true;
  }
  return { state: { ...candidate, questionScope }, recovered };
}

export function normalizeReadingViewState(
  input: unknown,
  module: ReadingModule,
): NormalizedReadingViewState {
  const fallback = createDefaultReadingViewState(module);
  if (!isRecord(input) || input.version !== 1) {
    return { state: fallback, recovered: input !== null && input !== undefined };
  }
  const left = normalizePane(input.left, fallback.left, module);
  const right = normalizePane(input.right, fallback.right, module);
  return {
    state: { version: 1, left: left.state, right: right.state },
    recovered: left.recovered || right.recovered,
  };
}

export function parseReadingViewState(
  value: string | null,
  module: ReadingModule,
): NormalizedReadingViewState {
  if (!value) return { state: createDefaultReadingViewState(module), recovered: false };
  try {
    return normalizeReadingViewState(JSON.parse(value), module);
  } catch {
    return { state: createDefaultReadingViewState(module), recovered: true };
  }
}

export function readingViewStateSettingKey(sessionId: string): string {
  return `reading.viewState.v1.${sessionId}`;
}
