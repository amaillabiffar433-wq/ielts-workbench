import { originalDemoPack } from "../demo";
import { InMemoryLearningRepository } from "./InMemoryLearningRepository";
import { createIndexedDbLearningStateStore } from "./IndexedDbLearningStateStore";
import type { LearningRepository } from "./LearningRepository";
import { TauriLearningRepository } from "./TauriLearningRepository";

export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as Window & { __TAURI_INTERNALS__?: unknown })
  );
}

/**
 * Selects native persistence in the desktop shell and a complete original-demo
 * repository in ordinary Vite/browser runs and component tests.
 */
export function createLearningRepository(): LearningRepository {
  if (isTauriRuntime()) {
    return new TauriLearningRepository();
  }

  return InMemoryLearningRepository.withOriginalDemo({
    stateStore: createIndexedDbLearningStateStore(),
    workspace: {
      path: "memory://ielts-workbench-demo",
      id: "memory-demo-workspace",
      displayName: "Browser demo workspace",
      databasePath: "memory://ielts-workbench-demo/ielts-workbench.sqlite3",
      initializedAt: originalDemoPack.manifest.createdAt,
    },
  });
}
