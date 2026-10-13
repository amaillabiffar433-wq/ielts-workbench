import { describe, expect, it } from "vitest";

import { QuestionSchema, type Question } from "./pack";
import { displayQuestionCorrectAnswer, scoreQuestion } from "./questionScoring";

function question(input: unknown): Question {
  return QuestionSchema.parse(input) as Question;
}

describe("Reading question scoring contracts", () => {
  it("keeps Yes/No/Not Given separate from TFNG", () => {
    const item = question({ id: "ynng-1", number: 1, type: "yes-no-not-given", prompt: "Does the writer agree?", correctAnswer: "yes" });
    expect(scoreQuestion(item, "yes").status).toBe("correct");
    expect(scoreQuestion(item, "true").status).toBe("incorrect");
  });

  it("compares exact-set multiple choice without option-order dependence", () => {
    const item = question({
      id: "multi-1", number: 2, type: "multiple-choice", prompt: "Choose two.", points: 1,
      options: [{ id: "multi-a", label: "A", text: "Alpha" }, { id: "multi-b", label: "B", text: "Beta" }, { id: "multi-c", label: "C", text: "Gamma" }],
      selectionCount: 2, additionalNumbers: [], scoringMode: "exact-set", correctOptionIds: ["multi-a", "multi-c"],
    });
    expect(scoreQuestion(item, ["multi-c", "multi-a"])).toEqual({ status: "correct", earnedPoints: 1, scorablePoints: 1 });
    expect(scoreQuestion(item, ["multi-a", "multi-b"]).earnedPoints).toBe(0);
  });

  it("uses the explicit per-correct-option contract for multi-number questions", () => {
    const item = question({
      id: "multi-2", number: 14, type: "multiple-choice", prompt: "Choose two.", points: 2,
      options: [{ id: "opt-a", label: "A", text: "Alpha" }, { id: "opt-b", label: "B", text: "Beta" }, { id: "opt-c", label: "C", text: "Gamma" }],
      selectionCount: 2, additionalNumbers: [15], scoringMode: "per-correct-option", correctOptionIds: ["opt-a", "opt-c"],
    });
    expect(scoreQuestion(item, ["opt-a", "opt-b"])).toEqual({ status: "incorrect", earnedPoints: 1, scorablePoints: 2 });
  });

  it("does not mark questions without a supplied key as wrong", () => {
    const item = question({ id: "match-1", number: 3, type: "matching", prompt: "Match.", matchingKind: "features", allowOptionReuse: true, options: [{ id: "m-a", label: "A", text: "Alice" }, { id: "m-b", label: "B", text: "Bob" }] });
    expect(scoreQuestion(item, "m-a")).toEqual({ status: "unscored", earnedPoints: 0, scorablePoints: 0 });
    expect(displayQuestionCorrectAnswer(item)).toBe("未提供标准答案");
    expect(scoreQuestion(item, undefined)).toEqual({ status: "unscored", earnedPoints: 0, scorablePoints: 0 });
  });

  it("enforces word limits without forgiving spelling or plural changes", () => {
    const item = question({ id: "gap-1", number: 1, type: "short-answer", prompt: "Complete.", maxWords: 1, acceptableAnswers: ["train", "rail service"] });
    expect(scoreQuestion(item, "  TRAIN  ").status).toBe("correct");
    expect(scoreQuestion(item, "trains").status).toBe("incorrect");
    expect(scoreQuestion(item, "rail service").status).toBe("incorrect");
    expect(scoreQuestion(item, "trian").status).toBe("incorrect");
  });

  it("never awards points for over-selection, duplicate or unknown option IDs", () => {
    const item = question({ id: "multi-safe", number: 1, type: "multiple-choice", prompt: "Choose two.", points: 2, selectionCount: 2, additionalNumbers: [2], scoringMode: "per-correct-option", options: [{id: "a", label: "A", text: "One"}, {id: "b", label: "B", text: "Two"}, {id: "c", label: "C", text: "Three"}], correctOptionIds: ["a", "b"] });
    for (const answer of [["a", "b", "c"], ["a", "a", "b"], ["a", "unknown"]]) {
      expect(scoreQuestion(item, answer).earnedPoints).toBe(0);
    }
    expect(scoreQuestion(item, ["b", "a"]).earnedPoints).toBe(2);
  });
});
