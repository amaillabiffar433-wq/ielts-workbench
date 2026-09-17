import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useStore } from "zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTextAnchor, type IELTSPack, type ReadingModule } from "../domain";
import { QuestionRenderer } from "../components/QuestionRenderer/QuestionRenderer";
import { TextDocument } from "../components/TextDocument/TextDocument";
import { originalDemoPack } from "../infrastructure/demo";
import { InMemoryLearningRepository } from "../infrastructure/repositories/InMemoryLearningRepository";
import type { CreateSessionInput, SessionSnapshot } from "../infrastructure/repositories/LearningRepository";
import { answerKey, createWorkbenchStore, type WorkbenchState } from "./workbenchStore";

function testRepository() {
  return InMemoryLearningRepository.withOriginalDemo({
    workspace: {
      path: "D:\\IELTS-Workbench-Test",
      displayName: "IELTS-Workbench-Test",
      databasePath: "D:\\IELTS-Workbench-Test\\ielts-workbench.sqlite3",
      initializedAt: "2026-09-01T00:00:00.000Z",
    },
  });
}

async function readyStore() {
  const store = createWorkbenchStore(testRepository());
  await store.getState().initialize();
  const session = await store.getState().ensureSession({
    packId: originalDemoPack.manifest.id,
    testId: originalDemoPack.manifest.tests[0].id,
    moduleType: "reading",
    mode: "study",
  });
  return { store, session };
}

function packWithIdentity(packId: string, testId: string): IELTSPack {
  return {
    ...originalDemoPack,
    manifest: {
      ...originalDemoPack.manifest,
      id: packId,
      title: `Pack ${packId}`,
      tests: [{
        ...originalDemoPack.manifest.tests[0],
        id: testId,
      }],
    },
  };
}

function sessionWithIdentity(input: CreateSessionInput, sessionId: string): SessionSnapshot {
  return {
    sessionId,
    packId: input.packId,
    testId: input.testId,
    moduleType: input.moduleType,
    mode: input.mode,
    status: "in-progress",
    answers: [],
    annotations: [],
  };
}

