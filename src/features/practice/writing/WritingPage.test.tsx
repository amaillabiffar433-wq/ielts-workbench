import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { originalDemoPack } from "../../../infrastructure/demo/originalDemoPack";
import type {
  CreateSessionInput,
  SaveWritingDraftInput,
  SessionSnapshot,
  WritingDraft,
} from "../../../infrastructure/repositories/LearningRepository";
import { workbenchStore } from "../../../stores/workbenchStore";
import { countWords } from "./draftAutosave";
import { WritingPage } from "./WritingPage";

const originalState = workbenchStore.getState();

function sessionFor(mode: "study" | "exam"): SessionSnapshot {
  return {
    sessionId: `${mode}-writing-session`,
    packId: originalDemoPack.manifest.id,
    testId: originalDemoPack.manifest.tests[0].id,
    moduleType: "writing",
    mode,
    status: "in-progress",
    answers: [],
    annotations: [],
  };
}

function savedDraft(input: SaveWritingDraftInput): WritingDraft {
  return {
    ...input,
    wordCount: countWords(input.content),
    updatedAt: "2026-09-02T00:00:00.000Z",
  };
}

function renderWriting(path = "/practice/writing?mode=study") {
  return render(<MemoryRouter initialEntries={[path]}><WritingPage /></MemoryRouter>);
}

describe("WritingPage durable draft transitions", () => {
  const repository = originalState.repository;

  beforeEach(() => {
    vi.spyOn(repository, "loadWritingDraft").mockResolvedValue(null);
    vi.spyOn(repository, "listWritingVersions").mockResolvedValue([]);
    vi.spyOn(repository, "saveWritingDraft").mockImplementation(async (input) => savedDraft(input));

    const ensureSession = vi.fn(async (input: CreateSessionInput) => {
      const nextSession = sessionFor(input.mode);
      workbenchStore.setState({ session: nextSession });
      return nextSession;
    });
    workbenchStore.setState({
      activePack: originalDemoPack,
      session: sessionFor("study"),
      saveState: "idle",
      error: null,
      ensureSession,
    });
  });

  afterEach(() => {
    cleanup();
    workbenchStore.setState({
      activePack: originalState.activePack,
      session: originalState.session,
      saveState: originalState.saveState,
      error: originalState.error,
      ensureSession: originalState.ensureSession,
    });
    vi.restoreAllMocks();
  });

  it("flushes a pending Task 1 draft before switching to Task 2", async () => {
    renderWriting();
    const editor = await screen.findByRole("textbox", { name: "作文正文" });
    const taskTwo = screen.getByRole("button", { name: "Task 2" });

    fireEvent.change(editor, { target: { value: "A pending Task 1 paragraph." } });
    fireEvent.click(taskTwo);

    await waitFor(() => {
      expect(repository.saveWritingDraft).toHaveBeenCalledWith({
        sessionId: "study-writing-session",
        taskId: "demo-writing-task-01",
        content: "A pending Task 1 paragraph.",
      });
      expect(taskTwo).toHaveAttribute("aria-current", "page");
    });
  });

  it("keeps the current task visible when the transition save fails", async () => {
    vi.mocked(repository.saveWritingDraft).mockRejectedValueOnce(new Error("workspace became unavailable"));
    renderWriting();
    const editor = await screen.findByRole("textbox", { name: "作文正文" });
    const taskOne = screen.getByRole("button", { name: "Task 1" });
    const taskTwo = screen.getByRole("button", { name: "Task 2" });

    fireEvent.change(editor, { target: { value: "Do not lose this text." } });
    fireEvent.click(taskTwo);

    expect(await screen.findByText("workspace became unavailable")).toBeInTheDocument();
    expect(taskOne).toHaveAttribute("aria-current", "page");
    expect(taskTwo).not.toHaveAttribute("aria-current", "page");
    expect(editor).toHaveValue("Do not lose this text.");

    fireEvent.click(taskTwo);

    await waitFor(() => {
      expect(repository.saveWritingDraft).toHaveBeenCalledTimes(2);
      expect(taskTwo).toHaveAttribute("aria-current", "page");
    });
  });

  it("starts persisting a pending draft when the page unmounts", async () => {
    const view = renderWriting();
    const editor = await screen.findByRole("textbox", { name: "作文正文" });
    fireEvent.change(editor, { target: { value: "Flush this on navigation." } });

    view.unmount();

    await waitFor(() => expect(repository.saveWritingDraft).toHaveBeenCalledWith({
      sessionId: "study-writing-session",
      taskId: "demo-writing-task-01",
      content: "Flush this on navigation.",
    }));
  });

  it("flushes the current draft before creating the Exam session", async () => {
    const events: string[] = [];
    vi.mocked(repository.saveWritingDraft).mockImplementation(async (input) => {
      events.push("save");
      return savedDraft(input);
    });
    const ensureSession = vi.fn(async (input: CreateSessionInput) => {
      events.push(`ensure:${input.mode}`);
      const nextSession = sessionFor(input.mode);
      workbenchStore.setState({ session: nextSession });
      return nextSession;
    });
    workbenchStore.setState({ ensureSession });

    renderWriting();
    const editor = await screen.findByRole("textbox", { name: "作文正文" });
    await waitFor(() => expect(ensureSession).toHaveBeenCalledWith(expect.objectContaining({ mode: "study" })));
    events.length = 0;

    fireEvent.change(editor, { target: { value: "Save before changing mode." } });
    fireEvent.click(screen.getByRole("button", { name: "Exam" }));

    await waitFor(() => expect(ensureSession).toHaveBeenCalledWith(expect.objectContaining({ mode: "exam" })));
    expect(events[0]).toBe("save");
    expect(events).toContain("ensure:exam");
  });

  it("shows a recoverable error when Session restoration fails", async () => {
    const restored = sessionFor("study");
    const ensureSession = vi.fn()
      .mockRejectedValueOnce(new Error("cannot open workspace database"))
      .mockImplementation(async () => {
        workbenchStore.setState({ session: restored });
        return restored;
      });
    workbenchStore.setState({ ensureSession, session: null });
    renderWriting();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法恢复写作 Session：cannot open workspace database",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByRole("textbox", { name: "作文正文" })).toBeInTheDocument();
    expect(ensureSession).toHaveBeenCalledTimes(2);
  });
});
