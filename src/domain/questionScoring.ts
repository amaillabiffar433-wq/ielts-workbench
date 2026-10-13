import type { Question } from "./pack";

export type QuestionAnswerValue = string | readonly string[];
export type QuestionScoreStatus = "unanswered" | "unscored" | "correct" | "incorrect";

export type QuestionScore = {
  readonly status: QuestionScoreStatus;
  readonly earnedPoints: number;
  readonly scorablePoints: number;
};

function normalizedText(value: string, caseSensitive = false): string {
  const compact = value.normalize("NFKC").replace(/[‘’]/gu, "'").trim().replace(/\s+/gu, " ");
  return caseSensitive ? compact : compact.toLocaleLowerCase();
}

export function answerIsPresent(value: QuestionAnswerValue | undefined): boolean {
  return Array.isArray(value)
    ? value.some((item) => item.trim().length > 0)
    : typeof value === "string" && value.trim().length > 0;
}

export function questionNumberLabel(question: Question): string {
  return question.type === "multiple-choice" && question.additionalNumbers.length > 0
    ? [question.number, ...question.additionalNumbers].join(", ")
    : String(question.number);
}

export function scoreQuestion(
  question: Question,
  answer: QuestionAnswerValue | undefined,
): QuestionScore {
  const hasAnswerKey = question.type === "multiple-choice"
    ? question.correctOptionIds.length === question.selectionCount
    : question.type === "single-choice" || question.type === "matching"
      ? Boolean(question.correctOptionId)
      : question.type === "true-false-not-given" || question.type === "yes-no-not-given"
        ? Boolean(question.correctAnswer)
        : question.acceptableAnswers.length > 0;
  if (!hasAnswerKey) return { status: "unscored", earnedPoints: 0, scorablePoints: 0 };
  if (!answerIsPresent(answer)) return { status: "unanswered", earnedPoints: 0, scorablePoints: question.points };

  if (question.type === "multiple-choice") {
    const selections = Array.isArray(answer) ? answer : [answer];
    const selected = new Set(selections);
    if (selected.size !== selections.length || selected.size > question.selectionCount
      || [...selected].some((id) => !question.options.some((option) => option.id === id))) {
      return { status: "incorrect", earnedPoints: 0, scorablePoints: question.points };
    }
    const correct = new Set(question.correctOptionIds);
    const exact = selected.size === correct.size && [...selected].every((id) => correct.has(id));
    if (question.scoringMode === "exact-set") {
      return {
        status: exact ? "correct" : "incorrect",
        earnedPoints: exact ? question.points : 0,
        scorablePoints: question.points,
      };
    }
    const earnedPoints = [...selected].filter((id) => correct.has(id)).length;
    return {
      status: exact ? "correct" : "incorrect",
      earnedPoints,
      scorablePoints: question.points,
    };
  }

  const userAnswer = typeof answer === "string" ? answer : answer?.join(" ") ?? "";
  if (question.type === "single-choice" || question.type === "matching") {
    const correct = userAnswer === question.correctOptionId!;
    return { status: correct ? "correct" : "incorrect", earnedPoints: correct ? question.points : 0, scorablePoints: question.points };
  }
  if (question.type === "true-false-not-given" || question.type === "yes-no-not-given") {
    const correct = normalizedText(userAnswer) === normalizedText(question.correctAnswer!);
    return { status: correct ? "correct" : "incorrect", earnedPoints: correct ? question.points : 0, scorablePoints: question.points };
  }
  const wordCount = normalizedText(userAnswer).split(/\s+/u).filter(Boolean).length;
  if (question.maxWords !== undefined && wordCount > question.maxWords) {
    return { status: "incorrect", earnedPoints: 0, scorablePoints: question.points };
  }
  const correct = question.acceptableAnswers.some((candidate) => (
    normalizedText(candidate, question.caseSensitive) === normalizedText(userAnswer, question.caseSensitive)
  ));
  return { status: correct ? "correct" : "incorrect", earnedPoints: correct ? question.points : 0, scorablePoints: question.points };
}

export function displayQuestionAnswer(question: Question, answer: QuestionAnswerValue | undefined): string {
  if (!answerIsPresent(answer)) return "（未作答）";
  const values = Array.isArray(answer) ? answer : [answer];
  if (question.type === "single-choice" || question.type === "multiple-choice" || question.type === "matching") {
    return values.map((id) => question.options.find((option) => option.id === id)?.text ?? id).join("；");
  }
  return values.join("；");
}

export function displayQuestionCorrectAnswer(question: Question): string {
  if (question.type === "single-choice" || question.type === "matching") {
    return question.correctOptionId
      ? question.options.find((option) => option.id === question.correctOptionId)?.text ?? question.correctOptionId
      : "未提供标准答案";
  }
  if (question.type === "multiple-choice") {
    return question.correctOptionIds.length > 0
      ? question.correctOptionIds.map((id) => question.options.find((option) => option.id === id)?.text ?? id).join("；")
      : "未提供标准答案";
  }
  if (question.type === "true-false-not-given" || question.type === "yes-no-not-given") {
    return question.correctAnswer?.replace("not-given", "Not Given") ?? "未提供标准答案";
  }
  return question.acceptableAnswers.join(" / ") || "未提供标准答案";
}
