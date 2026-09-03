import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  AiUnavailableError,
  DisabledAiProvider,
  buildAiContextPreview,
} from "./provider";

describe("disabled AI boundary", () => {
  it("reports disabled health and never produces a model response", async () => {
    const provider = new DisabledAiProvider();

    await expect(provider.testConnection()).resolves.toMatchObject({ status: "disabled" });
    await expect(
      provider.run("lookup_word", { word: "cabinet" }, z.object({ definition: z.string() })),
    ).rejects.toMatchObject({ code: "AI_DISABLED" });
  });

  it("builds an exact user-visible offline context preview", () => {
    const preview = buildAiContextPreview({
      action: "evaluate_writing",
      mode: "study",
      items: [
        {
          id: "context-01",
          kind: "writing-draft",
          label: "Current draft",
          content: "A short local draft.",
        },
      ],
    });

    expect(preview.characterCount).toBe("A short local draft.".length);
    expect(preview.includesUserWriting).toBe(true);
    expect(preview.notice).toContain("No content will be sent");
  });

  it("refuses to build AI context in exam mode", () => {
    expect(() =>
      buildAiContextPreview({ action: "review_question", mode: "exam", items: [] }),
    ).toThrowError(AiUnavailableError);
  });
});
