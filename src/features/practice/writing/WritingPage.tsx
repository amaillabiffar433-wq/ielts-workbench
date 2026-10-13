import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, FileClock, Image as ImageIcon, PenLine, Save } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { MediaAsset, WritingModule } from "../../../domain";
import type { SaveWritingDraftInput, WritingVersion } from "../../../infrastructure/repositories/LearningRepository";
import { SaveStatus, type SaveState } from "../../../components/common/SaveStatus";
import { SegmentedControl } from "../../../components/common/SegmentedControl";
import { useWorkbenchStore } from "../../../stores/workbenchStore";
import {
  closeCurrentWindow,
  confirmAction,
  confirmDiscardAfterSaveFailure,
  listenForCloseRequested,
} from "../../../infrastructure/window/windowClose";
import { usePracticeRoutePack } from "../usePracticeRoutePack";
import { countWords, scheduleDraftAutosave } from "./draftAutosave";
import { handleWritingCloseRequest } from "./writingClose";
import "./WritingPage.css";

type WritingMode = "study" | "exam";

type DraftSnapshot = SaveWritingDraftInput & {
  readonly revision: number;
};

type PendingDraftSave = {
  readonly snapshot: DraftSnapshot;
  readonly cancel: () => void;
};

export function WritingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: WritingMode = searchParams.get("mode") === "exam" ? "exam" : "study";
  const routePack = usePracticeRoutePack();
  const activePack = routePack.pack;
  const test = routePack.test;
  const session = useWorkbenchStore((state) => state.session);
  const repository = useWorkbenchStore((state) => state.repository);
  const ensureSession = useWorkbenchStore((state) => state.ensureSession);
  const submitSession = useWorkbenchStore((state) => state.submitSession);
  const updateSessionElapsed = useWorkbenchStore((state) => state.updateSessionElapsed);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const lastTimerSession = useRef<string | undefined>(undefined);
  const readPackMedia = useWorkbenchStore((state) => state.readPackMedia);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [versions, setVersions] = useState<WritingVersion[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionRetryRevision, setSessionRetryRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const revisionRef = useRef(0);
  const mountedRef = useRef(true);
  const pendingDraftRef = useRef<PendingDraftSave | null>(null);
  const failedDraftRef = useRef<DraftSnapshot | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastWriteRef = useRef<Promise<void>>(Promise.resolve());
  const allowCloseRef = useRef(false);
  const activeDraftRef = useRef<{ sessionId: string | null; taskId: string | null }>({ sessionId: null, taskId: null });

  const module = useMemo(
    () => activePack?.modules.find(
      (candidate): candidate is WritingModule => candidate.type === "writing" && candidate.testId === test?.id,
    ) ?? null,
    [activePack, test],
  );
  const tasks = useMemo(() => module?.sections.flatMap((section) => section.tasks) ?? [], [module]);
  const task = tasks.find((candidate) => candidate.id === taskId) ?? tasks[0];
  const wordCount = countWords(content);
  const imageAsset = activePack?.manifest.mediaAssets.find(
    (asset): asset is Extract<MediaAsset, { readonly type: "image" }> =>
      asset.type === "image" && asset.id === task?.imageAssetId,
  );
  const sessionMatchesRoute = Boolean(
    session
    && activePack
    && test
    && session.packId === activePack.manifest.id
    && session.testId === test.id
    && session.moduleType === "writing"
    && session.mode === mode,
  );

  const writingSessionId = sessionMatchesRoute ? session?.sessionId : undefined;
  const writingSessionStatus = session?.status;
  const persistedSeconds = session?.elapsedSeconds ?? 0;
  useEffect(() => {
    if(lastTimerSession.current===writingSessionId)return;
    lastTimerSession.current=writingSessionId;
    elapsedRef.current = persistedSeconds;
    setElapsed(elapsedRef.current);
    setTimerRunning(false);
  }, [writingSessionId,persistedSeconds]);
  useEffect(() => { elapsedRef.current=Math.max(elapsedRef.current,persistedSeconds); }, [persistedSeconds]);
  useEffect(() => {
    if (!writingSessionId || !timerRunning || writingSessionStatus !== "in-progress") return;
    let previous=Date.now();let ticks=0;
    const persist=()=>updateSessionElapsed(writingSessionId,elapsedRef.current).catch(()=>setError("Timer could not be saved. Retry by pausing and restarting the timer."));
    const timer=window.setInterval(()=>{const now=Date.now();const delta=Math.floor((now-previous)/1000);previous=now;if(delta>0&&delta<=3){elapsedRef.current+=delta;setElapsed(elapsedRef.current);if(++ticks%5===0)void persist();}},1000);
    return ()=>{window.clearInterval(timer);void persist();};
  }, [writingSessionId,writingSessionStatus,timerRunning,updateSessionElapsed]);

  const persistDraftSnapshot = useCallback((snapshot: DraftSnapshot): Promise<void> => {
    const operation = writeQueueRef.current.then(async () => {
      await repository.saveWritingDraft({
        sessionId: snapshot.sessionId,
        taskId: snapshot.taskId,
        content: snapshot.content,
      });
    });
    writeQueueRef.current = operation.catch(() => undefined);
    lastWriteRef.current = operation;
    return operation;
  }, [repository]);

  const saveDraftSnapshot = useCallback(async (snapshot: DraftSnapshot): Promise<void> => {
    try {
      await persistDraftSnapshot(snapshot);
      const activeDraft = activeDraftRef.current;
      if (
        mountedRef.current
        && activeDraft.sessionId === snapshot.sessionId
        && activeDraft.taskId === snapshot.taskId
        && revisionRef.current === snapshot.revision
      ) {
        if (failedDraftRef.current === snapshot) failedDraftRef.current = null;
        setSaveState("saved");
      }
    } catch (reason) {
      failedDraftRef.current = snapshot;
      if (mountedRef.current) {
        const activeDraft = activeDraftRef.current;
        if (activeDraft.sessionId === snapshot.sessionId && activeDraft.taskId === snapshot.taskId) {
          setSaveState("error");
        }
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      throw reason;
    }
  }, [persistDraftSnapshot]);

  const flushPendingDraft = useCallback(async (): Promise<void> => {
    const pending = pendingDraftRef.current;
    const snapshot = pending?.snapshot ?? failedDraftRef.current;
    if (snapshot) {
      pending?.cancel();
      pendingDraftRef.current = null;
      failedDraftRef.current = null;
      await saveDraftSnapshot(snapshot);
      return;
    }
    await lastWriteRef.current;
  }, [saveDraftSnapshot]);

  useEffect(() => {
    let active = true;
    let unlisten: () => void = () => undefined;
    void listenForCloseRequested((event) => {
      if (allowCloseRef.current) return;
      void handleWritingCloseRequest(event, {
        flushDraft: flushPendingDraft,
        closeWindow: async () => {
          allowCloseRef.current = true;
          try {
            await closeCurrentWindow();
          } catch (reason) {
            allowCloseRef.current = false;
            throw reason;
          }
        },
        confirmDiscard: confirmDiscardAfterSaveFailure,
        onSaveError: (reason) => {
          setSaveState("error");
          setError(reason instanceof Error ? reason.message : String(reason));
        },
      }).catch((reason: unknown) => {
        if (!active) return;
        setSaveState("error");
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    }).then((stopListening) => {
      if (active) unlisten = stopListening;
      else stopListening();
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => {
      active = false;
      unlisten();
    };
  }, [flushPendingDraft]);

  const queueDraftSave = (nextContent: string) => {
    if (!session || !task || !sessionMatchesRoute) return;
    pendingDraftRef.current?.cancel();
    failedDraftRef.current = null;
    const snapshot: DraftSnapshot = {
      sessionId: session.sessionId,
      taskId: task.id,
      content: nextContent,
      revision: revisionRef.current + 1,
    };
    revisionRef.current = snapshot.revision;
    setSaveState("saving");
    setError(null);
    const controller = scheduleDraftAutosave(() => {
      if (pendingDraftRef.current?.snapshot === snapshot) {
        pendingDraftRef.current = null;
      }
      void saveDraftSnapshot(snapshot).catch(() => undefined);
    });
    pendingDraftRef.current = { snapshot, cancel: controller.cancel };
  };

  useEffect(() => {
    activeDraftRef.current = {
      sessionId: session?.sessionId ?? null,
      taskId: task?.id ?? null,
    };
  }, [session?.sessionId, task?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const sessionId = session?.sessionId;
    const currentTaskId = task?.id;
    return () => {
      const pending = pendingDraftRef.current;
      const snapshot = pending?.snapshot ?? failedDraftRef.current;
      if (!snapshot || snapshot.sessionId !== sessionId || snapshot.taskId !== currentTaskId) return;
      pending?.cancel();
      pendingDraftRef.current = null;
      failedDraftRef.current = null;
      void saveDraftSnapshot(snapshot).catch(() => undefined);
    };
  }, [saveDraftSnapshot, session?.sessionId, task?.id]);

  useEffect(() => {
    if (!activePack || !module || !test) return;
    let active = true;
    setSessionLoading(true);
    setSessionError(null);
    void ensureSession({
      packId: activePack.manifest.id,
      testId: test.id,
      moduleType: "writing",
      mode,
    }).catch((reason: unknown) => {
      if (active) setSessionError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, [activePack, ensureSession, mode, module, sessionRetryRevision, test]);

  useEffect(() => {
    if (!session || !task || !sessionMatchesRoute) return;
    let active = true;
    const loadRevision = revisionRef.current + 1;
    revisionRef.current = loadRevision;
    setSaveState("idle");
    setError(null);
    void Promise.all([
      repository.loadWritingDraft(session.sessionId, task.id),
      repository.listWritingVersions(session.sessionId, task.id),
    ]).then(([draft, savedVersions]) => {
      if (!active || revisionRef.current !== loadRevision) return;
      setContent(draft?.content ?? "");
      setVersions(savedVersions);
      setSaveState(draft ? "saved" : "idle");
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { active = false; };
  }, [repository, session, sessionMatchesRoute, task]);

  useEffect(() => {
    if (!activePack || !imageAsset) {
      setImageUrl(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    void readPackMedia(activePack.manifest.id, imageAsset.relativePath).then((bytes) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: imageAsset.mimeType }));
      setImageUrl(objectUrl);
    }).catch(() => setImageUrl(null));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activePack, imageAsset, readPackMedia]);

  const createVersion = async (reason: "manual" | "submitted") => {
    if (!session || !task) return;
    setSaveState("saving");
    try {
      await flushPendingDraft();
      const snapshot: DraftSnapshot = {
        sessionId: session.sessionId,
        taskId: task.id,
        content,
        revision: revisionRef.current,
      };
      await saveDraftSnapshot(snapshot);
      const version = await repository.createWritingVersion({ sessionId: session.sessionId, taskId: task.id, content, reason });
      await updateSessionElapsed(session.sessionId,elapsedRef.current);
      setVersions((current) => [version, ...current.filter((candidate) => candidate.id !== version.id)]);
      if (reason === "submitted") {
        await submitSession(session.sessionId);
        navigate("/review");
      }
      setSaveState("saved");
    } catch (reasonValue) {
      setSaveState("error");
      setError(reasonValue instanceof Error ? reasonValue.message : String(reasonValue));
    }
  };

  if (routePack.status === "loading") {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>正在读取链接指定的 Writing 题包…</span></div></div>;
  }

  if (routePack.status === "error") {
    return <div className="error-banner writing-empty" role="alert">{routePack.error}</div>;
  }

  if (!activePack || !module || !task || !test) {
    return <div className="empty-state writing-empty">没有可用的 Writing 模块。请先安装包含原创写作任务的题包。</div>;
  }

  if (sessionError) {
    return (
      <div className="error-banner writing-empty" role="alert">
        <span>无法恢复写作 Session：{sessionError}</span>
        <button className="button" onClick={() => setSessionRetryRevision((value) => value + 1)} type="button">重试</button>
      </div>
    );
  }

  if (sessionLoading || !sessionMatchesRoute || !session) {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>正在恢复未完成草稿…</span></div></div>;
  }

  return (
    <div className="writing-page">
      <header className="writing-toolbar">
        <div className="practice-toolbar__identity">
          <PenLine aria-hidden="true" size={19} />
          <div><strong>{module.title}</strong><span>纯文本编辑器 · 本地自动保存</span></div>
        </div>
        <SegmentedControl
          label="写作模式"
          onChange={(nextMode) => {
            if (nextMode === mode) return;
            void flushPendingDraft()
              .then(() => {
                const nextSearch = new URLSearchParams(searchParams);
                nextSearch.set("mode", nextMode);
                setSearchParams(nextSearch);
              })
              .catch(() => undefined);
          }}
          options={[{ value: "study", label: "Study" }, { value: "exam", label: "Exam" }]}
          value={mode}
        />
        <nav aria-label="写作任务" className="writing-task-tabs">
          {tasks.map((candidate) => (
            <button
              aria-current={candidate.id === task.id ? "page" : undefined}
              className={candidate.id === task.id ? "is-active" : undefined}
              key={candidate.id}
              onClick={() => {
                if (candidate.id === task.id) return;
                void flushPendingDraft()
                  .then(() => setTaskId(candidate.id))
                  .catch(() => undefined);
              }}
              type="button"
            >
              {candidate.type === "task-1" ? "Task 1" : "Task 2"}
            </button>
          ))}
        </nav>
        <div className="practice-toolbar__spacer" />
        <output aria-label="Writing elapsed">{Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,"0")}</output>
        <button className="button" type="button" disabled={session?.status !== "in-progress"} onClick={()=>setTimerRunning(value=>!value)}>{timerRunning?"Pause timer":"Start timer"}</button>
        <SaveStatus state={saveState} />
        <button className="button" disabled={saveState === "saving"} onClick={() => void createVersion("manual")} type="button"><Save aria-hidden="true" size={15} /> 保存版本</button>
        <button
          className="button button--primary"
          disabled={saveState === "saving"}
          onClick={async () => {
            if (await confirmAction("提交会创建一个不可变快照，仍保留当前草稿。确认提交？")) void createVersion("submitted");
          }}
          type="button"
        ><CheckCircle2 aria-hidden="true" size={15} /> 提交快照</button>
      </header>
      {error && <div className="error-banner writing-error">{error}</div>}
      <div className="writing-workspace">
        <section className="writing-prompt" aria-labelledby="writing-task-title">
          <div className="writing-prompt__meta">
            <span className="status-badge">{task.type === "task-1" ? "Task 1" : "Task 2"}</span>
            <span><Clock3 aria-hidden="true" size={13} /> 建议 {task.suggestedMinutes ?? (task.type === "task-1" ? 20 : 40)} 分钟</span>
          </div>
          <h1 id="writing-task-title">{task.title}</h1>
          <p>{task.prompt}</p>
          {imageAsset ? (
            <figure className="writing-prompt__image">
              {imageUrl ? <img alt={imageAsset.alt} src={imageUrl} /> : <div className="image-placeholder"><ImageIcon aria-hidden="true" size={22} /> 正在读取本地图像…</div>}
              <figcaption>{imageAsset.alt}</figcaption>
            </figure>
          ) : (
            <div className="writing-prompt__note">{activePack?.manifest.sourceLabel} Writing is self-assessed; reference essays are not a single correct answer.</div>
          )}
          <div className="writing-version-list">
            <h2><FileClock aria-hidden="true" size={16} /> 版本历史</h2>
            {versions.length === 0 ? <p>尚无手动或提交版本。自动保存只更新当前草稿。</p> : (
              <ol>{versions.map((version) => <li key={version.id}><strong>{version.reason === "submitted" ? "提交快照" : "手动版本"}</strong><span>{new Date(version.createdAt).toLocaleString()} · {version.wordCount} 词</span></li>)}</ol>
            )}
          </div>
        </section>
        <section className="writing-editor" aria-label="作文编辑器">
          <header>
            <div><strong>你的作文</strong><span>AI 不会自动修改这里的文本</span></div>
            <div className={wordCount >= task.minimumWords ? "word-count word-count--met" : "word-count"} aria-live="polite">
              {wordCount} / {task.minimumWords} 词
            </div>
          </header>
          <label className="sr-only" htmlFor="writing-draft">作文正文</label>
          <textarea
            autoCapitalize="sentences"
            autoCorrect="off"
            id="writing-draft"
            onChange={(event) => {
              const nextContent = event.target.value;
              setContent(nextContent);
              queueDraftSave(nextContent);
            }}
            placeholder="Start writing here…"
            spellCheck={false}
            value={content}
          />
          <footer><SaveStatus detail={saveState === "saving" ? "停止输入 1 秒后保存" : undefined} state={saveState} /><span>草稿位于所选工作区的 SQLite，不写入题包。</span></footer>
        </section>
      </div>
    </div>
  );
}
