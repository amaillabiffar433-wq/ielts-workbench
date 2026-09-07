import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { questionContainerId } from "../../../components/QuestionRenderer/questionDomIds";
import { createTextAnchor } from "../../../domain";
import { originalMultiPassagePack } from "../../../infrastructure/demo/originalMultiPassagePack";
import type {
  AnswerRecord,
  AnswerValue,
  AnnotationRecord,
  CreateSessionInput,
  SessionSnapshot,
} from "../../../infrastructure/repositories/LearningRepository";
import { answerKey, workbenchStore } from "../../../stores/workbenchStore";
import { createDefaultReadingViewState, readingViewStateSettingKey } from "./readingViewState";
import { ReadingPage } from "./ReadingPage";

const originalState = workbenchStore.getState();
const originalResizeObserver = window.ResizeObserver;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const testId = originalMultiPassagePack.manifest.tests[0].id;
const session: SessionSnapshot = {
  sessionId: "multi-reading-session",
  packId: originalMultiPassagePack.manifest.id,
  testId,
  moduleType: "reading",
  mode: "study",
  status: "in-progress",
  answers: [],
  annotations: [],
};

const module = originalMultiPassagePack.modules.find((candidate) => candidate.type === "reading");
if (!module || module.type !== "reading") throw new Error("Multi-passage Reading fixture missing");

function renderReading() {
  return render(
    <MemoryRouter initialEntries={[`/practice/reading?packId=${originalMultiPassagePack.manifest.id}&testId=${testId}&mode=study`]}>
      <ReadingPage />
    </MemoryRouter>,
  );
}

