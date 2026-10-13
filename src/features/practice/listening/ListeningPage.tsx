import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { CheckCircle2, Clock3, Eye, EyeOff, FileText, Headphones, Lock, Pause, Play, Volume2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ListeningModule, Question, TranscriptCue } from "../../../domain";
import { scoreQuestion } from "../../../domain/questionScoring";
import { QuestionRenderer } from "../../../components/QuestionRenderer/QuestionRenderer";
import { SaveStatus } from "../../../components/common/SaveStatus";
import { SegmentedControl } from "../../../components/common/SegmentedControl";
import { answerKey, useWorkbenchStore } from "../../../stores/workbenchStore";
import { confirmAction } from "../../../infrastructure/window/windowClose";
import { usePracticeRoutePack } from "../usePracticeRoutePack";
import { derivePracticeElapsed, formatPracticeTime } from "../practiceTimer";
import { decodeWaveform } from "./audioWaveform";
import { StudyAudioControls } from "./StudyAudioControls";
import { QuestionGroupContext } from "../../../components/QuestionGroupContext/QuestionGroupContext";
import { boundQuestionIdsFromContext } from "../../../components/QuestionGroupContext/questionGroupContextModel";
import "./ListeningPage.css";

type ListeningMode = "study" | "exam";
type ListeningPreferences = { readonly waveform: boolean; readonly skipButtons: boolean; readonly transcript: boolean; readonly cloze: boolean; readonly audioMistakeLinks: boolean };
const DEFAULT_LISTENING_PREFERENCES: ListeningPreferences = { waveform: true, skipButtons: true, transcript: true, cloze: true, audioMistakeLinks: true };

function playbackSettingKey(sessionId: string, moduleId: string): string {
  return `listening.playbackPosition.${sessionId}.${moduleId}`;
}

