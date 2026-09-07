import { describe, expect, it } from "vitest";

import type { ReadingModule } from "../../../domain";
import { originalDemoPack } from "../../../infrastructure/demo/originalDemoPack";
import {
  createDefaultReadingViewState,
  normalizeReadingViewState,
  paneQuestionSelection,
  parseReadingViewState,
  readingPaneContentKey,
  readingViewStateSettingKey,
} from "./readingViewState";

function moduleWithSecondPassage(): ReadingModule {
  const reading = originalDemoPack.modules.find((module) => module.type === "reading");
  if (!reading || reading.type !== "reading") throw new Error("Reading fixture missing");
  return {
    ...reading,
    sections: [
      reading.sections[0],
      {
        ...reading.sections[0],
        id: "second-section",
        title: "Second",
        contentBlocks: reading.sections[0].contentBlocks.map((block, index) => ({ ...block, id: `second-block-${index}` })),
        questionGroups: reading.sections[0].questionGroups.map((group, groupIndex) => ({
          ...group,
          id: `second-group-${groupIndex}`,
          questions: group.questions.map((question, questionIndex) => ({ ...question, id: `second-question-${groupIndex}-${questionIndex}`, number: question.number + 6 })),
        })),
      },
    ],
  };
}

describe("Reading pane view persistence", () => {
  it("keeps independent pane selections and scroll positions", () => {
    const module = moduleWithSecondPassage();
    const defaults = createDefaultReadingViewState(module);
    const input = {
      version: 1,
      left: { ...defaults.left, passageId: "second-section", scrollPositions: { "passage:second-section": 320 } },
      right: { ...defaults.right, questionScope: "single", singleNumber: 8, scrollPositions: { "questions:single:8": 90 } },
    };
    const restored = normalizeReadingViewState(input, module);
    expect(restored.recovered).toBe(false);
    expect(restored.state.left.passageId).toBe("second-section");
    expect(paneQuestionSelection(restored.state.right)).toEqual({ kind: "single", number: 8 });
    expect(readingPaneContentKey(restored.state.left)).toBe("passage:second-section");
    expect(restored.state.right.scrollPositions["questions:single:8"]).toBe(90);
  });

  it("falls back safely when an old view references missing content", () => {
    const module = moduleWithSecondPassage();
    const defaults = createDefaultReadingViewState(module);
    const restored = normalizeReadingViewState({
      version: 1,
      left: { ...defaults.left, passageId: "removed-passage" },
      right: { ...defaults.right, questionScope: "single", singleNumber: 99 },
    }, module);
    expect(restored.recovered).toBe(true);
    expect(restored.state.left.passageId).toBe(module.sections[0].id);
    expect(restored.state.right.questionScope).toBe("all");
  });

  it("does not treat an absent setting as corruption and scopes settings to the session", () => {
    const module = moduleWithSecondPassage();
    expect(parseReadingViewState(null, module).recovered).toBe(false);
    expect(parseReadingViewState("not-json", module).recovered).toBe(true);
    expect(readingViewStateSettingKey("session-abc")).toBe("reading.viewState.v1.session-abc");
  });
});
