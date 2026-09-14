import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { createDefaultReadingViewState, readingViewStateSettingKey } from "./readingViewState";

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

    const firstQuestion = firstSingleChoiceQuestion();
    const initialView = createDefaultReadingViewState(readingModule());
    workbenchStore.setState({
      activePack: originalDemoPack,
      session,
      answers: {},
      annotations: [],
      saveState: "idle",
      ensureSession,
      answerQuestion,
      loadSetting: vi.fn(async (key: string) => key === readingViewStateSettingKey(session.sessionId)
        ? JSON.stringify({
            ...initialView,
            right: {
              ...initialView.right,
              questionScope: "single",
              singleNumber: firstQuestion.number,
            },
          })
        : null),
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
    const question = firstSingleChoiceQuestion();
    const option = question.options[0];
    if (!option) throw new Error("The demo single-choice question needs an option");
    renderReading();

    await screen.findByTestId("reading-split-workspace");
    fireEvent.change(screen.getByLabelText("左窗格内容"), { target: { value: "questions" } });

    const matchingOptions = screen.getAllByRole("radio", {
      name: `${option.label}${option.text}`,
    });
    expect(matchingOptions).toHaveLength(2);
    fireEvent.click(matchingOptions[0]);

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

  it("retains both Pane instances, stable identities and answers across single and dual presentation", async () => {
    const question = firstSingleChoiceQuestion();
    renderReading();
    await screen.findByTestId("reading-split-workspace");
    const left = document.querySelector('[data-pane-scroll="left"]');
    const right = document.querySelector('[data-pane-scroll="right"]');
    const group = document.getElementById("reading-split-workspace");
    const option = screen.getByRole("radio", { name: `${question.options[0].label}${question.options[0].text}` });
    fireEvent.click(option);
    await waitFor(() => expect(option).toBeChecked());
    const savedAnswers = workbenchStore.getState().answers;
    fireEvent.click(screen.getByRole("button", { name: "单 Pane" }));
    expect(group).toHaveAttribute("data-visible-pane", "left");
    fireEvent.click(screen.getByRole("button", { name: "Pane B" }));
    expect(group).toHaveAttribute("data-visible-pane", "right");
    fireEvent.click(screen.getByRole("button", { name: "双 Pane" }));
    expect(group).toHaveAttribute("data-visible-pane", "both");
    expect(document.querySelector('[data-pane-scroll="left"]')).toBe(left);
    expect(document.querySelector('[data-pane-scroll="right"]')).toBe(right);
    expect(workbenchStore.getState().answers).toBe(savedAnswers);
    expect(option).toBeChecked();
    expect(workbenchStore.getState().ensureSession).toHaveBeenCalledTimes(1);
  });

  it("reveals the original question navigation target when it was hidden by single-Pane display", async () => {
    const question = firstSingleChoiceQuestion();
    renderReading();
    await screen.findByTestId("reading-split-workspace");
    fireEvent.click(screen.getByRole("button", { name: "单 Pane" }));
    fireEvent.click(screen.getByRole("button", { name: `跳到第 ${question.number} 题，未答，右窗格` }));
    await waitFor(() => {
      expect(document.getElementById("reading-split-workspace")).toHaveAttribute("data-visible-pane", "right");
      expect(document.activeElement).toBe(document.getElementById(questionContainerId("right-pane", question.id)));
    });
  });

  it("does not rehydrate or remount view tools when timer persistence updates the same Session", async () => {
    renderReading();
    await screen.findByTestId("reading-split-workspace");
    const pane = document.querySelector('[data-pane-scroll="left"]');
    const loadSetting = vi.mocked(workbenchStore.getState().loadSetting);
    const calls = loadSetting.mock.calls.filter(([key]) => key === readingViewStateSettingKey(session.sessionId)).length;
    fireEvent.click(screen.getByRole("button", { name: "专注" }));
    await act(async () => { workbenchStore.setState({ session: { ...session, elapsedSeconds: 10 } }); });
    expect(screen.getByRole("button", { name: "退出专注" })).toBeInTheDocument();
    expect(document.querySelector('[data-pane-scroll="left"]')).toBe(pane);
    expect(loadSetting.mock.calls.filter(([key]) => key === readingViewStateSettingKey(session.sessionId))).toHaveLength(calls);
  });

  it("changes only the existing font setting after user input and keeps focus mode presentation-only", async () => {
    renderReading();
    await screen.findByTestId("reading-split-workspace");
    const saveSetting = workbenchStore.getState().saveSetting;
    expect(saveSetting).not.toHaveBeenCalledWith("appearance.readingFontSize", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "字体" }));
    fireEvent.change(screen.getByLabelText(/正文字号/u), { target: { value: "20" } });
    expect(saveSetting).toHaveBeenCalledWith("appearance.readingFontSize", "20");
    expect(document.documentElement.style.getPropertyValue("--font-size-reading")).toBe("20px");
    fireEvent.click(screen.getByRole("button", { name: "专注" }));
    expect(document.querySelector(".reading-workbench--focus")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "退出专注" }));
    expect(document.querySelector(".reading-workbench--focus")).toBeNull();
    expect(workbenchStore.getState().session?.sessionId).toBe(session.sessionId);
    document.documentElement.style.removeProperty("--font-size-reading");
  });

  it("uses unique pane-scoped IDs and focuses the deterministic right-pane navigation target", async () => {
    const question = firstSingleChoiceQuestion();
    renderReading();

    await screen.findByTestId("reading-split-workspace");
    fireEvent.change(screen.getByLabelText("左窗格内容"), { target: { value: "questions" } });

    const leftId = questionContainerId("left-pane", question.id);
    const rightId = questionContainerId("right-pane", question.id);
    const leftTarget = document.getElementById(leftId);
    const rightTarget = document.getElementById(rightId);
    const rightScroll = document.querySelector<HTMLElement>('[data-pane-scroll="right"]');
    const rightScrollTo = vi.fn();
    if (rightScroll) rightScroll.scrollTo = rightScrollTo;
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
    fireEvent.click(navigationButton);

    await waitFor(() => expect(document.activeElement).toBe(rightTarget));
    expect(rightScrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("opens the right question view before focusing when neither pane currently shows questions", async () => {
    const question = firstSingleChoiceQuestion();
    renderReading();

    await screen.findByTestId("reading-split-workspace");
    const rightSelector = screen.getByLabelText("右窗格内容");
    fireEvent.change(rightSelector, { target: { value: "passage" } });

    const rightId = questionContainerId("right-pane", question.id);
    expect(document.getElementById(rightId)).toBeNull();
    const navigationButton = screen.getByRole("button", {
      name: `跳到第 ${question.number} 题，未答，右窗格`,
    });
    expect(navigationButton).toHaveAttribute("aria-controls", rightId);
    fireEvent.click(navigationButton);

    await waitFor(() => {
      expect(rightSelector).toHaveValue("questions");
      expect(document.activeElement).toBe(document.getElementById(rightId));
    });
  });

  it("shows a recoverable error when Session restoration fails", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

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
