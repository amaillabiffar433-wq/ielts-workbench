import { describe, expect, it } from "vitest";
import { originalDemoPack } from "../../infrastructure/demo/originalDemoPack";
import type { PracticeSessionSummary, SessionSnapshot } from "../../infrastructure/repositories/LearningRepository";
import { buildLearningAnalytics, formatStudyDuration } from "./learningAnalytics";

const submitted: PracticeSessionSummary = {
  sessionId: "analytics-reading-session",
  packId: originalDemoPack.manifest.id,
  testId: "demo-test-01",
  moduleType: "reading",
  mode: "study",
  status: "submitted",
  startedAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T01:00:00.000Z",
  submittedAt: "2026-09-17T01:00:00.000Z",
  elapsedSeconds: 120,
};

const snapshot: SessionSnapshot = {
  ...submitted,
  answers: [
    { id: "answer-1", sessionId: submitted.sessionId, questionId: "demo-reading-q01", value: "true", updatedAt: submitted.updatedAt },
    { id: "answer-2", sessionId: submitted.sessionId, questionId: "demo-reading-q02", value: "true", updatedAt: submitted.updatedAt },
  ],
  annotations: [],
};

describe("learning analytics", () => {
  it("derives time, accuracy, mistakes, activity, and module totals only from durable data", () => {
    const writing: PracticeSessionSummary = {
      sessionId: "analytics-writing-session",
      packId: originalDemoPack.manifest.id,
      testId: "demo-test-01",
      moduleType: "writing",
      mode: "study",
      status: "in-progress",
      startedAt: "2026-09-17T02:00:00.000Z",
      updatedAt: "2026-09-17T02:01:00.000Z",
      elapsedSeconds: 60,
    };
    const result = buildLearningAnalytics(
      [originalDemoPack],
      [submitted, writing],
      new Map([[snapshot.sessionId, snapshot]]),
      new Date("2026-09-17T12:00:00"),
    );

    expect(result.sessions).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.elapsedSeconds).toBe(180);
    expect(result.todaySeconds).toBe(180);
    expect(result.earnedPoints).toBe(1);
    expect(result.scorablePoints).toBe(6);
    expect(result.mistakes).toBe(5);
    expect(result.activeDays).toBe(1);
    expect(result.streakDays).toBe(1);
    expect(result.byModule.find((module) => module.moduleType === "reading")).toMatchObject({ sessions: 1, completed: 1, elapsedSeconds: 120 });
    expect(result.byModule.find((module) => module.moduleType === "writing")).toMatchObject({ sessions: 1, completed: 0, elapsedSeconds: 60 });
    expect(result.recentDays.at(-1)).toMatchObject({ elapsedSeconds: 180, sessions: 2, earnedPoints: 1, scorablePoints: 6 });
    expect(result.byQuestionType.reduce((sum, item) => sum + item.attempts, 0)).toBe(6);
  });

  it("formats measured durations without inventing precision", () => {
    expect(formatStudyDuration(0)).toBe("0 min");
    expect(formatStudyDuration(12)).toBe("<1 min");
    expect(formatStudyDuration(3_900)).toBe("1h 5m");
  });
});