function clozeCue(cue: TranscriptCue, revealed: ReadonlySet<string>, reveal: (key: string) => void): ReactNode {
  if (cue.clozeAnswers.length === 0) return cue.text;
  const answers = [...cue.clozeAnswers].sort((left, right) => right.length - left.length);
  const escaped = answers.map((answer) => answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = new RegExp(`(${escaped.join("|")})`, "gi");
  return cue.text.split(matcher).map((part, index) => {
    const answer = answers.find((candidate) => candidate.toLocaleLowerCase("en-US") === part.toLocaleLowerCase("en-US"));
    if (!answer) return <Fragment key={`${cue.id}:text:${index}`}>{part}</Fragment>;
    const key = `${cue.id}:${index}`;
    const isRevealed = revealed.has(key);
    return <button aria-label={isRevealed ? `Hide ${answer}` : "Reveal missing word"} className="transcript-cloze" key={key} onClick={() => reveal(key)} type="button">{isRevealed ? part : "•••••"}</button>;
  });
}

function timeLabel(seconds: number): string {
  if (!Number.isFinite(seconds)) return "00:00";
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function ExamAudioControls({ audioRef, available, currentTime, duration, ended }: {
  audioRef: RefObject<HTMLAudioElement | null>;
  available: boolean;
  currentTime: number;
  duration: number;
  ended: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioRef]);

  return (
    <div className="exam-audio" aria-label="Exam audio controls">
      <button
        aria-label={ended ? "Audio finished" : playing ? "Pause audio" : "Play audio"}
        className="button"
        disabled={!available || ended}
        onClick={() => {
          const audio = audioRef.current;
          if (!audio || ended || audio.ended) return;
          if (audio.paused) void audio.play();
          else audio.pause();
        }}
        type="button"
      >
        {playing ? <Pause aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
        {ended ? "Finished" : playing ? "Pause" : "Play"}
      </button>
      <div aria-label={`Playback progress ${timeLabel(currentTime)} / ${timeLabel(duration)}`} className="exam-audio__progress" role="progressbar" aria-valuemax={duration || 1} aria-valuemin={0} aria-valuenow={currentTime}>
        <span style={{ width: `${duration ? Math.min(100, currentTime / duration * 100) : 0}%` }} />
      </div>
      <span className="exam-audio__time">{timeLabel(currentTime)} / {timeLabel(duration)}</span>
      <span aria-live="polite" className="status-badge" role="status">
        <Lock aria-hidden="true" size={12} />
        {ended ? "Playback finished · replay disabled" : "Sequential playback only · seeking, speed changes, and replay disabled"}
      </span>
    </div>
  );
}

export function ListeningPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode: ListeningMode = searchParams.get("mode") === "exam" ? "exam" : "study";
  const [sectionIndex, setSectionIndex] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<readonly number[]>([]);
  const [clozeMode, setClozeMode] = useState(false);
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [revealedCloze, setRevealedCloze] = useState<ReadonlySet<string>>(new Set());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [examPlaybackEnded, setExamPlaybackEnded] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionRetryRevision, setSessionRetryRevision] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<ListeningPreferences>(DEFAULT_LISTENING_PREFERENCES);
  const audioRef = useRef<HTMLAudioElement>(null);
  const allowedExamTimeRef = useRef(0);
  const latestPlaybackPositionRef = useRef(0);
  const mountedAtRef = useRef(0);
  const latestElapsedRef = useRef(0);
  const lastPersistedPlaybackRef = useRef(0);
  const playbackRestoreCompleteRef = useRef(false);
  const routePack = usePracticeRoutePack();
  const activePack = routePack.pack;
  const test = routePack.test;
  const session = useWorkbenchStore((state) => state.session);
  const answers = useWorkbenchStore((state) => state.answers);
  const saveState = useWorkbenchStore((state) => state.saveState);
  const questionFlags = useWorkbenchStore((state) => state.questionFlags);
  const repository = useWorkbenchStore((state) => state.repository);
  const ensureSession = useWorkbenchStore((state) => state.ensureSession);
  const submitSession = useWorkbenchStore((state) => state.submitSession);
  const answerQuestion = useWorkbenchStore((state) => state.answerQuestion);
  const toggleQuestionFlag = useWorkbenchStore((state) => state.toggleQuestionFlag);
  const flushPendingSaves = useWorkbenchStore((state) => state.flushPendingSaves);
  const updateSessionElapsed = useWorkbenchStore((state) => state.updateSessionElapsed);
  const loadSetting = useWorkbenchStore((state) => state.loadSetting);
  const saveSetting = useWorkbenchStore((state) => state.saveSetting);
  const readPackMedia = useWorkbenchStore((state) => state.readPackMedia);
  const activeListeningExamLock = session?.moduleType === "listening"
    && session.mode === "exam"
    && session.status === "in-progress";
  const mode: ListeningMode = activeListeningExamLock ? "exam" : requestedMode;
  const sessionId = session?.sessionId;
  useEffect(() => { setTranscriptVisible(false); }, [sessionId]);
  const persistedElapsedSeconds = session?.elapsedSeconds ?? 0;
  const sessionStartedAt = session?.startedAt;

  const module = useMemo(
    () => activePack?.modules.find(
      (candidate): candidate is ListeningModule => candidate.type === "listening" && candidate.testId === test?.id,
    ) ?? null,
    [activePack, test],
  );
  const media = activePack?.manifest.mediaAssets.find((asset) => asset.id === module?.audioAssetId && asset.type === "audio");
  const section = module?.sections[sectionIndex] ?? module?.sections[0];
  useEffect(()=>{
    if(!module||!sessionId)return;
    let active=true;
    const linked=searchParams.get("sourceSectionId");
    void loadSetting(`listening.section.${sessionId}`).then(saved=>{
      if(!active)return;
      const index=module.sections.findIndex(candidate=>candidate.id===(linked??saved));
      setSectionIndex(Math.max(0,index));
    }).catch(()=>{if(active)setAudioError("Unable to restore the selected section.");});
    return()=>{active=false;};
  },[module,sessionId,loadSetting,searchParams]);
  const transcriptCues = section?.transcriptCues ?? [];
  const allQuestionEntries = module?.sections.flatMap((candidate) => candidate.questionGroups.flatMap((group) => group.questions.map((question) => ({ question, sourceStartMs: candidate.startMs })))) ?? [];
  const allQuestions: readonly Question[] = allQuestionEntries.map((entry) => entry.question);
  const sessionMatchesRoute = Boolean(
    session
    && activePack
    && test
    && session.packId === activePack.manifest.id
    && session.testId === test.id
    && session.moduleType === "listening"
    && session.mode === mode,
  );

  useEffect(() => {
    if (!activePack || !module || !test) return;
    let active = true;
    setSessionLoading(true);
    setSessionError(null);
    void ensureSession({
      packId: activePack.manifest.id,
      testId: test.id,
      moduleType: "listening",
      mode,
    }).catch((error: unknown) => {
      if (active) setSessionError(error instanceof Error ? error.message : String(error));
    }).finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, [activePack, ensureSession, mode, module, sessionRetryRevision, test]);

  useEffect(() => {
    let active = true;
    const keys = ["waveform", "skipButtons", "transcript", "cloze", "audioMistakeLinks"] as const;
    void Promise.all(keys.map((key) => loadSetting(`listening.${key}`))).then((values) => {
      if (!active) return;
      setPreferences(Object.fromEntries(keys.map((key, index) => [key, values[index] !== "false"])) as unknown as ListeningPreferences);
    });
    return () => { active = false; };
  }, [loadSetting]);

  useEffect(() => {
    if (!activePack || !media) return;
    let active = true;
    let objectUrl: string | null = null;
    setMediaLoading(true);
    setAudioError(null);
    setWaveform([]);
    void readPackMedia(activePack.manifest.id, media.relativePath)
      .then((bytes) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: media.mimeType }));
        setAudioUrl(objectUrl);
        void decodeWaveform(bytes).then((bars) => {
          if (active) setWaveform(bars);
        }).catch(() => {
          if (active) setWaveform([]);
        });
      })
      .catch((error: unknown) => {
        if (active) setAudioError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => { if (active) setMediaLoading(false); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activePack, media, readPackMedia]);

  useEffect(() => {
    if (sessionLoading || !sessionMatchesRoute || mode !== "exam" || !audioRef.current) return;
    const audio = audioRef.current;
    audio.pause();
    audio.loop = false;
    audio.playbackRate = 1;
    audio.currentTime = 0;
    allowedExamTimeRef.current = 0;
    setCurrentTime(0);
    setExamPlaybackEnded(false);
  }, [audioUrl, mode, sessionLoading, sessionMatchesRoute]);

  useEffect(() => {
    if (!sessionMatchesRoute || !sessionId) return;
    mountedAtRef.current = Date.now();
    const update = () => {
      const next = derivePracticeElapsed(mode, persistedElapsedSeconds, sessionStartedAt, mountedAtRef.current, Date.now()).elapsedSeconds;
      latestElapsedRef.current = next;
      setElapsedSeconds(next);
    };
    update();
    const interval = window.setInterval(update, 1_000);
    const persistInterval = window.setInterval(() => {
      if (latestElapsedRef.current > persistedElapsedSeconds) {
        void updateSessionElapsed(sessionId, latestElapsedRef.current);
      }
    }, 30_000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(persistInterval);
    };
  }, [mode, persistedElapsedSeconds, sessionId, sessionMatchesRoute, sessionStartedAt, updateSessionElapsed]);

  useEffect(() => {
    if (!sessionMatchesRoute || !sessionId || !module || !audioUrl || mode !== "study") return;
    let active = true;
    const key = playbackSettingKey(sessionId, module.id);
    playbackRestoreCompleteRef.current = false;
    void loadSetting(key).then((stored) => {
      if (!active) return;
      const linkedValue = searchParams.get("tMs");
      const linkedPosition = linkedValue === null ? null : Number(linkedValue);
      const position = linkedPosition !== null && Number.isSafeInteger(linkedPosition) && linkedPosition >= 0
        ? linkedPosition / 1_000
        : stored === null ? 0 : Number(stored);
      const audio = audioRef.current;
      if (audio && Number.isFinite(position) && position >= 0) {
        const maximum = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.max(0, audio.duration - 0.25) : position;
        const restored = Math.min(position, maximum);
        audio.currentTime = restored;
        latestPlaybackPositionRef.current = restored;
        lastPersistedPlaybackRef.current = restored;
        setCurrentTime(restored);
      }
      playbackRestoreCompleteRef.current = true;
    }).catch(() => {
      if (active) playbackRestoreCompleteRef.current = true;
    });
    return () => {
      active = false;
      if (playbackRestoreCompleteRef.current && latestPlaybackPositionRef.current > 0) {
        void saveSetting(key, String(latestPlaybackPositionRef.current));
      }
    };
  }, [audioUrl, loadSetting, mode, module, saveSetting, searchParams, sessionId, sessionMatchesRoute]);

  const persistPlaybackPosition = (position: number, force = false) => {
    if (!session || !module || mode !== "study" || !playbackRestoreCompleteRef.current) return;
    latestPlaybackPositionRef.current = position;
    if (!force && Math.abs(position - lastPersistedPlaybackRef.current) < 3) return;
    lastPersistedPlaybackRef.current = position;
    void saveSetting(playbackSettingKey(session.sessionId, module.id), String(position));
  };

  if (routePack.status === "loading") {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>Loading the linked Listening pack…</span></div></div>;
  }

  if (routePack.status === "error") {
    return <div className="error-banner listening-empty" role="alert">{routePack.error}</div>;
  }

  if (!activePack || !module || !test) {
    return <div className="empty-state listening-empty">No Listening module is available. Install a valid pack with local audio.</div>;
  }

  if (sessionError) {
    return (
      <div className="error-banner listening-empty" role="alert">
        <span>Unable to restore the Listening session: {sessionError}</span>
        <button className="button" onClick={() => setSessionRetryRevision((value) => value + 1)} type="button">Retry</button>
      </div>
    );
  }

  if (sessionLoading || !sessionMatchesRoute || !session) {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>Restoring the Listening session…</span></div></div>;
  }

  return (
    <div className="listening-page">
      <header className="listening-transport">
        <div className="practice-toolbar__identity">
          <Headphones aria-hidden="true" size={19} />
          <div><strong>{module.title}</strong><span>Local audio · {activePack.manifest.title}</span></div>
        </div>
        <SegmentedControl
          disabled={activeListeningExamLock}
          label="Listening mode"
          onChange={(nextMode) => {
            if (nextMode === "exam" && audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
              audioRef.current.playbackRate = 1;
            }
            const nextSearch = new URLSearchParams(searchParams);
            nextSearch.set("mode", nextMode);
            setSearchParams(nextSearch);
          }}
          options={[{ value: "study", label: "Study" }, { value: "exam", label: "Exam" }]}
          value={mode}
        />
        <div className="listening-transport__player">
          <audio
            aria-label="Original local listening audio"
            controls={false}
            onDurationChange={(event) => setDuration(event.currentTarget.duration)}
            onEnded={() => {
              if (mode === "exam") setExamPlaybackEnded(true);
            }}
            onRateChange={(event) => {
              if (mode === "exam" && event.currentTarget.playbackRate !== 1) {
                event.currentTarget.playbackRate = 1;
              }
            }}
            onPause={(event) => persistPlaybackPosition(event.currentTarget.currentTime, true)}
            onSeeking={(event) => {
              if (mode !== "exam") return;
              const audio = event.currentTarget;
              if (Math.abs(audio.currentTime - allowedExamTimeRef.current) > 0.05) {
                audio.currentTime = allowedExamTimeRef.current;
                setCurrentTime(allowedExamTimeRef.current);
              }
            }}
            onTimeUpdate={(event) => {
              const nextTime = event.currentTarget.currentTime;
              if (mode === "exam") {
                allowedExamTimeRef.current = nextTime;
              } else {
                persistPlaybackPosition(nextTime);
              }
              latestPlaybackPositionRef.current = nextTime;
              setCurrentTime(nextTime);
            }}
            preload="metadata"
            ref={audioRef}
            src={audioUrl ?? undefined}
          />
          {mode === "study" && (
            <StudyAudioControls
              audioRef={audioRef}
              available={Boolean(audioUrl)}
              currentTime={currentTime}
              duration={duration}
              waveform={preferences.waveform ? waveform : []}
              showSkipButtons={preferences.skipButtons}
              showWaveform={preferences.waveform}
            />
          )}
          {mode === "exam" && (
            <ExamAudioControls
              audioRef={audioRef}
              available={Boolean(audioUrl)}
              currentTime={currentTime}
              duration={duration}
              ended={examPlaybackEnded}
            />
          )}
        </div>
        <SaveStatus state={saveState} />
        {saveState === "error" && <button className="button" type="button" onClick={() => { void flushPendingSaves().catch(() => undefined); }}>Retry save</button>}
        <span aria-label={`Practice time ${formatPracticeTime(elapsedSeconds)}`} className="practice-timer" role="timer"><Clock3 aria-hidden="true" size={15} />{formatPracticeTime(elapsedSeconds)}</span>
      </header>
      {audioError && <div className="error-banner listening-media-message">Could not read local audio: {audioError}</div>}
      {mediaLoading && <div className="listening-media-message" role="status"><span className="spinner" /> Loading verified audio from your workspace…</div>}
      <div className="listening-body">
        <aside className="listening-sections" aria-label="Listening section navigation">
          <div className="listening-sections__heading"><Volume2 aria-hidden="true" size={16} /> Sections</div>
          {module.sections.map((candidate, index) => (
            <button
              aria-current={index === sectionIndex ? "step" : undefined}
              className={index === sectionIndex ? "is-active" : undefined}
              key={candidate.id}
              onClick={() => {setSectionIndex(index);if(sessionId)void saveSetting(`listening.section.${sessionId}`,candidate.id).catch(()=>setAudioError("Unable to save the selected section."));}}
              type="button"
            >
              <span>{index + 1}</span>
              <div><strong>{candidate.title}</strong><small>{candidate.questionGroups.flatMap((group) => group.questions).length} questions</small></div>
            </button>
          ))}
        </aside>
        {mode === "study" && <div className="listening-transcript-toggle"><button className="button button--ghost" type="button" aria-expanded={transcriptVisible} onClick={() => setTranscriptVisible(value => !value)}>{transcriptVisible ? "Hide transcript" : "Show transcript"}</button></div>}
        <div className={`listening-content${mode === "study" && transcriptVisible ? " has-transcript" : ""}`}>
          <main className="listening-questions">
          <header>
            <div className="listening-questions__heading-row">
              <span className="status-badge">Section {sectionIndex + 1}</span>
              <button
                className="button button--primary"
                disabled={sessionLoading || !session || submitting}
                onClick={async () => {
                  const unanswered = allQuestions.filter((question) => answers[answerKey(session.sessionId, question.id)] === undefined).length;
                  if (!(await confirmAction(`Submit this Listening session? ${unanswered} unanswered and ${questionFlags.size} marked question(s) will enter Review.`))) return;
                  setSubmitting(true);
                  setSubmitError(null);
                  audioRef.current?.pause();
                  try {
                    await flushPendingSaves();
                    await updateSessionElapsed(session.sessionId, elapsedSeconds);
                    await submitSession(session.sessionId);
                    const reviewCandidates = allQuestionEntries.flatMap(({ question, sourceStartMs }) => {
                      const value = answers[answerKey(session.sessionId, question.id)]?.value;
                      const score = scoreQuestion(question, value);
                      const sourceKind = score.status === "incorrect" || score.status === "unanswered"
                        ? "mistake" as const
                        : questionFlags.has(question.id) ? "marked" as const : null;
                      return sourceKind ? [{
                        sourceKind,
                        packId: activePack.manifest.id,
                        testId: test.id,
                        moduleType: "listening" as const,
                        questionId: question.id,
                        sourceSessionId: session.sessionId,
                        ...(preferences.audioMistakeLinks ? { sourceStartMs } : {}),
                      }] : [];
                    });
                    await Promise.all(reviewCandidates.map((candidate) => repository.saveReviewItem(candidate)));
                    navigate("/review");
                  } catch (error) {
                    setSubmitError(error instanceof Error ? error.message : String(error));
                  } finally {
                    setSubmitting(false);
                  }
                }}
                type="button"
              >
                <CheckCircle2 aria-hidden="true" size={15} />
                {submitting ? "Submitting…" : "Submit Listening"}
              </button>
            </div>
            <h1>{section?.title}</h1>
            {section?.contentBlocks.map((block) => <p key={block.id}>{block.text}</p>)}
          </header>
          {submitError && <div className="error-banner" role="alert">Session was saved, but Review preparation could not finish: {submitError}. You can retry safely.</div>}
          {sessionLoading || !session ? (
            <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>Restoring Listening answers…</span></div></div>
          ) : section?.questionGroups.map((group) => <section className="listening-question-group" key={group.id}>
            <h2>{group.title}</h2><p>{group.instructions}</p>
            <QuestionGroupContext blocks={group.contextBlocks ?? []} annotations={[]} questions={group.questions.map((q) => ({id: q.id, displayNumber: q.number, prompt: q.prompt}))} editableQuestionIds={new Set(group.questions.map(q => q.id))} renderAnswerSlot={(q) => {
              const question = group.questions.find(candidate => candidate.id === q.id);
              return question ? <QuestionRenderer question={question} inline instanceId="listening-pane" answer={answers[answerKey(session.sessionId,q.id)]?.value} onAnswer={(id,value) => void answerQuestion(session.sessionId,id,value)} flagged={questionFlags.has(q.id)} onToggleFlag={() => void toggleQuestionFlag(session.sessionId,q.id)} /> : null;
            }} instanceId={`listening-${group.id}`} />
            {group.questions.filter(q => !boundQuestionIdsFromContext(group.contextBlocks ?? []).has(q.id)).map((question) => {
            const value = answers[answerKey(session.sessionId, question.id)]?.value;
            return (
              <QuestionRenderer
                answer={value}
                flagged={questionFlags.has(question.id)}
                instanceId="listening-pane"
                key={question.id}
                onAnswer={(questionId, answer) => void answerQuestion(session.sessionId, questionId, answer)}
                onToggleFlag={() => void toggleQuestionFlag(session.sessionId, question.id)}
                question={question}
              />
            );
          })}</section>)}
          </main>
          {mode === "study" && transcriptVisible && (
            <aside className="listening-transcript" aria-label="Verified transcript">
              <header>
                <div><FileText aria-hidden="true" size={17} /><div><strong>Transcript</strong><span>{transcriptCues.length ? `${transcriptCues.length} timed cue${transcriptCues.length === 1 ? "" : "s"}` : section?.transcriptText ? "Source text · manual position" : "Not available in this pack"}</span></div></div>
                <button aria-pressed={clozeMode} className="button button--icon" disabled={!preferences.cloze || !transcriptCues.some((cue) => cue.clozeAnswers.length > 0)} onClick={() => { setClozeMode((value) => !value); setRevealedCloze(new Set()); }} title="Toggle cloze practice" type="button">
                  {clozeMode ? <Eye aria-hidden="true" size={15} /> : <EyeOff aria-hidden="true" size={15} />}
                  <span className="sr-only">{clozeMode ? "Show transcript" : "Start cloze practice"}</span>
                </button>
              </header>
              {section?.transcriptText && transcriptCues.length === 0 ? <div className="listening-transcript__plain">{section.transcriptText}</div> : transcriptCues.length === 0 ? (
                <div className="listening-transcript__empty"><Lock aria-hidden="true" size={20} /><p>No verified transcript was supplied by this local pack. Luma will not synthesize or scrape one.</p></div>
              ) : (
                <div className="listening-transcript__cues">{transcriptCues.map((cue) => {
                  const active = currentTime * 1_000 >= cue.startMs && (cue.endMs === undefined || currentTime * 1_000 < cue.endMs);
                  return <article className={active ? "is-active" : undefined} key={cue.id}>
                    <button className="listening-transcript__time" onClick={() => {
                      if (!audioRef.current) return;
                      audioRef.current.currentTime = cue.startMs / 1_000;
                      setCurrentTime(cue.startMs / 1_000);
                    }} type="button">{timeLabel(cue.startMs / 1_000)}</button>
                    <p>{cue.speaker && <strong>{cue.speaker} </strong>}{clozeMode ? clozeCue(cue, revealedCloze, (key) => setRevealedCloze((current) => {
                      const next = new Set(current);
                      if (next.has(key)) next.delete(key); else next.add(key);
                      return next;
                    })) : cue.text}</p>
                  </article>;
                })}</div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