describe("ReadingPage multi-passage selection", () => {
  beforeEach(() => {
    Object.defineProperty(window, "ResizeObserver", { configurable: true, value: ResizeObserverStub });
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
        updatedAt: "2026-09-06T00:00:00.000Z",
      };
      workbenchStore.setState((state) => ({
        answers: { ...state.answers, [answerKey(sessionId, questionId)]: saved },
        saveState: "saved",
      }));
    });
    const lightweightView = createDefaultReadingViewState(module);
    workbenchStore.setState({
      activePack: originalMultiPassagePack,
      session,
      answers: {},
      annotations: [],
      saveState: "idle",
      ensureSession,
      answerQuestion,
      loadPack: vi.fn(async () => originalMultiPassagePack),
      loadSetting: vi.fn(async (key: string) => key === readingViewStateSettingKey(session.sessionId)
        ? JSON.stringify({
            ...lightweightView,
            right: { ...lightweightView.right, questionScope: "single", singleNumber: 18 },
          })
        : null),
      saveSetting: vi.fn(async () => undefined),
    });
  });

  afterEach(() => {
    cleanup();
    workbenchStore.setState(originalState, true);
    Object.defineProperty(window, "ResizeObserver", { configurable: true, value: originalResizeObserver });
    vi.restoreAllMocks();
  });

  it("shows non-first passages and all/passage question selection", async () => {
    renderReading();
    await screen.findByTestId("reading-split-workspace");

    fireEvent.change(screen.getByLabelText("左窗格 Passage"), { target: { value: "northbridge-passage-02" } });
    const leftPane = screen.getByRole("region", { name: "左窗格" });
    expect(within(leftPane).getByText("Passage 2 · A Ferry Timetable Written by Tides")).toBeInTheDocument();
    expect(within(leftPane).getByText(/The Northbridge foot ferry crosses/)).toBeInTheDocument();
    expect(within(leftPane).queryByText(/Northbridge opened its first community seed bank/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("右窗格题目范围类型"), { target: { value: "all" } });
    expect(document.querySelectorAll('[data-question-id^="northbridge-q"]')).toHaveLength(21);
    fireEvent.change(screen.getByLabelText("右窗格题目范围类型"), { target: { value: "passage" } });
    fireEvent.change(screen.getByLabelText("右窗格题目 Passage"), { target: { value: "northbridge-passage-02" } });
    expect(screen.getByText("Which condition can stop crossings even at a safe water level?")).toBeInTheDocument();
    expect(screen.queryByText("The offline guide records the names of all volunteers.")).not.toBeInTheDocument();
  });

  it("shows cross-passage ranges and a single question with group context", async () => {
    renderReading();
    await screen.findByTestId("reading-split-workspace");

    fireEvent.change(screen.getByLabelText("右窗格题目范围类型"), { target: { value: "range" } });
    const start = screen.getByLabelText("右窗格起始题号");
    const end = screen.getByLabelText("右窗格结束题号");
    fireEvent.change(start, { target: { value: "14" } });
    fireEvent.change(end, { target: { value: "20" } });
    expect(await screen.findByText("The offline guide records the names of all volunteers.")).toBeInTheDocument();
    expect(screen.getAllByText("Passage 2 · A Ferry Timetable Written by Tides").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Passage 3 · Listening Posts for Urban Moths").length).toBeGreaterThan(0);
    expect(screen.queryByText("Who provides the initial tide predictions?")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("右窗格题目范围类型"), { target: { value: "single" } });
    const single = screen.getByLabelText("右窗格单题题号");
    fireEvent.change(single, { target: { value: "18" } });
    expect(await screen.findByText("The offline guide records the names of all volunteers.")).toBeInTheDocument();
    expect(screen.getByText("Decide whether each statement agrees with Passage 3. Choose True, False, or Not Given.")).toBeInTheDocument();
    expect(document.querySelectorAll('[data-question-id^="northbridge-q"]')).toHaveLength(1);
  });

  it("keeps Pane selections independent and synchronizes one logical answer in two Q18 views", async () => {
    renderReading();
    await screen.findByTestId("reading-split-workspace");
    fireEvent.change(screen.getByLabelText("左窗格内容"), { target: { value: "questions" } });
    fireEvent.change(screen.getByLabelText("左窗格题目范围类型"), { target: { value: "single" } });
    fireEvent.change(screen.getByLabelText("左窗格单题题号"), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText("右窗格题目范围类型"), { target: { value: "single" } });
    fireEvent.change(screen.getByLabelText("右窗格单题题号"), { target: { value: "18" } });

    const leftId = questionContainerId("left-pane", "northbridge-q18");
    const rightId = questionContainerId("right-pane", "northbridge-q18");
    await waitFor(() => {
      expect(document.getElementById(leftId)).toBeInTheDocument();
      expect(document.getElementById(rightId)).toBeInTheDocument();
    });
    expect(leftId).not.toBe(rightId);
    const falseOptions = screen.getAllByRole("radio", { name: "False" });
    expect(falseOptions).toHaveLength(2);
    fireEvent.click(falseOptions[0]);
    await waitFor(() => {
      expect(falseOptions[0]).toBeChecked();
      expect(falseOptions[1]).toBeChecked();
    });
    expect(workbenchStore.getState().answerQuestion).toHaveBeenCalledWith(
      session.sessionId,
      "northbridge-q18",
      "false",
    );

    fireEvent.change(screen.getByLabelText("左窗格内容"), { target: { value: "passage" } });
    fireEvent.change(screen.getByLabelText("左窗格 Passage"), { target: { value: "northbridge-passage-01" } });
    expect(screen.getByLabelText("右窗格单题题号")).toHaveValue(18);
    expect(document.getElementById(rightId)).toBeInTheDocument();
  });

  it("does not copy an annotation to identical text in another Passage", async () => {
    const repeated = "A small brass marker was fixed beside the entrance.";
    const firstText = module.sections[0].contentBlocks[1].text;
    const startOffset = firstText.indexOf(repeated);
    const annotation: AnnotationRecord = {
      id: "annotation-repeated-text",
      sessionId: session.sessionId,
      anchor: createTextAnchor(module.sections[0].contentBlocks[1].id, firstText, startOffset, startOffset + repeated.length),
      style: "highlight-yellow",
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-09-06T00:00:00.000Z",
    };
    workbenchStore.setState({ annotations: [annotation] });
    renderReading();
    await screen.findByTestId("reading-split-workspace");
    expect(screen.getByRole("button", { name: new RegExp(`标记文字“${repeated}`) })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("左窗格 Passage"), { target: { value: "northbridge-passage-03" } });
    const leftPane = screen.getByRole("region", { name: "左窗格" });
    expect(within(leftPane).getByText("Passage 3 · Listening Posts for Urban Moths")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(`标记文字“${repeated}`) })).not.toBeInTheDocument();
  });

  it("uses the target Pane only for question navigation and retains full answer totals", async () => {
    const q01: AnswerRecord = { id: "a1", sessionId: session.sessionId, questionId: "northbridge-q01", value: "false", updatedAt: "2026-09-06T00:00:00.000Z" };
    const q18: AnswerRecord = { id: "a18", sessionId: session.sessionId, questionId: "northbridge-q18", value: "false", updatedAt: "2026-09-06T00:00:00.000Z" };
    workbenchStore.setState({ answers: { [answerKey(session.sessionId, q01.questionId)]: q01, [answerKey(session.sessionId, q18.questionId)]: q18 } });
    renderReading();
    await screen.findByTestId("reading-split-workspace");
    expect(screen.getByText("已答 2/21")).toBeInTheDocument();
    const leftScroll = document.querySelector<HTMLElement>('[data-pane-scroll="left"]');
    const rightScroll = document.querySelector<HTMLElement>('[data-pane-scroll="right"]');
    const leftScrollTo = vi.fn();
    const rightScrollTo = vi.fn();
    if (leftScroll) leftScroll.scrollTo = leftScrollTo;
    if (rightScroll) rightScroll.scrollTo = rightScrollTo;

    fireEvent.click(screen.getByRole("button", { name: "跳到第 18 题，已答，右窗格" }));
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(questionContainerId("right-pane", "northbridge-q18"))));
    expect(rightScrollTo).toHaveBeenCalledTimes(1);
    expect(leftScrollTo).not.toHaveBeenCalled();
    expect(screen.getByText("已答 2/21")).toBeInTheDocument();
    expect(document.querySelectorAll('[data-question-id^="northbridge-q"]')).toHaveLength(1);
  });

  it("waits for persisted Pane state before rendering or saving defaults", async () => {
    let resolveView: ((value: string | null) => void) | undefined;
    const defaults = createDefaultReadingViewState(module);
    const saved = {
      ...defaults,
      left: { ...defaults.left, passageId: "northbridge-passage-02", scrollPositions: { "passage:northbridge-passage-02": 180 } },
      right: { ...defaults.right, questionScope: "single" as const, singleNumber: 18 },
    };
    const loadSetting = vi.fn((key: string) => key === readingViewStateSettingKey(session.sessionId)
      ? new Promise<string | null>((resolve) => { resolveView = resolve; })
      : Promise.resolve(null));
    const saveSetting = vi.fn(async (...args: [string, string]) => {
      void args;
    });
    workbenchStore.setState({ loadSetting, saveSetting });
    renderReading();

    expect(await screen.findByText("正在恢复 Reading Pane 选择…")).toBeInTheDocument();
    expect(saveSetting.mock.calls.some(([key]) => key === readingViewStateSettingKey(session.sessionId))).toBe(false);
    resolveView?.(JSON.stringify(saved));

    expect(await screen.findByText("Passage 2 · A Ferry Timetable Written by Tides")).toBeInTheDocument();
    expect(screen.getByLabelText("右窗格单题题号")).toHaveValue(18);
    const leftPane = screen.getByRole("region", { name: "左窗格" });
    expect(within(leftPane).getByText(/The Northbridge foot ferry crosses/)).toBeInTheDocument();
    expect(document.querySelector<HTMLElement>('[data-pane-scroll="left"]')?.scrollTop).toBe(180);
    await waitFor(() => expect(saveSetting.mock.calls.some(([key]) => key === readingViewStateSettingKey(session.sessionId))).toBe(true));
  });

  it("reports an invalid visible range instead of showing unrelated questions", async () => {
    renderReading();
    await screen.findByTestId("reading-split-workspace");
    fireEvent.change(screen.getByLabelText("右窗格题目范围类型"), { target: { value: "range" } });
    fireEvent.change(screen.getByLabelText("右窗格起始题号"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("右窗格结束题号"), { target: { value: "40" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Question 22 不存在"));
    expect(document.querySelectorAll('[data-question-id^="northbridge-q"]')).toHaveLength(0);
  });

  it("pairs every Passage with only its own questions in whole-test mode", async () => {
    renderReading();
    await screen.findByTestId("reading-split-workspace");
    fireEvent.change(screen.getByLabelText("左窗格内容"), { target: { value: "whole" } });

    const leftPane = screen.getByRole("region", { name: "左窗格" });
    const passages = leftPane.querySelectorAll<HTMLElement>(".reading-whole-passage");
    expect(passages).toHaveLength(3);
    expect(within(passages[0]).getByText("The Clockwork Seed Bank")).toBeInTheDocument();
    expect(within(passages[0]).getByText("Seeds are sold from the former railway office.")).toBeInTheDocument();
    expect(within(passages[0]).queryByText("Why does the ferry timetable change every week?")).not.toBeInTheDocument();
    expect(within(passages[1]).getByText("Why does the ferry timetable change every week?")).toBeInTheDocument();
    expect(within(passages[1]).queryByText("The offline guide records the names of all volunteers.")).not.toBeInTheDocument();
    expect(within(passages[2]).getByText("The offline guide records the names of all volunteers.")).toBeInTheDocument();
  });

  it("supports independent Passage/Passage and range/Passage combinations", async () => {
    renderReading();
    await screen.findByTestId("reading-split-workspace");
    fireEvent.change(screen.getByLabelText("左窗格 Passage"), { target: { value: "northbridge-passage-01" } });
    fireEvent.change(screen.getByLabelText("右窗格内容"), { target: { value: "passage" } });
    fireEvent.change(screen.getByLabelText("右窗格 Passage"), { target: { value: "northbridge-passage-03" } });
    expect(screen.getByLabelText("左窗格 Passage")).toHaveValue("northbridge-passage-01");
    expect(screen.getByLabelText("右窗格 Passage")).toHaveValue("northbridge-passage-03");

    fireEvent.change(screen.getByLabelText("左窗格内容"), { target: { value: "questions" } });
    fireEvent.change(screen.getByLabelText("左窗格题目范围类型"), { target: { value: "range" } });
    fireEvent.change(screen.getByLabelText("左窗格起始题号"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("左窗格结束题号"), { target: { value: "20" } });
    expect(await screen.findByText("The offline guide records the names of all volunteers.")).toBeInTheDocument();
    expect(screen.getByLabelText("右窗格 Passage")).toHaveValue("northbridge-passage-03");

    fireEvent.change(screen.getByLabelText("右窗格 Passage"), { target: { value: "northbridge-passage-02" } });
    expect(screen.getByLabelText("左窗格起始题号")).toHaveValue(14);
    expect(screen.getByLabelText("左窗格结束题号")).toHaveValue(20);
  });
});
