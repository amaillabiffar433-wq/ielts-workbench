import { describe, expect, it } from "vitest";

import { parseIeltsPack } from "../../domain/pack/schemas";
import { originalDemoPack } from "../demo/originalDemoPack";
import { TauriLearningRepository, type TauriInvoke } from "./TauriLearningRepository";

function mockInvoke(responses: Readonly<Record<string, unknown>>): TauriInvoke {
  return async <T>(command: string): Promise<T> => {
    if (!(command in responses)) {
      throw new Error(`Unexpected command: ${command}`);
    }
    return structuredClone(responses[command]) as T;
  };
}

describe("TauriLearningRepository", () => {
  it("normalizes an unconfigured native bootstrap without querying workspace data", async () => {
    const baseInvoke = mockInvoke({
      get_bootstrap_state: {
        configured: false,
        available: false,
        workspacePath: null,
        workspaceId: null,
        error: null,
      },
    });
    let callCount = 0;
    const invokeCommand: TauriInvoke = async <T>(command: string, args?: Record<string, unknown>) => {
      callCount += 1;
      return baseInvoke<T>(command, args);
    };
    const repository = new TauriLearningRepository(invokeCommand);

    await expect(repository.getBootstrapState()).resolves.toEqual({
      configured: false,
      available: false,
      workspace: null,
      error: null,
      installedPacks: [],
      recentSessions: [],
      recentSessionId: null,
    });
    expect(callCount).toBe(1);
  });

  it("normalizes the native empty session snapshot", async () => {
    const repository = new TauriLearningRepository(
      mockInvoke({
        load_session: {
          sessionId: "empty-session",
          session: null,
          answers: [],
          annotations: [],
        },
      }),
    );

    await expect(repository.loadSession("empty-session")).resolves.toEqual({
      sessionId: "empty-session",
      mode: "study",
      status: "in-progress",
      elapsedSeconds: 0,
      answers: [],
      annotations: [],
    });
  });

  it("normalizes and orders native summaries and derives the most recent session id", async () => {
    const repository = new TauriLearningRepository(
      mockInvoke({
        get_bootstrap_state: {
          configured: true,
          available: true,
          workspacePath: "D:\\IELTS",
          workspaceId: "workspace-1",
          error: null,
        },
        list_installed_packs: [],
        list_recent_sessions: [
          {
            id: "resumable-session",
            packId: "pack-a",
            testId: "test-a",
            module: "listening",
            mode: "exam",
            status: "in-progress",
            startedAt: "2026-09-01T10:00:00.000Z",
            updatedAt: "2026-09-01T11:00:00.000Z",
            completedAt: null,
            elapsedSeconds: 120,
          },
          {
            id: "submitted-newest",
            packId: "pack-a",
            testId: "test-a",
            module: "reading",
            mode: "study",
            status: "submitted",
            startedAt: "2026-09-01T09:00:00.000Z",
            updatedAt: "2026-09-01T12:00:00.000Z",
            completedAt: "2026-09-01T12:00:00.000Z",
            elapsedSeconds: 600,
          },
        ],
      }),
    );

    const bootstrap = await repository.getBootstrapState();

    expect(bootstrap.recentSessionId).toBe("submitted-newest");
    expect(bootstrap.recentSessions.map((session) => session.sessionId)).toEqual([
      "submitted-newest",
      "resumable-session",
    ]);
    expect(bootstrap.recentSessions[0]).toMatchObject({
      moduleType: "reading",
      submittedAt: "2026-09-01T12:00:00.000Z",
      elapsedSeconds: 600,
    });
  });

  it("invokes submit_session and normalizes the returned submitted snapshot", async () => {
    const completedAt = "2026-09-01T12:34:56.000Z";
    let receivedArgs: Record<string, unknown> | undefined;
    const invokeCommand: TauriInvoke = async <T>(
      command: string,
      args?: Record<string, unknown>,
    ): Promise<T> => {
      expect(command).toBe("submit_session");
      receivedArgs = args;
      return {
        sessionId: "native-session",
        session: {
          id: "native-session",
          packId: "original-demo-pack",
          testId: "demo-test-01",
          module: "reading",
          mode: "exam",
          status: "submitted",
          startedAt: "2026-09-01T12:00:00.000Z",
          updatedAt: completedAt,
          completedAt,
        },
        answers: [],
        annotations: [],
      } as T;
    };
    const repository = new TauriLearningRepository(invokeCommand);

    await expect(repository.submitSession("native-session")).resolves.toEqual({
      sessionId: "native-session",
      packId: "original-demo-pack",
      testId: "demo-test-01",
      moduleType: "reading",
      mode: "exam",
      status: "submitted",
      startedAt: "2026-09-01T12:00:00.000Z",
      updatedAt: completedAt,
      submittedAt: completedAt,
      elapsedSeconds: 0,
      answers: [],
      annotations: [],
    });
    expect(receivedArgs).toEqual({ sessionId: "native-session" });
  });

  it("uses explicit native contracts for elapsed time and consistent backup export", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const repository = new TauriLearningRepository(async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      if (command === "update_session_elapsed") {
        return {
          id: "native-session",
          packId: "original-demo-pack",
          testId: "demo-test-01",
          module: "reading",
          mode: "study",
          status: "in-progress",
          startedAt: "2026-09-09T00:00:00.000Z",
          updatedAt: "2026-09-09T00:02:00.000Z",
          completedAt: null,
          elapsedSeconds: 120,
        } as T;
      }
      if (command === "create_workspace_backup") {
        return {
          path: "D:\\IELTS-Backups\\ielts-workbench-backup-20260909-test",
          createdAt: "2026-09-09T00:02:00.000Z",
          sourceWorkspaceId: "workspace-id",
          fileCount: 4,
          totalBytes: 4096,
          databaseSha256: "a".repeat(64),
        } as T;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await repository.updateSessionElapsed("native-session", 120);
    await expect(repository.createWorkspaceBackup("D:\\IELTS-Backups")).resolves.toMatchObject({ fileCount: 4 });
    expect(calls).toEqual([
      { command: "update_session_elapsed", args: { sessionId: "native-session", elapsedSeconds: 120 } },
      { command: "create_workspace_backup", args: { destinationParent: "D:\\IELTS-Backups" } },
    ]);
  });

  it("decodes and length-checks native media payloads", async () => {
    const repository = new TauriLearningRepository(
      mockInvoke({
        read_pack_media: {
          relativePath: "media/audio/tiny.wav",
          mimeType: "audio/wav",
          byteLength: 4,
          base64: "UklGRg==",
        },
      }),
    );

    const bytes = await repository.readPackMedia("demo-pack", "media/audio/tiny.wav");
    expect(new TextDecoder().decode(bytes)).toBe("RIFF");
  });

  it("uses validated native contracts for review queue creation and rating", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const base = {
      id: "review-item-1",
      sourceKind: "mistake",
      packId: "original-demo-pack",
      testId: "demo-test-01",
      moduleType: "reading",
      questionId: "demo-reading-q01",
      vocabularyId: null,
      sourceSessionId: null,
      sourceStartMs: null,
      intervalDays: 0,
      repetitions: 0,
      dueAt: "2026-09-17T08:00:00.000Z",
      lastReviewedAt: null,
      createdAt: "2026-09-17T08:00:00.000Z",
      updatedAt: "2026-09-17T08:00:00.000Z",
    };
    const repository = new TauriLearningRepository(async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      if (command === "list_review_items") return [base] as T;
      if (command === "save_review_item") return base as T;
      if (command === "grade_review_item") return {
        ...base,
        intervalDays: 3,
        repetitions: 1,
        dueAt: "2026-09-20T08:00:00.000Z",
        lastReviewedAt: "2026-09-17T08:00:00.000Z",
      } as T;
      throw new Error(`Unexpected command: ${command}`);
    });
    const input = {
      sourceKind: "mistake" as const,
      packId: "original-demo-pack",
      testId: "demo-test-01",
      moduleType: "reading" as const,
      questionId: "demo-reading-q01",
    };
    await expect(repository.listReviewItems()).resolves.toEqual([
      expect.objectContaining({ id: "review-item-1", vocabularyId: undefined, sourceStartMs: undefined }),
    ]);
    await expect(repository.saveReviewItem(input)).resolves.toMatchObject({ id: "review-item-1" });
    await expect(repository.gradeReviewItem("review-item-1", "good")).resolves.toMatchObject({ intervalDays: 3 });
    expect(calls).toEqual([
      { command: "list_review_items", args: undefined },
      { command: "save_review_item", args: { input } },
      { command: "grade_review_item", args: { itemId: "review-item-1", rating: "good" } },
    ]);
  });

  it("validates generated packs before invoking the native installer", async () => {
    const pack = parseIeltsPack(originalDemoPack);
    let receivedArgs: Record<string, unknown> | undefined;
    const repository = new TauriLearningRepository(async <T>(command: string, args?: Record<string, unknown>) => {
      expect(command).toBe("install_generated_pack");
      receivedArgs = args;
      return {
        id: pack.manifest.id,
        title: pack.manifest.title,
        sourceLabel: pack.manifest.sourceLabel,
        manifest: pack.manifest,
        installedAt: "2026-09-03T06:00:00.000Z",
      } as T;
    });

    await expect(repository.installImportedPack(pack)).resolves.toMatchObject({
      id: pack.manifest.id,
      modules: pack.manifest.modules,
    });
    expect(receivedArgs).toEqual({ pack });
  });
});
