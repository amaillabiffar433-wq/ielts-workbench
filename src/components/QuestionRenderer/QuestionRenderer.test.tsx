import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuestionSchema, type Question } from "../../domain";
import { QuestionRenderer } from "./QuestionRenderer";

function question(input: unknown): Question {
  return QuestionSchema.parse(input) as Question;
}

describe("QuestionRenderer Reading v3 controls", () => {
  afterEach(cleanup);

  it("keeps YNNG values distinct from TFNG values", async () => {
    const onAnswer = vi.fn();
    render(<QuestionRenderer instanceId="left" onAnswer={onAnswer} question={question({
      id: "ynng-q", number: 14, type: "yes-no-not-given", prompt: "Does the writer agree?", correctAnswer: "yes",
    })} />);

    await userEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(onAnswer).toHaveBeenCalledWith("ynng-q", "yes");
    expect(screen.queryByRole("radio", { name: "True" })).not.toBeInTheDocument();
  });

  it("enforces the declared multiple-choice selection limit and shares one array value", async () => {
    const onAnswer = vi.fn();
    const item = question({
      id: "multi-q", number: 18, type: "multiple-choice", prompt: "Choose two.",
      options: [{ id: "multi-a", label: "A", text: "Alpha" }, { id: "multi-b", label: "B", text: "Beta" }, { id: "multi-c", label: "C", text: "Gamma" }],
      selectionCount: 2, additionalNumbers: [], scoringMode: "exact-set", correctOptionIds: ["multi-a", "multi-c"],
    });
    const { rerender } = render(<QuestionRenderer answer={["multi-a", "multi-b"]} instanceId="right" onAnswer={onAnswer} question={item} />);

    expect(screen.getByRole("checkbox", { name: /Gamma/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Alpha/ }));
    expect(onAnswer).toHaveBeenCalledWith("multi-q", ["multi-b"]);

    rerender(<QuestionRenderer answer={["multi-b"]} instanceId="right" onAnswer={onAnswer} question={item} />);
    expect(screen.getByRole("checkbox", { name: /Gamma/ })).toBeEnabled();
  });

  it("renders matching through stable option IDs and exposes reuse policy", async () => {
    const onAnswer = vi.fn();
    render(<QuestionRenderer instanceId="left" onAnswer={onAnswer} question={question({
      id: "matching-q", number: 20, type: "matching", prompt: "Match the person.", matchingKind: "features", allowOptionReuse: true,
      options: [{ id: "person-a", label: "A", text: "Mina" }, { id: "person-b", label: "B", text: "Tomas" }], correctOptionId: "person-b",
    })} />);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "第 20 题匹配选项" }), "person-b");
    expect(onAnswer).toHaveBeenCalledWith("matching-q", "person-b");
    expect(screen.getByText("该题组允许重复使用选项")).toBeInTheDocument();
  });
});
