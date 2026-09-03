import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { CheckCircle2, Headphones, Lock, Pause, Play, Volume2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ListeningModule, Question } from "../../../domain";
import { QuestionRenderer } from "../../../components/QuestionRenderer/QuestionRenderer";
import { SaveStatus } from "../../../components/common/SaveStatus";
import { SegmentedControl } from "../../../components/common/SegmentedControl";
import { answerKey, useWorkbenchStore } from "../../../stores/workbenchStore";
import { usePracticeRoutePack } from "../usePracticeRoutePack";
import "./ListeningPage.css";

type ListeningMode = "study" | "exam";

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
    <div className="exam-audio" aria-label="考试模式音频控制">
      <button
        aria-label={ended ? "音频已播放完毕" : playing ? "暂停音频" : "播放音频"}
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
        {ended ? "已结束" : playing ? "暂停" : "播放"}
      </button>
      <div aria-label={`播放进度 ${timeLabel(currentTime)} / ${timeLabel(duration)}`} className="exam-audio__progress" role="progressbar" aria-valuemax={duration || 1} aria-valuemin={0} aria-valuenow={currentTime}>
        <span style={{ width: `${duration ? Math.min(100, currentTime / duration * 100) : 0}%` }} />
      </div>
      <span className="exam-audio__time">{timeLabel(currentTime)} / {timeLabel(duration)}</span>
      <span aria-live="polite" className="status-badge" role="status">
        <Lock aria-hidden="true" size={12} />
        {ended ? "播放已结束 · 禁止重播" : "仅可顺序播放 · 禁止拖动、倍速与重播"}
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
  const [examPlaybackEnded, setExamPlaybackEnded] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionRetryRevision, setSessionRetryRevision] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const allowedExamTimeRef = useRef(0);
  const routePack = usePracticeRoutePack();
  const activePack = routePack.pack;
  const test = routePack.test;
  const session = useWorkbenchStore((state) => state.session);
  const answers = useWorkbenchStore((state) => state.answers);
  const saveState = useWorkbenchStore((state) => state.saveState);
  const ensureSession = useWorkbenchStore((state) => state.ensureSession);
  const submitSession = useWorkbenchStore((state) => state.submitSession);
  const answerQuestion = useWorkbenchStore((state) => state.answerQuestion);
  const readPackMedia = useWorkbenchStore((state) => state.readPackMedia);
  const activeListeningExamLock = session?.moduleType === "listening"
    && session.mode === "exam"
    && session.status === "in-progress";
  const mode: ListeningMode = activeListeningExamLock ? "exam" : requestedMode;

  const module = useMemo(
    () => activePack?.modules.find(
      (candidate): candidate is ListeningModule => candidate.type === "listening" && candidate.testId === test?.id,
    ) ?? null,
    [activePack, test],
  );
  const media = activePack?.manifest.mediaAssets.find((asset) => asset.id === module?.audioAssetId && asset.type === "audio");
  const section = module?.sections[sectionIndex] ?? module?.sections[0];
  const questions: readonly Question[] = section?.questionGroups.flatMap((group) => group.questions) ?? [];
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
    if (!activePack || !media) return;
    let active = true;
    let objectUrl: string | null = null;
    setMediaLoading(true);
    setAudioError(null);
    void readPackMedia(activePack.manifest.id, media.relativePath)
      .then((bytes) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: media.mimeType }));
        setAudioUrl(objectUrl);
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

  if (routePack.status === "loading") {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>正在读取链接指定的 Listening 题包…</span></div></div>;
  }

  if (routePack.status === "error") {
    return <div className="error-banner listening-empty" role="alert">{routePack.error}</div>;
  }

  if (!activePack || !module || !test) {
    return <div className="empty-state listening-empty">没有可用的 Listening 模块。请先安装包含本地音频的有效题包。</div>;
  }

  if (sessionError) {
    return (
      <div className="error-banner listening-empty" role="alert">
        <span>无法恢复听力 Session：{sessionError}</span>
        <button className="button" onClick={() => setSessionRetryRevision((value) => value + 1)} type="button">重试</button>
      </div>
    );
  }

  if (sessionLoading || !sessionMatchesRoute || !session) {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>正在恢复听力 Session…</span></div></div>;
  }

  return (
    <div className="listening-page">
      <header className="listening-transport">
        <div className="practice-toolbar__identity">
          <Headphones aria-hidden="true" size={19} />
          <div><strong>{module.title}</strong><span>本地音频 · {activePack.manifest.title}</span></div>
        </div>
        <SegmentedControl
          disabled={activeListeningExamLock}
          label="听力练习模式"
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
            aria-label="原创示例听力音频"
            controls={mode === "study"}
            onDurationChange={(event) => setDuration(event.currentTarget.duration)}
            onEnded={() => {
              if (mode === "exam") setExamPlaybackEnded(true);
            }}
            onRateChange={(event) => {
              if (mode === "exam" && event.currentTarget.playbackRate !== 1) {
                event.currentTarget.playbackRate = 1;
              }
            }}
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
              }
              setCurrentTime(nextTime);
            }}
            preload="metadata"
            ref={audioRef}
            src={audioUrl ?? undefined}
          />
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
      </header>
      {audioError && <div className="error-banner listening-media-message">音频读取失败：{audioError}</div>}
      {mediaLoading && <div className="listening-media-message" role="status"><span className="spinner" /> 正在从工作区安全读取本地音频…</div>}
      <div className="listening-body">
        <aside className="listening-sections" aria-label="听力 Section 导航">
          <div className="listening-sections__heading"><Volume2 aria-hidden="true" size={16} /> Sections</div>
          {module.sections.map((candidate, index) => (
            <button
              aria-current={index === sectionIndex ? "step" : undefined}
              className={index === sectionIndex ? "is-active" : undefined}
              key={candidate.id}
              onClick={() => setSectionIndex(index)}
              type="button"
            >
              <span>{index + 1}</span>
              <div><strong>{candidate.title}</strong><small>{candidate.questionGroups.flatMap((group) => group.questions).length} 题</small></div>
            </button>
          ))}
          {mode === "study" && (
            <div className="listening-transcript-note">
              <strong>Transcript</strong>
              <p>时间锚点接口已预留；原创 demo 不内置 transcript。</p>
            </div>
          )}
        </aside>
        <main className="listening-questions">
          <header>
            <div className="listening-questions__heading-row">
              <span className="status-badge">Section {sectionIndex + 1}</span>
              <button
                className="button button--primary"
                disabled={sessionLoading || !session || submitting}
                onClick={async () => {
                  if (!session || !window.confirm("提交后进入复盘页面？本轮答案已自动保存。")) return;
                  setSubmitting(true);
                  audioRef.current?.pause();
                  try {
                    await submitSession(session.sessionId);
                    navigate("/review");
                  } catch {
                    // The store exposes the persistence error through the global error banner.
                  } finally {
                    setSubmitting(false);
                  }
                }}
                type="button"
              >
                <CheckCircle2 aria-hidden="true" size={15} />
                {submitting ? "提交中…" : "提交本次听力"}
              </button>
            </div>
            <h1>{section?.title}</h1>
            {section?.contentBlocks.map((block) => <p key={block.id}>{block.text}</p>)}
          </header>
          {sessionLoading || !session ? (
            <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>正在恢复听力答案…</span></div></div>
          ) : questions.map((question) => {
            const value = answers[answerKey(session.sessionId, question.id)]?.value;
            return (
              <QuestionRenderer
                answer={typeof value === "string" ? value : value?.join(", ")}
                instanceId="listening-pane"
                key={question.id}
                onAnswer={(questionId, answer) => void answerQuestion(session.sessionId, questionId, answer)}
                question={question}
              />
            );
          })}
        </main>
      </div>
    </div>
  );
}
