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
      answers: [],
      annotations: [],
    });
    expect(receivedArgs).toEqual({ sessionId: "native-session" });
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
