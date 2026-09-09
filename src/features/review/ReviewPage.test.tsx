import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseIeltsPack, type IELTSPack } from "../../domain";
import { originalDemoPack } from "../../infrastructure/demo/originalDemoPack";
import { workbenchStore } from "../../stores/workbenchStore";
import { ReviewPage } from "./ReviewPage";

const originalLoadPack = workbenchStore.getState().loadPack;

function packWithIdentity(packId: string, testId: string, firstPrompt: string): IELTSPack {
  return {
    ...originalDemoPack,
    manifest: {
      ...originalDemoPack.manifest,
      id: packId,
      title: `Pack ${packId}`,
      tests: [{ ...originalDemoPack.manifest.tests[0], id: testId }],
    },
    modules: originalDemoPack.modules.map((module) => {
      if (module.type !== "reading") return { ...module, testId };
      return {
        ...module,
        testId,
        sections: module.sections.map((section, sectionIndex) => ({
          ...section,
          questionGroups: section.questionGroups.map((group, groupIndex) => ({
            ...group,
            questions: group.questions.map((question, questionIndex) =>
              sectionIndex === 0 && groupIndex === 0 && questionIndex === 0
                ? { ...question, prompt: firstPrompt }
                : question),
          })),
        })),
      };
    }),
  };
}

