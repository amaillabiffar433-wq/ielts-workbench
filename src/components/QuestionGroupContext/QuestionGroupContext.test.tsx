import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTextAnchor, type QuestionContextBlock } from "../../domain";
import { QuestionGroupContext } from "./QuestionGroupContext";
import { boundQuestionIdsFromContext } from "./questionGroupContextModel";

const blocks: readonly QuestionContextBlock[] = [{
  id: "context-table",
  type: "table",
  hasHeaderRow: true,
  hasRowHeaders: true,
  rows: [
    { id: "context-row-head", cells: [{ id: "context-cell-h1", text: "Route" }, { id: "context-cell-h2", text: "Schedule" }] },
    { id: "context-row-1", cells: [{ id: "context-cell-r1", text: "Shared phrase" }, { id: "context-cell-a1", text: "Shared phrase", questionId: "q18" }] },
    { id: "context-row-2", cells: [{ id: "context-cell-r2", text: "Evening" }, { id: "context-cell-a2", text: "Later", questionId: "q19" }] },
  ],
}, {
  id: "context-list",
  type: "list",
  style: "ordered",
  items: [{ id: "context-list-item", text: "Check the row label." }],
}];

describe("QuestionGroupContext", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the complete table while exposing only selected answer slots", () => {
    render(
      <QuestionGroupContext
        blocks={blocks}
        editableQuestionIds={new Set(["q18"])}
        instanceId="right-pane-group"
        questions={[
          { id: "q18", displayNumber: 18, prompt: "Complete the first row." },
          { id: "q19", displayNumber: 19, prompt: "Complete the second row." },
        ]}
        readOnly
        renderAnswerSlot={(question, editable) => editable
          ? <input aria-label={`Question ${question.displayNumber} answer`} />
          : <span>Question {question.displayNumber} read only</span>}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Route" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Shared phrase" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Question 18 answer" })).toBeEnabled();
    expect(screen.queryByRole("textbox", { name: "Question 19 answer" })).not.toBeInTheDocument();
    expect(screen.getByText("Question 19 read only")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveTextContent("Check the row label");
    expect(boundQuestionIdsFromContext(blocks)).toEqual(new Set(["q18", "q19"]));
  });

  it("isolates annotations by stable cell ID even when two cells contain identical text", () => {
    const anchor = createTextAnchor("context-cell-r1", "Shared phrase", 0, 6);
    render(
      <QuestionGroupContext
        annotations={[{ id: "annotation-1", anchor, style: "highlight-yellow" }]}
        blocks={blocks}
        editableQuestionIds={new Set()}
        instanceId="review-group"
        onDeleteAnnotation={vi.fn()}
        questions={[]}
        readOnly
        renderAnswerSlot={() => null}
      />,
    );
    const matchingCells = screen.getAllByRole("cell").filter((cell) => cell.textContent?.includes("Shared phrase"));
    expect(matchingCells).toHaveLength(1);
    const rowHeader = screen.getByRole("rowheader", { name: /Shared phrase/u });
    expect(within(rowHeader).getByRole("button", { name: /标记文字/u })).toHaveTextContent("Shared");
    expect(within(matchingCells[0]).queryByRole("button", { name: /标记文字/u })).not.toBeInTheDocument();
  });

  it("renders summary and notes answer slots from stable questionId bindings", () => {
    const completionBlocks: readonly QuestionContextBlock[] = [{
      id: "completion-summary",
      type: "completion",
      style: "summary",
      title: "Archive notes",
      parts: [
        { id: "completion-text-1", kind: "text", text: "The recorder uses a " },
        { id: "completion-answer-1", kind: "answer", questionId: "q10" },
        { id: "completion-text-2", kind: "text", text: "." },
      ],
    }];
    render(
      <QuestionGroupContext
        blocks={completionBlocks}
        editableQuestionIds={new Set(["q10"])}
        instanceId="left-completion"
        questions={[{ id: "q10", displayNumber: 10, prompt: "Complete the summary." }]}
        readOnly
        renderAnswerSlot={(question, editable) => <input aria-label={`Question ${question.displayNumber} completion`} disabled={!editable} />}
      />,
    );

    expect(screen.getByRole("heading", { name: "Archive notes" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Question 10 completion" })).toBeEnabled();
    expect(boundQuestionIdsFromContext(completionBlocks)).toEqual(new Set(["q10"]));
  });
});
