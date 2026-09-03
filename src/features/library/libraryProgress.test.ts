import { describe, expect, it } from "vitest";

import type { PracticeSessionSummary } from "../../infrastructure/repositories/LearningRepository";
import {
  findRecentResumableSession,
  getModuleProgressStatus,
} from "./libraryProgress";

function summary(
  input: Partial<PracticeSessionSummary> & Pick<PracticeSessionSummary, "sessionId">,
): PracticeSessionSummary {
  return {
    packId: "pack-a",
    testId: "test-a",
    moduleType: "reading",
    mode: "study",
    status: "in-progress",
    startedAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    elapsedSeconds: 0,
    ...input,
  };
}

describe("library progress summaries", () => {
  it("uses the newest non-abandoned session independently for each stable module identity", () => {
    const sessions = [
      summary({
        sessionId: "reading-submitted",
        status: "submitted",
        updatedAt: "2026-09-01T10:00:00.000Z",
        submittedAt: "2026-09-01T10:00:00.000Z",
      }),
      summary({
        sessionId: "reading-retry",
        updatedAt: "2026-09-01T12:00:00.000Z",
      }),
      summary({
        sessionId: "listening-submitted",
        moduleType: "listening",
        status: "submitted",
        updatedAt: "2026-09-01T11:00:00.000Z",
        submittedAt: "2026-09-01T11:00:00.000Z",
      }),
      summary({
        sessionId: "writing-abandoned",
        moduleType: "writing",
        status: "abandoned",
        updatedAt: "2026-09-01T13:00:00.000Z",
      }),
      summary({
        sessionId: "other-pack",
        packId: "pack-b",
        updatedAt: "2026-09-01T14:00:00.000Z",
      }),
    ];

    expect(getModuleProgressStatus(sessions, "pack-a", "test-a", "reading")).toBe(
      "in-progress",
    );
    expect(getModuleProgressStatus(sessions, "pack-a", "test-a", "listening")).toBe(
      "completed",
    );
    expect(getModuleProgressStatus(sessions, "pack-a", "test-a", "writing")).toBe(
      "not-started",
    );
  });

  it("finds the newest resumable practice session and skips review or incomplete identities", () => {
    const sessions = [
      summary({
        sessionId: "valid-study",
        updatedAt: "2026-09-01T10:00:00.000Z",
      }),
      summary({
        sessionId: "review-session",
        mode: "review",
        updatedAt: "2026-09-01T12:00:00.000Z",
      }),
      summary({
        sessionId: "missing-pack",
        packId: undefined,
        updatedAt: "2026-09-01T11:00:00.000Z",
      }),
    ];

    expect(findRecentResumableSession(sessions)?.sessionId).toBe("valid-study");
  });
});
