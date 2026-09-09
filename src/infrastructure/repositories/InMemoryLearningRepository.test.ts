import { describe, expect, it } from "vitest";

import { createTextAnchor } from "../../domain";
import {
  ORIGINAL_DEMO_AUDIO_PATH,
  ORIGINAL_DEMO_PACK_FOLDER,
  ORIGINAL_DEMO_WRITING_CHART_PATH,
} from "../demo";
import { InMemoryLearningRepository } from "./InMemoryLearningRepository";
import type { SessionSnapshot } from "./LearningRepository";

function deterministicIds() {
  let next = 0;
  return () => `test-id-${++next}`;
}

describe("InMemoryLearningRepository", () => {
  it("keeps immutable pack source separate from answer and annotation state", async () => {
    const repository = InMemoryLearningRepository.withOriginalDemo({
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      idFactory: deterministicIds(),
    });
    const pack = await repository.loadPack("original-demo-pack");
    expect(pack).not.toBeNull();
    const session = await repository.createSession({
      packId: "original-demo-pack",
      testId: "demo-test-01",
      moduleType: "reading",
      mode: "study",
    });

    const firstAnswer = await repository.saveAnswer({
      sessionId: session.sessionId,
      questionId: "demo-reading-q01",
      value: "false",
    });
    const updatedAnswer = await repository.saveAnswer({
      sessionId: session.sessionId,
      questionId: "demo-reading-q01",
      value: "true",
    });
    expect(updatedAnswer.id).toBe(firstAnswer.id);

    const readingModule = pack?.modules.find((module) => module.type === "reading");
    if (!readingModule || readingModule.type !== "reading") {
      throw new Error("Original demo reading module is missing");
    }
    const block = readingModule.sections[0].contentBlocks[1];
    const start = block.text.indexOf("Alderwick");
    const annotation = await repository.saveAnnotation({
      sessionId: session.sessionId,
      anchor: createTextAnchor(block.id, block.text, start, start + "Alderwick".length),
      style: "highlight-yellow",
      note: "Fictional place name",
    });

    const reloaded = await repository.loadSession(session.sessionId);
    expect(reloaded?.answers).toHaveLength(1);
    expect(reloaded?.answers[0].value).toBe("true");
    expect(reloaded?.annotations).toEqual([annotation]);
    expect(Object.isFrozen(pack)).toBe(true);
    expect(readingModule.sections[0].questionGroups[0].questions[0]).toMatchObject({
      id: "demo-reading-q01",
      correctAnswer: "true",
    });
  });

  it("validates the registered demo folder and returns detached media bytes", async () => {
    const repository = InMemoryLearningRepository.withOriginalDemo();

    await expect(repository.validatePackFolder(ORIGINAL_DEMO_PACK_FOLDER)).resolves.toMatchObject({
      valid: true,
      pack: { id: "original-demo-pack" },
    });
    await expect(repository.validatePackFolder("missing-folder")).resolves.toMatchObject({
      valid: false,
    });

    const first = await repository.readPackMedia("original-demo-pack", ORIGINAL_DEMO_AUDIO_PATH);
    const second = await repository.readPackMedia("original-demo-pack", ORIGINAL_DEMO_AUDIO_PATH);
    expect(first.byteLength).toBe(128_044);
    expect(new TextDecoder().decode(first.slice(0, 4))).toBe("RIFF");
    const audioDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", first))]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    expect(audioDigest).toBe("86d7c2cd3128a2dd61f097b082201a9d0e91d3f989ecc086f62b55c194140ce6");
    first[0] = 0;
    expect(new TextDecoder().decode(second.slice(0, 4))).toBe("RIFF");

    const chart = await repository.readPackMedia(
      "original-demo-pack",
      ORIGINAL_DEMO_WRITING_CHART_PATH,
    );
    expect([...chart.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("rejects an install when the pack ID is already installed", async () => {
    const repository = InMemoryLearningRepository.withOriginalDemo();

    await expect(repository.installPack(ORIGINAL_DEMO_PACK_FOLDER)).rejects.toThrow(
      "Pack is already installed: original-demo-pack",
    );
    await expect(repository.listInstalledPacks()).resolves.toHaveLength(1);
  });

  it("submits an in-progress session with a durable submission timestamp", async () => {
    const submittedAt = "2026-09-01T12:34:56.000Z";
    const repository = InMemoryLearningRepository.withOriginalDemo({
      now: () => new Date(submittedAt),
      idFactory: deterministicIds(),
    });
    const session = await repository.createSession({
      packId: "original-demo-pack",
      testId: "demo-test-01",
      moduleType: "reading",
      mode: "exam",
    });
    await repository.saveAnswer({
      sessionId: session.sessionId,
      questionId: "demo-reading-q01",
      value: "true",
    });

    const submitted = await repository.submitSession(session.sessionId);

    expect(submitted).toMatchObject({
      sessionId: session.sessionId,
      status: "submitted",
      submittedAt,
      updatedAt: submittedAt,
    });
    expect(submitted.answers).toHaveLength(1);
    await expect(repository.loadSession(session.sessionId)).resolves.toEqual(submitted);
    await expect(repository.submitSession(session.sessionId)).resolves.toEqual(submitted);
    await expect(repository.saveAnswer({
      sessionId: session.sessionId,
      questionId: "demo-reading-q02",
      value: "false",
    })).rejects.toThrow(/immutable/i);
  });

  it("persists elapsed time monotonically and freezes it after submission", async () => {
    const repository = InMemoryLearningRepository.withOriginalDemo({ idFactory: deterministicIds() });
    const session = await repository.createSession({
      packId: "original-demo-pack",
      testId: "demo-test-01",
      moduleType: "reading",
      mode: "study",
    });

    await repository.updateSessionElapsed(session.sessionId, 120);
    await repository.updateSessionElapsed(session.sessionId, 75);
    expect((await repository.loadSession(session.sessionId))?.elapsedSeconds).toBe(120);

    await repository.submitSession(session.sessionId);
    await expect(repository.updateSessionElapsed(session.sessionId, 121)).rejects.toThrow(/immutable/i);
  });

  it("exposes ordered durable summaries and derives the newest session", async () => {
    const sessions: SessionSnapshot[] = [
      {
        sessionId: "older-resumable",
        packId: "original-demo-pack",
        testId: "demo-test-01",
        moduleType: "reading",
        mode: "study",
        status: "in-progress",
        startedAt: "2026-09-01T09:00:00.000Z",
        updatedAt: "2026-09-01T10:00:00.000Z",
        answers: [],
        annotations: [],
      },
      {
        sessionId: "newest-submitted",
        packId: "original-demo-pack",
        testId: "demo-test-01",
        moduleType: "listening",
        mode: "exam",
        status: "submitted",
        startedAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
        submittedAt: "2026-09-01T12:00:00.000Z",
        answers: [],
        annotations: [],
      },
      {
        sessionId: "newer-resumable",
        packId: "original-demo-pack",
        testId: "demo-test-01",
        moduleType: "writing",
        mode: "study",
        status: "in-progress",
        startedAt: "2026-09-01T10:30:00.000Z",
        updatedAt: "2026-09-01T11:00:00.000Z",
        answers: [],
        annotations: [],
      },
    ];
    const repository = InMemoryLearningRepository.withOriginalDemo({
      workspace: { path: "memory://demo", displayName: "Demo" },
      sessions,
    });

    const summaries = await repository.listRecentSessions();
    expect(summaries.map((summary) => summary.sessionId)).toEqual([
      "newest-submitted",
      "newer-resumable",
      "older-resumable",
    ]);
    expect(summaries[0]).toMatchObject({
      status: "submitted",
      submittedAt: "2026-09-01T12:00:00.000Z",
      elapsedSeconds: 0,
    });
    await expect(repository.getBootstrapState()).resolves.toMatchObject({
      recentSessionId: "newest-submitted",
      recentSessions: summaries,
    });
  });

  it("autosaves one draft while preserving immutable writing versions", async () => {
    const repository = InMemoryLearningRepository.withOriginalDemo({
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      idFactory: deterministicIds(),
    });
    const session = await repository.createSession({
      packId: "original-demo-pack",
      testId: "demo-test-01",
      moduleType: "writing",
      mode: "study",
    });

    await repository.saveWritingDraft({
      sessionId: session.sessionId,
      taskId: "demo-writing-task-02",
      content: "First local draft",
    });
    const draft = await repository.saveWritingDraft({
      sessionId: session.sessionId,
      taskId: "demo-writing-task-02",
      content: "A revised local draft",
    });
    const version = await repository.createWritingVersion({
      sessionId: session.sessionId,
      taskId: "demo-writing-task-02",
      content: draft.content,
      reason: "manual",
    });

    expect(await repository.loadWritingDraft(session.sessionId, "demo-writing-task-02")).toEqual(draft);
    expect(await repository.listWritingVersions(session.sessionId, "demo-writing-task-02")).toEqual([
      version,
    ]);
  });
});
