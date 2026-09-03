import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { questionContainerId } from "../../../components/QuestionRenderer/questionDomIds";
import type { IELTSPack, ReadingModule } from "../../../domain";
import { originalDemoPack } from "../../../infrastructure/demo/originalDemoPack";
import type {
  AnswerRecord,
  AnswerValue,
  CreateSessionInput,
  SessionSnapshot,
} from "../../../infrastructure/repositories/LearningRepository";
import { answerKey, workbenchStore } from "../../../stores/workbenchStore";
import { ReadingPage } from "./ReadingPage";

const originalState = workbenchStore.getState();
const originalResizeObserver = window.ResizeObserver;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const session: SessionSnapshot = {
  sessionId: "reading-page-session",
  packId: originalDemoPack.manifest.id,
  testId: originalDemoPack.manifest.tests[0].id,
  moduleType: "reading",
  mode: "study",
  status: "in-progress",
  answers: [],
  annotations: [],
};

function readingModule(): ReadingModule {
  const reading = originalDemoPack.modules.find(
    (module): module is ReadingModule => module.type === "reading",
  );
  if (!reading) throw new Error("The original demo pack needs a Reading module");
  return reading;
}

function firstSingleChoiceQuestion() {
  const question = readingModule().sections
    .flatMap((section) => section.questionGroups.flatMap((group) => group.questions))
    .find((candidate) => candidate.type === "single-choice");
  if (!question || question.type !== "single-choice") {
    throw new Error("The original demo pack needs a single-choice Reading question");
  }
  return question;
}

function renderReading(path = "/practice/reading?mode=study") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ReadingPage />
    </MemoryRouter>,
  );
}

function packWithIdentity(packId: string, testId: string): IELTSPack {
  return {
    ...originalDemoPack,
    manifest: {
      ...originalDemoPack.manifest,
      id: packId,
      title: `Pack ${packId}`,
      tests: [{ ...originalDemoPack.manifest.tests[0], id: testId }],
    },
    modules: originalDemoPack.modules.map((module) => ({ ...module, testId })),
  };
}

