import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

describe("AppShell navigation and exam restrictions", () => {
  beforeEach(() => {
    workbenchStore.setState({ session: null });
  });

  afterEach(cleanup);

  it("uses the five product-level destinations in order", () => {
    renderShell("/library");
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Home", "Library", "Review", "Progress", "Settings",
    ]);
    expect(within(navigation).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
    expect(within(navigation).getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Review" })).toHaveAttribute("href", "/review?view=queue");
    expect(within(navigation).getByRole("link", { name: "Progress" })).toHaveAttribute("href", "/progress");
    expect(within(navigation).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByText("Local & offline")).toBeInTheDocument();
  });

  it.each([
    "/home",
    "/library",
    "/review",
    "/progress",
    "/settings",
    "/practice/listening?mode=exam",
    "/practice/reading?mode=study",
  ])("replaces %s with the exact active Exam route", async (attemptedRoute) => {
    setActiveReadingExam();
    renderShell(attemptedRoute);
    await waitFor(() => expect(screen.getByTestId("current-route")).toHaveTextContent(activeReadingExamRoute));
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(navigation).getAllByRole("link")).toHaveLength(1);
    expect(within(navigation).getByRole("link", { name: "Exam" })).toHaveAttribute("href", activeReadingExamRoute);
    expect(screen.getByText("Exam mode · Focused")).toBeInTheDocument();
  });

  it("restores all product navigation after an Exam session is submitted", () => {
    workbenchStore.setState({
      session: {
        sessionId: "submitted-exam-session",
        mode: "exam",
        status: "submitted",
        answers: [],
        annotations: [],
      },
    });
    renderShell("/review");
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });
});
