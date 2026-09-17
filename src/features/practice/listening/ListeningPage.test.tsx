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
      questionFlags: new Set(),
      ensureSession,
      submitSession,
      flushPendingSaves: vi.fn(async () => undefined),
      updateSessionElapsed: vi.fn(async () => undefined),
      loadSetting: vi.fn(async () => null),
      saveSetting: vi.fn(async () => undefined),
      toggleQuestionFlag: vi.fn(async () => undefined),
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
      questionFlags: originalState.questionFlags,
      ensureSession: originalState.ensureSession,
      submitSession: originalState.submitSession,
      flushPendingSaves: originalState.flushPendingSaves,
      updateSessionElapsed: originalState.updateSessionElapsed,
      loadSetting: originalState.loadSetting,
      saveSetting: originalState.saveSetting,
      toggleQuestionFlag: originalState.toggleQuestionFlag,
      readPackMedia: originalState.readPackMedia,
    });
    vi.restoreAllMocks();
  });

  it("resets position and rate when entering Exam mode", async () => {
    renderListening("/practice/listening?mode=study");
    const studyAudio = await screen.findByLabelText("Original local listening audio") as HTMLAudioElement;
    expect(workbenchStore.getState().readPackMedia).toHaveBeenCalledWith(
      "original-demo-pack",
      "media/audio/original-demo-tones.wav",
    );
    studyAudio.currentTime = 42;
    studyAudio.playbackRate = 1.5;

    fireEvent.click(screen.getByRole("button", { name: "Exam" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Play audio" })).toBeEnabled());
    const examAudio = screen.getByLabelText("Original local listening audio") as HTMLAudioElement;
    expect(examAudio.currentTime).toBe(0);
    expect(examAudio.playbackRate).toBe(1);
    expect(examAudio.controls).toBe(false);
    expect(screen.getByText("Sequential playback only · seeking, speed changes, and replay disabled")).toBeInTheDocument();
  });

  it("restores and persists the Study playback position with custom transport controls", async () => {
    const loadSetting = vi.fn(async () => "1.25");
    const saveSetting = vi.fn(async () => undefined);
    workbenchStore.setState({ loadSetting, saveSetting });
    renderListening("/practice/listening?mode=study");

    const audio = await screen.findByLabelText("Original local listening audio") as HTMLAudioElement;
    await waitFor(() => expect(audio.currentTime).toBe(1.25));
    expect(loadSetting).toHaveBeenCalledWith(expect.stringContaining("listening.playbackPosition.study-listening-session"));
    expect(screen.getByRole("button", { name: "Back 5 seconds" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Forward 5 seconds" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Playback speed" })).toHaveValue("1");
    expect(screen.getByText(/No verified transcript was supplied/)).toBeInTheDocument();

    audio.currentTime = 5;
    fireEvent.timeUpdate(audio);
    await waitFor(() => expect(saveSetting).toHaveBeenCalledWith(expect.any(String), "5"));
  });

  it("prefers a review deep-link timestamp over the saved Study playback position", async () => {
    const loadSetting = vi.fn(async (key: string) => (
      key.includes("listening.playbackPosition") ? "1.25" : null
    ));
    workbenchStore.setState({ loadSetting });

    renderListening("/practice/listening?mode=study&tMs=2500");

    const audio = await screen.findByLabelText("Original local listening audio") as HTMLAudioElement;
    await waitFor(() => expect(audio.currentTime).toBe(2.5));
  });

  it("keeps a persisted in-progress Listening exam locked even on a Study URL", async () => {
    workbenchStore.setState({ session: sessionFor("exam") });

    renderListening("/practice/listening?mode=study");

    const audio = await screen.findByLabelText("Original local listening audio") as HTMLAudioElement;
    await waitFor(() => expect(screen.getByRole("button", { name: "Play audio" })).toBeEnabled());
    expect(audio.controls).toBe(false);
    expect(screen.getByRole("button", { name: "Study" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Exam" })).toBeDisabled();
    expect(workbenchStore.getState().ensureSession).toHaveBeenCalledWith(expect.objectContaining({ mode: "exam" }));
  });

  it("restores the last sequential position when a seek is attempted", async () => {
    renderListening("/practice/listening?mode=exam");
    const audio = await screen.findByLabelText("Original local listening audio") as HTMLAudioElement;
    await waitFor(() => expect(screen.getByRole("button", { name: "Play audio" })).toBeEnabled());

    audio.currentTime = 12;
    fireEvent.timeUpdate(audio);
    audio.currentTime = 31;
    fireEvent.seeking(audio);

    expect(audio.currentTime).toBe(12);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "12");
  });

  it("disables playback after the Exam audio ends so it cannot replay", async () => {
    renderListening("/practice/listening?mode=exam");
    const audio = await screen.findByLabelText("Original local listening audio") as HTMLAudioElement;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    const playButton = await screen.findByRole("button", { name: "Play audio" });
    await waitFor(() => expect(pause).toHaveBeenCalled());

    fireEvent.click(playButton);
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.ended(audio);

    const endedButton = await screen.findByRole("button", { name: "Audio finished" });
    expect(endedButton).toBeDisabled();
    fireEvent.click(endedButton);
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Playback finished · replay disabled")).toBeInTheDocument();
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
    expect(screen.queryByLabelText("Original local listening audio")).not.toBeInTheDocument();

    await act(async () => resolveSession?.(examSession));

    const audio = await screen.findByLabelText("Original local listening audio") as HTMLAudioElement;
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
      "Unable to restore the Listening session: session database is locked",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByLabelText("Original local listening audio")).toBeInTheDocument();
    expect(ensureSession).toHaveBeenCalledTimes(2);
  });

  it("persists the Listening session before leaving the locked Exam", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderListening("/practice/listening?mode=exam");
    const submitButton = await screen.findByRole("button", { name: "Submit Listening" });
    await waitFor(() => expect(submitButton).toBeEnabled());

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(workbenchStore.getState().submitSession).toHaveBeenCalledWith("exam-listening-session");
      expect(workbenchStore.getState().session?.status).toBe("submitted");
    });
  });
});
