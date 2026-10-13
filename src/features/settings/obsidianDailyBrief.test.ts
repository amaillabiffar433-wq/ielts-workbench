import { describe, expect, it } from "vitest";
import { buildObsidianDailyBrief, localIsoDate } from "./obsidianDailyBrief";

describe("Obsidian daily brief", () => {
  it("labels all-time and today metrics without inventing writing scores", () => {
    const result = buildObsidianDailyBrief({
      sessions: 2, completed: 1, elapsedSeconds: 1_800, todaySeconds: 600, retakes: 0,
      earnedPoints: 7, scorablePoints: 10, mistakes: 3, activeDays: 1, streakDays: 1,
      recentDays: [],
      byQuestionType: [],
      byModule: [
        { moduleType: "listening", sessions: 1, completed: 1, elapsedSeconds: 1_200, earnedPoints: 7, scorablePoints: 10 },
        { moduleType: "reading", sessions: 0, completed: 0, elapsedSeconds: 0, earnedPoints: 0, scorablePoints: 0 },
        { moduleType: "writing", sessions: 1, completed: 0, elapsedSeconds: 600, earnedPoints: 0, scorablePoints: 0 },
      ],
    }, 4, "2026-09-17");
    expect(result).toContain("Focus today: 0h 10m");
    expect(result).toContain("Objective accuracy, all time: 70% (7/10)");
    expect(result).toContain("Writing: 0 completed · 0h 10m");
    expect(result).toContain("Writing quality is not auto-scored");
  });

  it("uses a local calendar date", () => {
    expect(localIsoDate(new Date(2026, 8, 7, 23, 0, 0))).toBe("2026-09-07");
  });
});
