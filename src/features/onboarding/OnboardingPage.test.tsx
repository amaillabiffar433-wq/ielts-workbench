import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { workbenchStore } from "../../stores/workbenchStore";
import { OnboardingPage } from "./OnboardingPage";

const originalState = workbenchStore.getState();

describe("OnboardingPage", () => {
  beforeEach(() => {
    workbenchStore.setState({
      bootstrapPhase: "ready",
      bootstrap: {
        configured: false,
        available: false,
        workspace: null,
        error: null,
        installedPacks: [],
        recentSessions: [],
        recentSessionId: null,
      },
      error: null,
      clearError: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    workbenchStore.setState(originalState, true);
  });

  it("labels the browser fallback and initializes only after an explicit choice", async () => {
    const initializeWorkspace = vi.fn(async () => undefined);
    workbenchStore.setState({ initializeWorkspace });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Routes>
          <Route element={<OnboardingPage />} path="/onboarding" />
          <Route element={<div>Library destination</div>} path="/library" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("当前是浏览器演示模式")).toBeInTheDocument();
    expect(initializeWorkspace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "准备浏览器演示工作区" }));
    expect(screen.getByText("D:\\IELTS-Workbench-Demo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "验证并初始化" }));
    expect(initializeWorkspace).toHaveBeenCalledWith("D:\\IELTS-Workbench-Demo");
    expect(await screen.findByText("Library destination")).toBeInTheDocument();
  });

  it("keeps initialization errors visible and actionable", async () => {
    workbenchStore.setState({
      initializeWorkspace: vi.fn(async () => {
        throw new Error("directory is read-only");
      }),
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <OnboardingPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "准备浏览器演示工作区" }));
    await user.click(screen.getByRole("button", { name: "验证并初始化" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("directory is read-only");
    expect(screen.getByRole("button", { name: "验证并初始化" })).toBeEnabled();
  });
});
