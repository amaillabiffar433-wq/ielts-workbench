import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { originalDemoPack } from "../../infrastructure/demo";
import { InMemoryLearningRepository } from "../../infrastructure/repositories/InMemoryLearningRepository";
import type {
  InstalledPackSummary,
  SessionSnapshot,
} from "../../infrastructure/repositories/LearningRepository";
import { workbenchStore } from "../../stores/workbenchStore";
import { LibraryPage } from "./LibraryPage";

const originalState = workbenchStore.getState();

const demoSummary: InstalledPackSummary = {
  id: originalDemoPack.manifest.id,
  title: originalDemoPack.manifest.title,
  sourceLabel: originalDemoPack.manifest.sourceLabel,
  edition: originalDemoPack.manifest.edition,
  language: "en",
  modules: [...originalDemoPack.manifest.modules],
  installedAt: originalDemoPack.manifest.createdAt,
  attribution: originalDemoPack.manifest.attribution,
};

describe("LibraryPage", () => {
  beforeEach(() => {
    const repository = InMemoryLearningRepository.withOriginalDemo({
      workspace: { path: "memory://demo", displayName: "Browser demo workspace" },
    });
    workbenchStore.setState({
      repository,
      bootstrapPhase: "ready",
      bootstrap: {
        configured: true,
        available: true,
        workspace: {
          path: "memory://demo",
          displayName: "Browser demo workspace",
        },
        error: null,
        installedPacks: [demoSummary],
        recentSessions: [],
        recentSessionId: null,
      },
      installedPacks: [demoSummary],
      error: null,
      clearError: vi.fn(),
      refreshPacks: vi.fn(async () => undefined),
      loadPack: vi.fn(async () => originalDemoPack),
    });
  });

  afterEach(() => {
    cleanup();
    workbenchStore.setState(originalState, true);
  });

  it("identifies the original demo honestly and expands Pack to Test and modules", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("原创示例 · 非官方")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Alderwick Skills Sampler/ }));

    expect(await screen.findByRole("heading", { name: "Original Local Practice Test" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reading，状态：未开始/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Listening，状态：未开始/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Writing，状态：未开始/ })).toBeInTheDocument();
  });

  it("uses persisted summaries for Recent Continue and independent module statuses", async () => {
    const sessions: SessionSnapshot[] = [
      {
        sessionId: "reading-finished",
        packId: "original-demo-pack",
        testId: "demo-test-01",
        moduleType: "reading",
        mode: "study",
        status: "submitted",
        startedAt: "2026-09-01T09:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
        submittedAt: "2026-09-01T12:00:00.000Z",
        answers: [],
        annotations: [],
      },
      {
        sessionId: "listening-current",
        packId: "original-demo-pack",
        testId: "demo-test-01",
        moduleType: "listening",
        mode: "exam",
        status: "in-progress",
        startedAt: "2026-09-01T10:00:00.000Z",
        updatedAt: "2026-09-01T11:00:00.000Z",
        answers: [],
        annotations: [],
      },
    ];
    const repository = InMemoryLearningRepository.withOriginalDemo({
      workspace: { path: "memory://demo", displayName: "Browser demo workspace" },
      sessions,
    });
    const loadSession = vi.spyOn(repository, "loadSession");
    const bootstrap = await repository.getBootstrapState();
    workbenchStore.setState({ repository, bootstrap });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LibraryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Listening · 未完成练习")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Alderwick Skills Sampler/ }));

    expect(await screen.findByRole("button", { name: /Reading，状态：已完成/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Listening，状态：进行中/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Writing，状态：未开始/ })).toBeInTheDocument();
    expect(loadSession).not.toHaveBeenCalled();
  });
});
