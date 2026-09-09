import { describe, expect, it } from "vitest";

import { derivePracticeElapsed, formatPracticeTime } from "./practiceTimer";

describe("practice timer persistence rules", () => {
  it("adds only active mounted time for Study", () => {
    expect(derivePracticeElapsed("study", 42, undefined, 10_000, 15_900)).toEqual({ elapsedSeconds: 47, warning: null });
  });

  it("keeps Exam time running from the persisted startedAt", () => {
    expect(derivePracticeElapsed("exam", 20, "2026-09-09T00:00:00.000Z", 0, Date.parse("2026-09-09T00:02:00.000Z"))).toEqual({ elapsedSeconds: 120, warning: null });
  });

  it("does not fabricate time when the clock or timestamp is invalid", () => {
    expect(derivePracticeElapsed("exam", 55, "broken", 0, 10_000)).toEqual({ elapsedSeconds: 55, warning: "考试开始时间无效；已保留上次可靠用时。" });
    expect(derivePracticeElapsed("exam", 55, "2026-09-09T00:02:00.000Z", 0, Date.parse("2026-09-09T00:00:00.000Z")).warning).toContain("系统时间");
  });

  it("formats durations longer than an hour without wrapping", () => {
    expect(formatPracticeTime(3_661)).toBe("1:01:01");
  });
});
