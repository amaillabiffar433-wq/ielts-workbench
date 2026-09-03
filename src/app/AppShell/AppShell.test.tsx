import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workbenchStore } from "../../stores/workbenchStore";
import { AppShell } from "./AppShell";

function RouteProbe() {
  const location = useLocation();
  return <div data-testid="current-route">{location.pathname}{location.search}</div>;
}

function renderShell(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route element={<AppShell />}><Route element={<RouteProbe />} path="*" /></Route></Routes>
    </MemoryRouter>,
  );
}

const activeReadingExamRoute = "/practice/reading?packId=original-demo-pack&testId=demo-test-01&mode=exam";

function setActiveReadingExam() {
  workbenchStore.setState({
    session: {
      sessionId: "exam-session",
      packId: "original-demo-pack",
      testId: "demo-test-01",
      moduleType: "reading",
      mode: "exam",
      status: "in-progress",
      answers: [],
      annotations: [],
    },
  });
}

describe("AppShell exam restrictions", () => {
  beforeEach(() => {
    workbenchStore.setState({ session: null });
  });

  afterEach(cleanup);

  it("does not render the AI launcher in Exam mode", () => {
    renderShell("/practice/reading?mode=exam");
    expect(screen.queryByRole("button", { name: "打开 AI 学习助手" })).not.toBeInTheDocument();
  });

  it("renders the disabled-provider AI launcher in Study mode", () => {
    renderShell("/practice/reading?mode=study");
    expect(screen.getByRole("button", { name: "打开 AI 学习助手" })).toBeInTheDocument();
  });

  it("keeps Review and AI unavailable when the persisted session is an active Exam", () => {
    setActiveReadingExam();

    renderShell("/practice/reading?mode=study");

    expect(screen.queryByRole("link", { name: "复盘" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开 AI 学习助手" })).not.toBeInTheDocument();
  });

  it.each([
    "/library",
    "/practice/listening?mode=exam",
    "/practice/reading?mode=study",
  ])("replaces %s with the exact current Exam route before another page can mount", async (attemptedRoute) => {
    setActiveReadingExam();

    renderShell(attemptedRoute);

    await waitFor(() => expect(screen.getByTestId("current-route")).toHaveTextContent(activeReadingExamRoute));
    expect(screen.getByRole("link", { name: "阅读" })).toHaveAttribute("href", activeReadingExamRoute);
    expect(screen.queryByRole("link", { name: "题库" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "听力" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "写作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "复盘" })).not.toBeInTheDocument();
  });

  it("allows the locked Review route without exposing other navigation", () => {
    setActiveReadingExam();

    renderShell("/review");

    expect(screen.getByTestId("current-route")).toHaveTextContent("/review");
    expect(screen.getByRole("link", { name: "阅读" })).toHaveAttribute("href", activeReadingExamRoute);
    expect(screen.queryByRole("link", { name: "复盘" })).not.toBeInTheDocument();
  });

  it("restores Review navigation after an Exam session is submitted", () => {
    workbenchStore.setState({
      session: {
        sessionId: "submitted-exam-session",
        mode: "exam",
        status: "submitted",
        answers: [],
        annotations: [],
      },
    });

    renderShell("/practice/reading?mode=study");

    expect(screen.getByRole("link", { name: "复盘" })).toBeInTheDocument();
  });

  it("keeps the current Study pack and test identity when switching modules", () => {
    workbenchStore.setState({
      session: {
        sessionId: "study-session",
        packId: "first-pack",
        testId: "first-test",
        moduleType: "reading",
        mode: "study",
        status: "in-progress",
        answers: [],
        annotations: [],
      },
    });

    renderShell("/practice/reading?packId=second-pack&testId=second-test&mode=study");

    expect(screen.getByRole("link", { name: "听力" })).toHaveAttribute(
      "href",
      "/practice/listening?packId=second-pack&testId=second-test&mode=study",
    );
    expect(screen.getByRole("link", { name: "写作" })).toHaveAttribute(
      "href",
      "/practice/writing?packId=second-pack&testId=second-test&mode=study",
    );
  });
});
