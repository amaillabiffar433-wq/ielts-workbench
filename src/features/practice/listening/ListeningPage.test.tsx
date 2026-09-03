import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { originalDemoPack } from "../../../infrastructure/demo/originalDemoPack";
import type { CreateSessionInput, SessionSnapshot } from "../../../infrastructure/repositories/LearningRepository";
import { workbenchStore } from "../../../stores/workbenchStore";
import { ListeningPage } from "./ListeningPage";

const originalState = workbenchStore.getState();

function sessionFor(mode: "study" | "exam"): SessionSnapshot {
  return {
    sessionId: `${mode}-listening-session`,
    packId: originalDemoPack.manifest.id,
    testId: originalDemoPack.manifest.tests[0].id,
    moduleType: "listening",
    mode,
    status: "in-progress",
    answers: [],
    annotations: [],
  };
}

function renderListening(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><ListeningPage /></MemoryRouter>);
}

describe("ListeningPage Exam playback policy", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:original-demo-audio"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const ensureSession = vi.fn(async (input: CreateSessionInput) => {
      const session = sessionFor(input.mode);
      workbenchStore.setState({ session });
      return session;
    });
    const submitSession = vi.fn(async (sessionId: string) => {
      const submitted: SessionSnapshot = {
        ...sessionFor("study"),
        sessionId,
        status: "submitted",
        submittedAt: "2026-09-02T00:00:00.000Z",
      };
      workbenchStore.setState({ session: submitted });
      return submitted;
    });
    workbenchStore.setState({
      activePack: originalDemoPack,
      session: sessionFor("study"),
      answers: {},
      annotations: [],
      saveState: "idle",
      ensureSession,
      submitSession,
      readPackMedia: vi.fn(async () => new Uint8Array([82, 73, 70, 70])),
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
      submitSession: originalState.submitSession,
      readPackMedia: originalState.readPackMedia,
    });
    vi.restoreAllMocks();
  });

  it("resets position and rate when entering Exam mode", async () => {
    renderListening("/practice/listening?mode=study");
    const studyAudio = await screen.findByLabelText("原创示例听力音频") as HTMLAudioElement;
    studyAudio.currentTime = 42;
    studyAudio.playbackRate = 1.5;

    fireEvent.click(screen.getByRole("button", { name: "Exam" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "播放音频" })).toBeEnabled());
    const examAudio = screen.getByLabelText("原创示例听力音频") as HTMLAudioElement;
    expect(examAudio.currentTime).toBe(0);
    expect(examAudio.playbackRate).toBe(1);
    expect(examAudio.controls).toBe(false);
    expect(screen.getByText("仅可顺序播放 · 禁止拖动、倍速与重播")).toBeInTheDocument();
  });

  it("keeps a persisted in-progress Listening exam locked even on a Study URL", async () => {
    workbenchStore.setState({ session: sessionFor("exam") });

    renderListening("/practice/listening?mode=study");

    const audio = await screen.findByLabelText("原创示例听力音频") as HTMLAudioElement;
    await waitFor(() => expect(screen.getByRole("button", { name: "播放音频" })).toBeEnabled());
    expect(audio.controls).toBe(false);
    expect(screen.getByRole("button", { name: "Study" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exam" })).toBeDisabled();
    expect(workbenchStore.getState().ensureSession).toHaveBeenCalledWith(expect.objectContaining({ mode: "exam" }));
  });

  it("restores the last sequential position when a seek is attempted", async () => {
    renderListening("/practice/listening?mode=exam");
    const audio = await screen.findByLabelText("原创示例听力音频") as HTMLAudioElement;
    await waitFor(() => expect(screen.getByRole("button", { name: "播放音频" })).toBeEnabled());

    audio.currentTime = 12;
    fireEvent.timeUpdate(audio);
    audio.currentTime = 31;
    fireEvent.seeking(audio);

    expect(audio.currentTime).toBe(12);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "12");
  });

  it("disables playback after the Exam audio ends so it cannot replay", async () => {
    renderListening("/practice/listening?mode=exam");
    const audio = await screen.findByLabelText("原创示例听力音频") as HTMLAudioElement;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const playButton = await screen.findByRole("button", { name: "播放音频" });
    await waitFor(() => expect(pause).toHaveBeenCalled());

    fireEvent.click(playButton);
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.ended(audio);

    const endedButton = await screen.findByRole("button", { name: "音频已播放完毕" });
    expect(endedButton).toBeDisabled();
    fireEvent.click(endedButton);
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByText("播放已结束 · 禁止重播")).toBeInTheDocument();
  });

  it("initializes Exam audio when the matching session arrives before its load promise settles", async () => {
    const examSession = sessionFor("exam");
    let resolveSession: ((session: SessionSnapshot) => void) | undefined;
    const ensureSession = vi.fn(() => new Promise<SessionSnapshot>((resolve) => {
      resolveSession = resolve;
    }));
    workbenchStore.setState({ ensureSession });

    renderListening("/practice/listening?mode=exam");
    await waitFor(() => expect(ensureSession).toHaveBeenCalled());
    act(() => workbenchStore.setState({ session: examSession }));
    expect(screen.queryByLabelText("原创示例听力音频")).not.toBeInTheDocument();

    await act(async () => resolveSession?.(examSession));

    const audio = await screen.findByLabelText("原创示例听力音频") as HTMLAudioElement;
    await waitFor(() => expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled());
    expect(audio.currentTime).toBe(0);
    expect(audio.playbackRate).toBe(1);
    expect(audio.controls).toBe(false);
  });

  it("shows a recoverable error when Session restoration fails", async () => {
    const restored = sessionFor("study");
    const ensureSession = vi.fn()
      .mockRejectedValueOnce(new Error("session database is locked"))
      .mockImplementation(async () => {
        workbenchStore.setState({ session: restored });
        return restored;
      });
    workbenchStore.setState({ ensureSession, session: null });
    renderListening("/practice/listening?mode=study");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "无法恢复听力 Session：session database is locked",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByLabelText("原创示例听力音频")).toBeInTheDocument();
    expect(ensureSession).toHaveBeenCalledTimes(2);
  });

  it("persists the Listening session before leaving the locked Exam", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderListening("/practice/listening?mode=exam");
    const submitButton = await screen.findByRole("button", { name: "提交本次听力" });
    await waitFor(() => expect(submitButton).toBeEnabled());

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(workbenchStore.getState().submitSession).toHaveBeenCalledWith("exam-listening-session");
      expect(workbenchStore.getState().session?.status).toBe("submitted");
    });
  });
});
