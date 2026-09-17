import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnnotationRecord } from "../../../infrastructure/repositories/LearningRepository";
import { workbenchStore } from "../../../stores/workbenchStore";
import { ReadingWorkspace } from "./ReadingWorkspace";

const fullscreen = vi.hoisted(() => vi.fn());
vi.mock("../../../infrastructure/window/windowPresentation", () => ({ toggleWindowFullscreen: fullscreen }));
const originalState = workbenchStore.getState();
function renderWorkspace() {
  return render(<ReadingWorkspace toolbar={<header>Reading</header>} panes={<div>Passage</div>}
    navigator={<footer>Answer sheet</footer>} visiblePane={null} onVisiblePaneChange={vi.fn()} answered={3} total={40} />);
}
function note(id: string, sessionId: string, text: string): AnnotationRecord {
  return { id, sessionId, note: text, style: "highlight-yellow", createdAt: "2026-09-12T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z",
    anchor: { blockId: "original-block", startOffset: 0, endOffset: 4, quote: "text", prefix: "", suffix: "" } };
}
describe("Reading presentation notes", () => {
  afterEach(() => { cleanup(); workbenchStore.setState(originalState); vi.clearAllMocks(); });
  it("projects existing session annotations without inventing a second notebook or writing defaults", () => {
    const saveSetting = vi.fn();
    workbenchStore.setState({ session: { sessionId: "current", mode: "study", status: "in-progress", answers: [], annotations: [] },
      annotations: [note("one", "current", "My existing note"), note("two", "other", "Other session private note"), note("three", "current", "  ")], saveSetting });
    renderWorkspace();
    expect(screen.getByText("My existing note")).toBeInTheDocument();
    expect(screen.queryByText("Other session private note")).not.toBeInTheDocument();
    expect(screen.getByText("1 annotation note")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Answer progress" })).toHaveAttribute("max", "40");
    expect(saveSetting).not.toHaveBeenCalled();
  });
  it("shows useful empty notes guidance without a fake editor", () => {
    workbenchStore.setState({ annotations: [] });
    renderWorkspace();
    expect(screen.getByText(/optional note in the annotation toolbar/u)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("shows native fullscreen errors instead of implying that the action succeeded", async () => {
    fullscreen.mockRejectedValueOnce(new Error("native permission denied"));
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to toggle fullscreen: native permission denied");
    fullscreen.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