describe("ReviewPage Exam lock", () => {
  beforeEach(() => {
    workbenchStore.setState({
      activePack: originalDemoPack,
      answers: {},
      annotations: [],
      session: null,
    });
  });

  afterEach(() => {
    cleanup();
    workbenchStore.setState({ loadPack: originalLoadPack });
    vi.restoreAllMocks();
  });

  it("renders a no-answer locked state for an in-progress Exam session", () => {
    const question = originalDemoPack.modules
      .find((module) => module.type === "reading")!
      .sections[0].questionGroups[0].questions[0];
    workbenchStore.setState({
      session: {
        sessionId: "locked-exam-session",
        packId: originalDemoPack.manifest.id,
        testId: originalDemoPack.manifest.tests[0].id,
        moduleType: "reading",
        mode: "exam",
        status: "in-progress",
        answers: [],
        annotations: [],
      },
      answers: {
        "locked-exam-session:demo-reading-q01": {
          id: "answer:locked-exam-session:demo-reading-q01",
          sessionId: "locked-exam-session",
          questionId: "demo-reading-q01",
          value: "sentinel-user-answer",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      },
    });

    render(<MemoryRouter><ReviewPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "复盘已锁定" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回考试" })).toHaveAttribute(
      "href",
      "/practice/reading?packId=original-demo-pack&testId=demo-test-01&mode=exam",
    );
    expect(screen.queryByText("正确答案")).not.toBeInTheDocument();
    expect(screen.queryByText("sentinel-user-answer")).not.toBeInTheDocument();
    expect(screen.queryByText(question.prompt)).not.toBeInTheDocument();
    expect(screen.queryByText(question.explanation!)).not.toBeInTheDocument();
  });

  it("allows answer review after the Exam session is submitted", () => {
    workbenchStore.setState({
      session: {
        sessionId: "submitted-exam-session",
        packId: originalDemoPack.manifest.id,
        testId: originalDemoPack.manifest.tests[0].id,
        moduleType: "reading",
        mode: "exam",
        status: "submitted",
        answers: [],
        annotations: [],
      },
    });

    render(<MemoryRouter><ReviewPage /></MemoryRouter>);

    expect(screen.getAllByText("正确答案").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "复盘已锁定" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新练习（新 Session）" })).toBeInTheDocument();
  });

  it("loads the submitted Session pack instead of reviewing the current global pack", async () => {
    const otherPrompt = "This question belongs only to the wrong active pack.";
    const otherPack = packWithIdentity("other-pack", "other-test", otherPrompt);
    let resolvePack: ((pack: IELTSPack | null) => void) | undefined;
    const loadPack = vi.fn(() => new Promise<IELTSPack | null>((resolve) => {
      resolvePack = resolve;
    }));
    workbenchStore.setState({
      activePack: otherPack,
      loadPack,
      session: {
        sessionId: "submitted-original-session",
        packId: originalDemoPack.manifest.id,
        testId: originalDemoPack.manifest.tests[0].id,
        moduleType: "reading",
        mode: "study",
        status: "submitted",
        answers: [],
        annotations: [],
      },
    });
    const originalQuestion = originalDemoPack.modules
      .find((module) => module.type === "reading")!
      .sections[0].questionGroups[0].questions[0];

    render(<MemoryRouter><ReviewPage /></MemoryRouter>);

    expect(screen.getByText("正在读取本次 Session 的题包…")).toBeInTheDocument();
    expect(screen.queryByText(otherPrompt)).not.toBeInTheDocument();
    expect(loadPack).toHaveBeenCalledWith(originalDemoPack.manifest.id);

    await act(async () => resolvePack?.(originalDemoPack));

    expect(await screen.findByText(originalQuestion.prompt)).toBeInTheDocument();
    expect(screen.queryByText(otherPrompt)).not.toBeInTheDocument();
  });

  it("keeps structured table/list context in Reading review without duplicating bound questions", () => {
    const input = structuredClone(originalDemoPack) as unknown as {
      manifest: unknown;
      modules: Array<{
        type: string;
        schemaVersion: number;
        sections: Array<{
          questionGroups: Array<{
            questions: Array<Record<string, unknown>>;
            contextBlocks?: unknown[];
          }>;
        }>;
      }>;
    };
    const reading = input.modules.find((module) => module.type === "reading");
    const group = reading?.sections[0].questionGroups[0];
    if (!reading || !group) throw new Error("Reading fixture missing");
    reading.schemaVersion = 2;
    const original = group.questions[0];
    group.questions[0] = {
      id: original.id,
      number: original.number,
      type: "short-answer",
      prompt: "Which row contains the original review answer?",
      points: 1,
      acceptableAnswers: ["west desk"],
      maxWords: 2,
      caseSensitive: false,
    };
    group.contextBlocks = [{
      id: "review-context-table",
      type: "table",
      hasHeaderRow: true,
      hasRowHeaders: true,
      rows: [
        { id: "review-context-head", cells: [{ id: "review-context-h1", text: "Record" }, { id: "review-context-h2", text: "Desk" }] },
        { id: "review-context-row", cells: [{ id: "review-context-r1", text: "Evening" }, { id: "review-context-a1", text: "Recorded by", questionId: original.id }] },
      ],
    }, {
      id: "review-context-list",
      type: "list",
      style: "unordered",
      items: [{ id: "review-context-list-item", text: "Check the complete table before comparing answers." }],
    }];
    const pack = parseIeltsPack(input);
    workbenchStore.setState({
      activePack: pack,
      session: {
        sessionId: "structured-review-session",
        packId: pack.manifest.id,
        testId: pack.manifest.tests[0].id,
        moduleType: "reading",
        mode: "study",
        status: "submitted",
        answers: [],
        annotations: [],
      },
      answers: {
        "structured-review-session:demo-reading-q01": {
          id: "answer:structured-review-session:demo-reading-q01",
          sessionId: "structured-review-session",
          questionId: "demo-reading-q01",
          value: "west desk",
          updatedAt: "2026-09-09T00:00:00.000Z",
        },
      },
    });

    render(<MemoryRouter><ReviewPage /></MemoryRouter>);
    expect(screen.getByRole("table")).toHaveTextContent("Evening");
    expect(screen.getByRole("list")).toHaveTextContent("Check the complete table");
    expect(screen.getAllByText("Which row contains the original review answer?")).toHaveLength(1);
    expect(screen.getAllByText("west desk")).toHaveLength(2);
    expect(screen.getAllByText("正确").length).toBeGreaterThan(0);
  });
});
