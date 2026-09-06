import { describe, expect, it, vi } from "vitest";

import { handleWritingCloseRequest } from "./writingClose";

describe("writing close coordination", () => {
  it("flushes the draft before allowing the window to close", async () => {
    const events: string[] = [];
    const preventDefault = vi.fn(() => events.push("prevent"));

    await expect(handleWritingCloseRequest(
      { preventDefault },
      {
        flushDraft: async () => { events.push("save"); },
        closeWindow: async () => { events.push("close"); },
        confirmDiscard: vi.fn(),
        onSaveError: vi.fn(),
      },
    )).resolves.toBe("saved");

    expect(events).toEqual(["prevent", "save", "close"]);
  });

  it("keeps the window open after a failed save unless discard is confirmed", async () => {
    const closeWindow = vi.fn(async () => undefined);
    const onSaveError = vi.fn();
    const confirmDiscard = vi.fn(async () => false);
    const failure = new Error("database unavailable");

    await expect(handleWritingCloseRequest(
      { preventDefault: vi.fn() },
      {
        flushDraft: async () => { throw failure; },
        closeWindow,
        confirmDiscard,
        onSaveError,
      },
    )).resolves.toBe("cancelled");

    expect(onSaveError).toHaveBeenCalledWith(failure);
    expect(confirmDiscard).toHaveBeenCalledWith("database unavailable");
    expect(closeWindow).not.toHaveBeenCalled();
  });

  it("allows an explicit discard after a failed save", async () => {
    const closeWindow = vi.fn(async () => undefined);

    await expect(handleWritingCloseRequest(
      { preventDefault: vi.fn() },
      {
        flushDraft: async () => { throw new Error("disk full"); },
        closeWindow,
        confirmDiscard: async () => true,
        onSaveError: vi.fn(),
      },
    )).resolves.toBe("discarded");

    expect(closeWindow).toHaveBeenCalledOnce();
  });
});
