import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StructuredContextEditor } from "./StructuredContextEditor";
import {
  createStructuredGroup,
  createStructuredQuestion,
  type StructuredGroupDraft,
} from "./structuredImportModel";

function groupFixture(): StructuredGroupDraft {
  return createStructuredGroup({
    id: "editor-group",
    title: "Questions 18–19 / Table Completion",
    instructions: "Complete the table.",
    questions: [
      createStructuredQuestion({ id: "editor-q18", number: 18, type: "short-answer", prompt: "First table answer" }),
      createStructuredQuestion({ id: "editor-q19", number: 19, type: "fill-blank", prompt: "Second ______ answer" }),
    ],
  });
}

function StatefulEditor() {
  const [group, setGroup] = useState(groupFixture);
  return <StructuredContextEditor group={group} onChange={setGroup} />;
}

describe("StructuredContextEditor", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("adds list/table nodes, edits cells, and binds only a current-group question", () => {
    render(<StatefulEditor />);
    fireEvent.click(screen.getByRole("button", { name: "列表" }));
    fireEvent.change(screen.getByLabelText("列表项 1"), { target: { value: "Read each row label." } });
    fireEvent.click(screen.getByRole("button", { name: "表格" }));
    fireEvent.click(screen.getByRole("button", { name: "新增表格行" }));
    fireEvent.click(screen.getByRole("button", { name: "新增表格列" }));
    expect(screen.getByLabelText("行数")).toHaveValue(3);
    expect(screen.getByLabelText("列数")).toHaveValue(3);
    fireEvent.click(screen.getByRole("button", { name: "删除最后一行" }));
    fireEvent.click(screen.getByRole("button", { name: "删除最后一列" }));
    fireEvent.change(screen.getByLabelText("表格第 2 行第 2 列文字"), { target: { value: "Recorded at the west desk" } });
    const binding = screen.getByLabelText("表格第 2 行第 2 列题目绑定");
    expect(binding).toHaveTextContent("Q18 · First table answer");
    expect(binding).toHaveTextContent("Q19 · Second ______ answer");
    fireEvent.change(binding, { target: { value: "editor-q18" } });
    expect(screen.getAllByText("Question 18").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
  });

  it("asks before shrinking away a bound cell and preserves it when cancelled", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<StatefulEditor />);
    fireEvent.click(screen.getByRole("button", { name: "表格" }));
    fireEvent.change(screen.getByLabelText("表格第 2 行第 2 列题目绑定"), { target: { value: "editor-q18" } });
    fireEvent.change(screen.getByLabelText("行数"), { target: { value: "1" } });
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("解除 1 个题目绑定"));
    expect(screen.getByLabelText("行数")).toHaveValue(2);
    expect(screen.getByLabelText("表格第 2 行第 2 列题目绑定")).toHaveValue("editor-q18");
  });
});