describe("ReadingPage shared panes and question navigation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: ResizeObserverStub,
    });
    const ensureSession = vi.fn(async (input: CreateSessionInput) => {
      void input;
      workbenchStore.setState({ session });
      return session;
    });
    const answerQuestion = vi.fn(async (sessionId: string, questionId: string, value: AnswerValue) => {
      const saved: AnswerRecord = {
        id: `answer:${sessionId}:${questionId}`,
        sessionId,
        questionId,
        value,
        updatedAt: "2026-09-02T00:00:00.000Z",
      };
      workbenchStore.setState((state) => ({
        answers: {
          ...state.answers,
          [answerKey(sessionId, questionId)]: saved,
        },
        saveState: "saved",
      }));
    });

    workbenchStore.setState({
      activePack: originalDemoPack,
      session,
      answers: {},
      annotations: [],
      saveState: "idle",
      ensureSession,
      answerQuestion,
      loadSetting: vi.fn(async () => null),
      saveSetting: vi.fn(async () => undefined),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    workbenchStore.setState({
      activePack: originalState.activePack,
      session: originalState.session,
      answers: originalState.answers,
      annotations: originalState.annotations,
      saveState: originalState.saveState,
      ensureSession: originalState.ensureSession,
      loadPack: originalState.loadPack,
      answerQuestion: originalState.answerQuestion,
      loadSetting: originalState.loadSetting,
      saveSetting: originalState.saveSetting,
    });
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: originalResizeObserver,
    });
    vi.restoreAllMocks();
  });

  it("synchronizes one canonical answer across the real left and right question panes", async () => {
    const user = userEvent.setup();
    const question = firstSingleChoiceQuestion();
    const option = question.options[0];
    if (!option) throw new Error("The demo single-choice question needs an option");
    renderReading();

    await screen.findByTestId("reading-split-workspace");
    await user.selectOptions(screen.getByLabelText("左窗格内容"), "questions");

    const matchingOptions = screen.getAllByRole("radio", {
      name: `${option.label}${option.text}`,
    });
    expect(matchingOptions).toHaveLength(2);
    await user.click(matchingOptions[0]);

    await waitFor(() => {
      expect(matchingOptions[0]).toBeChecked();
      expect(matchingOptions[1]).toBeChecked();
    });
    expect(workbenchStore.getState().answerQuestion).toHaveBeenCalledWith(
      session.sessionId,
      question.id,
      option.id,
    );
  });

  it("uses unique pane-scoped IDs and focuses the deterministic right-pane navigation target", async () => {
    const user = userEvent.setup();
    const question = firstSingleChoiceQuestion();
    renderReading();

    await screen.findByTestId("reading-split-workspace");
    await user.selectOptions(screen.getByLabelText("左窗格内容"), "questions");

    const leftId = questionContainerId("left-pane", question.id);
    const rightId = questionContainerId("right-pane", question.id);
    const leftTarget = document.getElementById(leftId);
    const rightTarget = document.getElementById(rightId);
    expect(leftTarget).not.toBeNull();
    expect(rightTarget).not.toBeNull();
    expect(leftTarget?.id).not.toBe(rightTarget?.id);
    expect(document.querySelectorAll(`#${leftId}`)).toHaveLength(1);
    expect(document.querySelectorAll(`#${rightId}`)).toHaveLength(1);
    const renderedIds = Array.from(document.querySelectorAll<HTMLElement>("[id]"), (node) => node.id);
    expect(new Set(renderedIds).size).toBe(renderedIds.length);
    expect(rightTarget).toHaveAttribute("tabindex", "-1");

    const navigationButton = screen.getByRole("button", {
      name: `跳到第 ${question.number} 题，未答，右窗格`,
    });
    expect(navigationButton).toHaveAttribute("aria-controls", rightId);
    await user.click(navigationButton);

    await waitFor(() => expect(document.activeElement).toBe(rightTarget));
    expect(rightTarget?.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("opens the right question view before focusing when neither pane currently shows questions", async () => {
    const user = userEvent.setup();
    const question = firstSingleChoiceQuestion();
    renderReading();

    await screen.findByTestId("reading-split-workspace");
    const rightSelector = screen.getByLabelText("右窗格内容");
    await user.selectOptions(rightSelector, "passage");

    const rightId = questionContainerId("right-pane", question.id);
    expect(document.getElementById(rightId)).toBeNull();
    const navigationButton = screen.getByRole("button", {
      name: `跳到第 ${question.number} 题，未答，右窗格`,
    });
    expect(navigationButton).toHaveAttribute("aria-controls", rightId);
    await user.click(navigationButton);

    await waitFor(() => {
      expect(rightSelector).toHaveValue("questions");
      expect(document.activeElement).toBe(document.getElementById(rightId));
    });
  });

  it("shows a recoverable error when Session restoration fails", async () => {
    const user = userEvent.setup();
    const ensureSession = vi.fn()
      .mockRejectedValueOnce(new Error("workspace database is unavailable"))
      .mockImplementation(async () => {
        workbenchStore.setState({ session });
        return session;
      });
    workbenchStore.setState({ ensureSession, session: null });
    renderReading();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法恢复阅读 Session：workspace database is unavailable",
    );
    await user.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByTestId("reading-split-workspace")).toBeInTheDocument();
    expect(ensureSession).toHaveBeenCalledTimes(2);
  });

  it("loads the explicit Pack and Test identity before creating the page Session", async () => {
    const secondPack = packWithIdentity("second-pack", "second-test");
    const loadPack = vi.fn(async () => secondPack);
    const ensureSession = vi.fn(async (input: CreateSessionInput) => {
      const secondSession: SessionSnapshot = {
        sessionId: "second-reading-session",
        ...input,
        status: "in-progress",
        answers: [],
        annotations: [],
      };
      workbenchStore.setState({ session: secondSession });
      return secondSession;
    });
    workbenchStore.setState({
      activePack: originalDemoPack,
      session,
      loadPack,
      ensureSession,
    });

    renderReading("/practice/reading?packId=second-pack&testId=second-test&mode=study");

    expect(await screen.findByTestId("reading-split-workspace")).toBeInTheDocument();
    expect(loadPack).toHaveBeenCalledWith("second-pack");
    expect(ensureSession).toHaveBeenCalledWith({
      packId: "second-pack",
      testId: "second-test",
      moduleType: "reading",
      mode: "study",
    });
    expect(workbenchStore.getState().session?.packId).toBe("second-pack");
    expect(workbenchStore.getState().session?.testId).toBe("second-test");
  });
});
