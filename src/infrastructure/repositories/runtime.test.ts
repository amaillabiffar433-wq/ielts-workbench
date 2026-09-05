import { afterEach, describe, expect, it } from "vitest";

import { InMemoryLearningRepository } from "./InMemoryLearningRepository";
import { TauriLearningRepository } from "./TauriLearningRepository";
import { createLearningRepository, isTauriRuntime } from "./runtime";

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

const tauriWindow = window as TauriWindow;
const originalTauriInternals = tauriWindow.__TAURI_INTERNALS__;

afterEach(() => {
  if (originalTauriInternals === undefined) {
    delete tauriWindow.__TAURI_INTERNALS__;
  } else {
    tauriWindow.__TAURI_INTERNALS__ = originalTauriInternals;
  }
});

describe("runtime repository selection", () => {
  it("uses the browser repository outside the desktop shell", () => {
    delete tauriWindow.__TAURI_INTERNALS__;

    expect(isTauriRuntime()).toBe(false);
    expect(createLearningRepository()).toBeInstanceOf(InMemoryLearningRepository);
  });

  it("uses the native repository inside Tauri without a browser fallback", () => {
    tauriWindow.__TAURI_INTERNALS__ = {};

    expect(isTauriRuntime()).toBe(true);
    expect(createLearningRepository()).toBeInstanceOf(TauriLearningRepository);
  });
});
