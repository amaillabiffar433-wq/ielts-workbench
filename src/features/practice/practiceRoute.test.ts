import { describe, expect, it } from "vitest";

import { buildPracticeRoute, parsePracticeRouteIdentity } from "./practiceRoute";

describe("practiceRoute", () => {
  it("builds a canonical identity-bound route", () => {
    expect(buildPracticeRoute("reading", {
      identity: { packId: "second-pack", testId: "second-test" },
      mode: "exam",
    })).toBe("/practice/reading?packId=second-pack&testId=second-test&mode=exam");
  });

  it("preserves stable review source identity and verified audio time", () => {
    expect(buildPracticeRoute("reading", {
      identity: { packId: "source-pack", testId: "source-test" },
      sourceQuestionId: "reading-q17",
    })).toBe("/practice/reading?packId=source-pack&testId=source-test&mode=study&sourceQuestionId=reading-q17");
    expect(buildPracticeRoute("listening", {
      identity: { packId: "source-pack", testId: "source-test" },
      audioStartMs: 42_500,
    })).toBe("/practice/listening?packId=source-pack&testId=source-test&mode=study&tMs=42500");
  });

  it("keeps the legacy identity-free Study route but validates explicit identities", () => {
    expect(buildPracticeRoute("writing")).toBe("/practice/writing");
    expect(parsePracticeRouteIdentity("valid-pack", "valid-test")).toEqual({
      packId: "valid-pack",
      testId: "valid-test",
    });
    expect(parsePracticeRouteIdentity("valid-pack", null)).toBeNull();
    expect(parsePracticeRouteIdentity("../escape", "valid-test")).toBeNull();
  });
});
