import { afterEach, describe, expect, it, vi } from "vitest";
import { countWords, scheduleDraftAutosave } from "./draftAutosave";

describe("writing draft autosave", () => {
  afterEach(() => vi.useRealTimers());

  it("waits 1000 ms and supports cancellation on another keystroke", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const first = scheduleDraftAutosave(save, 1000);
    await vi.advanceTimersByTimeAsync(800);
    expect(save).not.toHaveBeenCalled();
    first.cancel();
    scheduleDraftAutosave(save, 1000);
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
  });

  it("counts contractions and hyphenated words as single words", () => {
    expect(countWords("A well-designed library doesn't waste space.")).toBe(6);
  });
});
