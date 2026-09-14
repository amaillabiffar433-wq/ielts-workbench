import { afterEach, describe, expect, it, vi } from "vitest";
import { toggleWindowFullscreen } from "./windowPresentation";

const native = vi.hoisted(() => ({ isTauri: vi.fn(() => true), isFullscreen: vi.fn(), setFullscreen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: native.isTauri }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => native }));

describe("window presentation", () => {
  afterEach(() => vi.clearAllMocks());
  it.each([false, true])("toggles only the current native window from fullscreen=%s", async (fullscreen) => {
    native.isFullscreen.mockResolvedValue(fullscreen);
    await toggleWindowFullscreen();
    expect(native.setFullscreen).toHaveBeenCalledWith(!fullscreen);
  });
  it("propagates fullscreen failure for visible feedback", async () => {
    native.isFullscreen.mockRejectedValueOnce(new Error("window unavailable"));
    await expect(toggleWindowFullscreen()).rejects.toThrow("window unavailable");
    expect(native.setFullscreen).not.toHaveBeenCalled();
  });
});