describe("canonical shared-pane state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updates two question views immediately from one sessionId + questionId answer", async () => {
    const { store, session } = await readyStore();
    const reading = originalDemoPack.modules.find((module): module is ReadingModule => module.type === "reading");
    const question = reading?.sections
      .flatMap((section) => section.questionGroups.flatMap((group) => group.questions))
      .find((candidate) => candidate.type === "single-choice");
    if (!question || question.type !== "single-choice") throw new Error("Demo needs a single-choice question");
    const selectedQuestion = question;

    function MirrorQuestions() {
      const answer = useStore(store, (state: WorkbenchState) => state.answers[answerKey(session.sessionId, selectedQuestion.id)]?.value);
      const answerQuestion = useStore(store, (state: WorkbenchState) => state.answerQuestion);
      const value = typeof answer === "string" ? answer : "";
      return <>
        <QuestionRenderer answer={value} instanceId="left" onAnswer={(id, next) => void answerQuestion(session.sessionId, id, next)} question={selectedQuestion} />
        <QuestionRenderer answer={value} instanceId="right" onAnswer={(id, next) => void answerQuestion(session.sessionId, id, next)} question={selectedQuestion} />
      </>;
    }

    render(<MirrorQuestions />);
    const firstOption = selectedQuestion.options[0];
    if (!firstOption) throw new Error("Demo single-choice question needs an option");
    const optionRadios = screen.getAllByRole("radio", { name: new RegExp(firstOption.text, "i") });
    const leftRadio = optionRadios[0];
    const rightRadio = optionRadios[1];
    if (!leftRadio || !rightRadio) throw new Error("Both question mirrors must render");
    await userEvent.click(leftRadio);
    await waitFor(() => {
      expect(leftRadio).toBeChecked();
      expect(rightRadio).toBeChecked();
    });
    const persisted = await store.getState().repository.loadSession(session.sessionId);
    expect(persisted?.answers[0]?.value).toBe(firstOption.id);
  });

  it("serializes rapid saves for one answer and keeps the newest optimistic value", async () => {
    const repository = testRepository();
    const store = createWorkbenchStore(repository);
    await store.getState().initialize();
    const session = await store.getState().ensureSession({
      packId: originalDemoPack.manifest.id,
      testId: originalDemoPack.manifest.tests[0].id,
      moduleType: "reading",
      mode: "study",
    });
    let releaseFirstSave: (() => void) | undefined;
    const firstSaveGate = new Promise<void>((resolve) => { releaseFirstSave = resolve; });
    let callCount = 0;
    const saveSpy = vi.spyOn(repository, "saveAnswer").mockImplementation(async (input) => {
      callCount += 1;
      if (callCount === 1) await firstSaveGate;
      return {
        id: `answer:${input.sessionId}:${input.questionId}`,
        sessionId: input.sessionId,
        questionId: input.questionId,
        value: input.value,
        updatedAt: `2026-09-02T00:00:0${callCount}.000Z`,
      };
    });

    const firstSave = store.getState().answerQuestion(session.sessionId, "demo-reading-q01", "true");
    const secondSave = store.getState().answerQuestion(session.sessionId, "demo-reading-q01", "false");

    await Promise.resolve();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(store.getState().answers[answerKey(session.sessionId, "demo-reading-q01")]?.value).toBe("false");
    releaseFirstSave?.();
    await Promise.all([firstSave, secondSave]);

    expect(saveSpy.mock.calls.map(([input]) => input.value)).toEqual(["true", "false"]);
    expect(store.getState().answers[answerKey(session.sessionId, "demo-reading-q01")]?.value).toBe("false");
  });

  it("renders one annotation record in two panes and deleting from either removes both", async () => {
    const { store, session } = await readyStore();
    const reading = originalDemoPack.modules.find((module): module is ReadingModule => module.type === "reading");
    const block = reading?.sections[0].contentBlocks.find((candidate) => candidate.kind === "paragraph");
    if (!block) throw new Error("Demo needs a paragraph block");
    const selectedBlock = block;
    const anchor = createTextAnchor(selectedBlock.id, selectedBlock.text, 0, Math.min(12, selectedBlock.text.length));

    await act(async () => {
      await store.getState().addAnnotation({
        sessionId: session.sessionId,
        anchor,
        style: "highlight-yellow",
        note: "shared evidence",
      });
    });

    function MirrorText() {
      const annotations = useStore(store, (state: WorkbenchState) => state.annotations);
      const removeAnnotation = useStore(store, (state: WorkbenchState) => state.removeAnnotation);
      return <>
        <TextDocument annotations={annotations} blocks={[selectedBlock]} onCreateAnnotation={() => undefined} onDeleteAnnotation={(id) => void removeAnnotation(id)} />
        <TextDocument annotations={annotations} blocks={[selectedBlock]} onCreateAnnotation={() => undefined} onDeleteAnnotation={(id) => void removeAnnotation(id)} />
      </>;
    }

    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<MirrorText />);
    expect(screen.getAllByRole("button", { name: /Annotated text/ })).toHaveLength(2);
    const secondRenderedAnnotation = screen.getAllByRole("button", { name: /Annotated text/ })[1];
    if (!secondRenderedAnnotation) throw new Error("Second annotation mirror is missing");
    await userEvent.click(secondRenderedAnnotation);
    await waitFor(() => expect(screen.queryAllByRole("button", { name: /Annotated text/ })).toHaveLength(0));
    expect((await store.getState().repository.loadSession(session.sessionId))?.annotations).toHaveLength(0);
  });

  it("persists submission before exposing the review state", async () => {
    const { store, session } = await readyStore();

    const submitted = await store.getState().submitSession(session.sessionId);

    expect(submitted.status).toBe("submitted");
    expect(submitted.submittedAt).toBeTruthy();
    expect(store.getState().session).toEqual(submitted);
    expect((await store.getState().repository.loadSession(session.sessionId))?.status).toBe("submitted");
  });

  it("does not let an older pack request overwrite the newest active pack", async () => {
    const repository = testRepository();
    const olderPack = packWithIdentity("older-pack", "older-test");
    const newerPack = packWithIdentity("newer-pack", "newer-test");
    let resolveOlder: ((pack: IELTSPack | null) => void) | undefined;
    let resolveNewer: ((pack: IELTSPack | null) => void) | undefined;
    vi.spyOn(repository, "loadPack").mockImplementation((packId) => {
      if (packId === "older-pack") {
        return new Promise((resolve) => { resolveOlder = resolve; });
      }
      return new Promise((resolve) => { resolveNewer = resolve; });
    });
    const store = createWorkbenchStore(repository);

    const olderRequest = store.getState().loadPack("older-pack");
    const newerRequest = store.getState().loadPack("newer-pack");
    resolveNewer?.(newerPack);
    await newerRequest;
    expect(store.getState().activePack?.manifest.id).toBe("newer-pack");

    resolveOlder?.(olderPack);
    await olderRequest;
    expect(store.getState().activePack?.manifest.id).toBe("newer-pack");
  });

  it("keys resumable sessions by test and rejects a persisted session with the wrong identity", async () => {
    const repository = testRepository();
    const input: CreateSessionInput = {
      packId: originalDemoPack.manifest.id,
      testId: originalDemoPack.manifest.tests[0].id,
      moduleType: "reading",
      mode: "study",
    };
    const mismatched = {
      ...sessionWithIdentity(input, "stale-session"),
      packId: "different-pack",
    };
    const replacement = sessionWithIdentity(input, "replacement-session");
    vi.spyOn(repository, "getSetting").mockResolvedValue("stale-session");
    vi.spyOn(repository, "loadSession").mockResolvedValue(mismatched);
    const createSession = vi.spyOn(repository, "createSession").mockResolvedValue(replacement);
    const setSetting = vi.spyOn(repository, "setSetting").mockResolvedValue();
    const store = createWorkbenchStore(repository);

    const session = await store.getState().ensureSession(input);

    expect(createSession).toHaveBeenCalledWith(input);
    expect(setSetting).toHaveBeenCalledWith(
      "activeSession.original-demo-pack.demo-test-01.reading.study",
      replacement.sessionId,
    );
    expect(session).toEqual(replacement);
    expect(store.getState().session).toEqual(replacement);
  });

  it("does not let an older session request overwrite the newest route identity", async () => {
    const repository = testRepository();
    const olderInput: CreateSessionInput = {
      packId: originalDemoPack.manifest.id,
      testId: originalDemoPack.manifest.tests[0].id,
      moduleType: "reading",
      mode: "study",
    };
    const newerInput: CreateSessionInput = { ...olderInput, mode: "exam" };
    const olderSession = sessionWithIdentity(olderInput, "older-session");
    const newerSession = sessionWithIdentity(newerInput, "newer-session");
    let resolveOlder: ((session: SessionSnapshot) => void) | undefined;
    vi.spyOn(repository, "getSetting").mockResolvedValue(null);
    vi.spyOn(repository, "setSetting").mockResolvedValue();
    const createSession = vi.spyOn(repository, "createSession").mockImplementation((input) => {
      if (input.mode === "study") {
        return new Promise((resolve) => { resolveOlder = resolve; });
      }
      return Promise.resolve(newerSession);
    });
    const store = createWorkbenchStore(repository);

    const olderRequest = store.getState().ensureSession(olderInput);
    await waitFor(() => expect(createSession).toHaveBeenCalledWith(olderInput));
    const newerRequest = store.getState().ensureSession(newerInput);
    await newerRequest;
    expect(store.getState().session).toEqual(newerSession);

    resolveOlder?.(olderSession);
    await olderRequest;
    expect(store.getState().session).toEqual(newerSession);
  });

  it("deduplicates concurrent session restoration for the same route identity", async () => {
    const repository = testRepository();
    const input: CreateSessionInput = {
      packId: originalDemoPack.manifest.id,
      testId: originalDemoPack.manifest.tests[0].id,
      moduleType: "reading",
      mode: "study",
    };
    const restored = sessionWithIdentity(input, "shared-session");
    let resolveCreate: ((session: SessionSnapshot) => void) | undefined;
    vi.spyOn(repository, "getSetting").mockResolvedValue(null);
    const createSession = vi.spyOn(repository, "createSession").mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );
    const setSetting = vi.spyOn(repository, "setSetting").mockResolvedValue();
    const store = createWorkbenchStore(repository);

    const firstRequest = store.getState().ensureSession(input);
    const secondRequest = store.getState().ensureSession(input);
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    resolveCreate?.(restored);
    await Promise.all([firstRequest, secondRequest]);

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(setSetting).toHaveBeenCalledTimes(1);
    expect(store.getState().session).toEqual(restored);
  });

  it("does not let an older submission overwrite a newer active session", async () => {
    const repository = testRepository();
    const olderInput: CreateSessionInput = {
      packId: originalDemoPack.manifest.id,
      testId: originalDemoPack.manifest.tests[0].id,
      moduleType: "reading",
      mode: "study",
    };
    const newerInput: CreateSessionInput = { ...olderInput, moduleType: "writing" };
    const olderSession = sessionWithIdentity(olderInput, "submitting-session");
    const newerSession = sessionWithIdentity(newerInput, "current-session");
    const submittedSession: SessionSnapshot = {
      ...olderSession,
      status: "submitted",
      submittedAt: "2026-09-02T00:00:00.000Z",
    };
    let resolveSubmit: ((session: SessionSnapshot) => void) | undefined;
    const submitSession = vi.spyOn(repository, "submitSession").mockImplementation(
      () => new Promise((resolve) => { resolveSubmit = resolve; }),
    );
    const store = createWorkbenchStore(repository);
    store.setState({ session: olderSession, answers: {}, annotations: [], saveState: "idle" });

    const submitRequest = store.getState().submitSession(olderSession.sessionId);
    await waitFor(() => expect(submitSession).toHaveBeenCalledWith(olderSession.sessionId));
    store.setState({ session: newerSession, answers: {}, annotations: [], saveState: "idle" });
    resolveSubmit?.(submittedSession);
    await submitRequest;

    expect(store.getState().session).toEqual(newerSession);
    expect(store.getState().saveState).toBe("idle");
  });

  it("keeps submitted history while retrying in a new Session and restores per-session flags", async () => {
    const repository = testRepository();
    const store = createWorkbenchStore(repository);
    await store.getState().initialize();
    const input: CreateSessionInput = {
      packId: originalDemoPack.manifest.id,
      testId: originalDemoPack.manifest.tests[0].id,
      moduleType: "reading",
      mode: "study",
    };
    const original = await store.getState().ensureSession(input);
    await store.getState().answerQuestion(original.sessionId, "demo-reading-q01", "true");
    await store.getState().toggleQuestionFlag(original.sessionId, "demo-reading-q01");
    await store.getState().submitSession(original.sessionId);

    const retry = await store.getState().startNewSession(input);
    expect(retry.sessionId).not.toBe(original.sessionId);
    expect(retry.answers).toHaveLength(0);
    expect(store.getState().questionFlags.size).toBe(0);
    expect((await repository.loadSession(original.sessionId))?.answers).toHaveLength(1);

    await store.getState().loadHistoricalSession(original.sessionId);
    expect(store.getState().questionFlags).toEqual(new Set(["demo-reading-q01"]));
    expect(store.getState().answers[answerKey(original.sessionId, "demo-reading-q01")]?.value).toBe("true");
  });

  it("clears active learning state after switching to another workspace", async () => {
    const { store, session } = await readyStore();
    await store.getState().toggleQuestionFlag(session.sessionId, "demo-reading-q01");
    await store.getState().initializeWorkspace("D:\\IELTS-Workbench-Other");

    expect(store.getState().bootstrap?.workspace?.path).toBe("D:\\IELTS-Workbench-Other");
    expect(store.getState().session).toBeNull();
    expect(store.getState().answers).toEqual({});
    expect(store.getState().annotations).toEqual([]);
    expect(store.getState().questionFlags.size).toBe(0);
  });
});
