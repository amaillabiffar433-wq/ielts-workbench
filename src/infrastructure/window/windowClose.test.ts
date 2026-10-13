import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriHarness = vi.hoisted(() => ({
  confirm: vi.fn<() => Promise<boolean>>(),
  isTauri: vi.fn<() => boolean>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: tauriHarness.isTauri,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: tauriHarness.confirm,
}));

import { confirmAction } from "./windowClose";

describe("confirmAction", () => {
  beforeEach(() => {
    tauriHarness.confirm.mockReset();
    tauriHarness.isTauri.mockReset();
  });

  it("uses the dialog plugin in the desktop runtime", async () => {
    tauriHarness.isTauri.mockReturnValue(true);
    tauriHarness.confirm.mockResolvedValue(false);

    await expect(confirmAction("Continue?")).resolves.toBe(false);
    expect(tauriHarness.confirm).toHaveBeenCalledWith("Continue?", {
      title: "Luma",
      kind: "warning",
    });
  });

  it("uses the browser confirmation fallback outside Tauri", async () => {
    tauriHarness.isTauri.mockReturnValue(false);
    const browserConfirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    await expect(confirmAction("Continue in browser?")).resolves.toBe(true);
    expect(browserConfirm).toHaveBeenCalledWith("Continue in browser?");
    expect(tauriHarness.confirm).not.toHaveBeenCalled();

    browserConfirm.mockRestore();
  });
});
