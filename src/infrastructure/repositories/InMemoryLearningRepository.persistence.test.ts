import { describe, expect, it } from "vitest";

import { cloneJson } from "../../domain";
import { originalDemoPack } from "../demo";
import {
  InMemoryLearningRepository,
  type InMemoryRepositorySnapshot,
  type InMemoryRepositoryStateStore,
} from "./InMemoryLearningRepository";

class MemoryStateStore implements InMemoryRepositoryStateStore {
  value: InMemoryRepositorySnapshot | null = null;

  async load() {
    return this.value ? cloneJson(this.value) : null;
  }

  async save(snapshot: InMemoryRepositorySnapshot) {
    this.value = cloneJson(snapshot);
  }
}

describe("browser repository persistence boundary", () => {
  it("restores imported packs, settings, sessions, answers, and annotations", async () => {
    const stateStore = new MemoryStateStore();
    const first = new InMemoryLearningRepository({
      stateStore,
      now: () => new Date("2026-09-03T05:00:00.000Z"),
      idFactory: (() => {
        let index = 0;
        return () => `generated-${++index}`;
      })(),
    });
    await first.installImportedPack(originalDemoPack);
    const session = await first.createSession({
      sessionId: "persisted-session",
      packId: originalDemoPack.manifest.id,
      testId: originalDemoPack.manifest.tests[0].id,
      moduleType: "reading",
      mode: "study",
    });
    await first.setSetting("activeSession.original", session.sessionId);
    await first.saveAnswer({
      sessionId: session.sessionId,
      questionId: "demo-reading-q01",
      value: "demo-reading-q01-b",
    });
    await first.saveAnnotation({
      sessionId: session.sessionId,
      anchor: {
        blockId: "demo-reading-paragraph-01",
        startOffset: 0,
        endOffset: 5,
        quote: "Small",
        prefix: "",
        suffix: " rooftop",
      },
      style: "highlight-yellow",
    });

    const reloaded = new InMemoryLearningRepository({ stateStore });
    const bootstrap = await reloaded.getBootstrapState();
    expect(bootstrap.installedPacks.map((pack) => pack.id)).toContain(originalDemoPack.manifest.id);
    expect(await reloaded.getSetting("activeSession.original")).toBe("persisted-session");
    const restoredSession = await reloaded.loadSession("persisted-session");
    expect(restoredSession?.answers[0]).toMatchObject({ questionId: "demo-reading-q01", value: "demo-reading-q01-b" });
    expect(restoredSession?.annotations[0].anchor.quote).toBe("Small");
  });

  it("keeps old browser data compatible when no persisted snapshot exists", async () => {
    const repository = InMemoryLearningRepository.withOriginalDemo({ stateStore: new MemoryStateStore() });
    const bootstrap = await repository.getBootstrapState();
    expect(bootstrap.installedPacks).toHaveLength(1);
    expect((await repository.loadPack("original-demo-pack"))?.manifest.schemaVersion).toBe(1);
  });
});
