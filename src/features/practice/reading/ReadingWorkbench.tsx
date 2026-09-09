import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, Columns2, Flag, ListChecks } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { questionContainerId } from "../../../components/QuestionRenderer/questionDomIds";
import { SplitWorkspace, type SplitLayout } from "../../../components/SplitWorkspace/SplitWorkspace";
import { SaveStatus } from "../../../components/common/SaveStatus";
import { SegmentedControl } from "../../../components/common/SegmentedControl";
import type { ReadingModule } from "../../../domain";
import type { SessionSnapshot } from "../../../infrastructure/repositories/LearningRepository";
import { answerKey, useWorkbenchStore } from "../../../stores/workbenchStore";
import { usePracticeRoutePack } from "../usePracticeRoutePack";
import { derivePracticeElapsed, formatPracticeTime } from "../practiceTimer";
import { ReadingPane } from "./ReadingPane";
import {
  paneInstanceId,
  paneShowsQuestions,
  type PaneSide,
} from "./readingPaneIdentity";
import { buildReadingQuestionEntries, type ReadingQuestionEntry } from "./readingModel";
import {
  createDefaultReadingViewState,
  parseReadingViewState,
  readingViewStateSettingKey,
  type ReadingPaneState,
  type ReadingViewState,
} from "./readingViewState";
import "./ReadingPage.css";

type PracticeMode = "study" | "exam";

type QuestionNavigationTarget = {
  readonly side: PaneSide;
  readonly questionId: string;
};

function usePracticeTimer(
  mode: PracticeMode,
  session: SessionSnapshot | null,
  persistElapsed: (sessionId: string, elapsedSeconds: number) => Promise<void>,
): { readonly label: string; readonly elapsedSeconds: number; readonly warning: string | null } {
  const [result, setResult] = useState({ elapsedSeconds: session?.elapsedSeconds ?? 0, warning: null as string | null });
  const latestElapsed = useRef(result.elapsedSeconds);
  const sessionId = session?.sessionId;
  const sessionStatus = session?.status;
  const sessionStartedAt = session?.startedAt;
  const persistedSeconds = session?.elapsedSeconds ?? 0;
  useEffect(() => {
    if (!sessionId || sessionStatus !== "in-progress") return;
    const mountedAt = Date.now();
    const tick = () => {
      const next = derivePracticeElapsed(mode, persistedSeconds, sessionStartedAt, mountedAt, Date.now());
      latestElapsed.current = next.elapsedSeconds;
      setResult(next);
    };
    tick();
    const tickTimer = window.setInterval(tick, 1_000);
    const persist = () => {
      void persistElapsed(sessionId, latestElapsed.current).catch(() => {
        // The store exposes the persistence failure through its visible error state.
      });
    };
    const persistTimer = window.setInterval(persist, 10_000);
    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") persist();
    };
    document.addEventListener("visibilitychange", persistWhenHidden);
    return () => {
      window.clearInterval(tickTimer);
      window.clearInterval(persistTimer);
      document.removeEventListener("visibilitychange", persistWhenHidden);
      persist();
    };
  }, [mode, persistElapsed, persistedSeconds, sessionId, sessionStartedAt, sessionStatus]);
  return {
    ...result,
    label: mode === "exam" ? formatPracticeTime(Math.max(0, 60 * 60 - result.elapsedSeconds)) : formatPracticeTime(result.elapsedSeconds),
  };
}

export function ReadingWorkbench() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: PracticeMode = searchParams.get("mode") === "exam" ? "exam" : "study";
  const [layout, setLayout] = useState<SplitLayout>({ left: 52, right: 48 });
  const [viewState, setViewState] = useState<ReadingViewState | null>(null);
  const [hydratedSessionId, setHydratedSessionId] = useState<string | null>(null);
  const [viewStateNotice, setViewStateNotice] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionRetryRevision, setSessionRetryRevision] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [questionNavigationTarget, setQuestionNavigationTarget] = useState<QuestionNavigationTarget | null>(null);
  const routePack = usePracticeRoutePack();
  const activePack = routePack.pack;
  const test = routePack.test;
  const session = useWorkbenchStore((state) => state.session);
  const answers = useWorkbenchStore((state) => state.answers);
  const saveState = useWorkbenchStore((state) => state.saveState);
  const ensureSession = useWorkbenchStore((state) => state.ensureSession);
  const submitSession = useWorkbenchStore((state) => state.submitSession);
  const loadSetting = useWorkbenchStore((state) => state.loadSetting);
  const saveSetting = useWorkbenchStore((state) => state.saveSetting);
  const updateSessionElapsed = useWorkbenchStore((state) => state.updateSessionElapsed);
  const questionFlags = useWorkbenchStore((state) => state.questionFlags);
  const toggleQuestionFlag = useWorkbenchStore((state) => state.toggleQuestionFlag);
  const flushPendingSaves = useWorkbenchStore((state) => state.flushPendingSaves);
  const timer = usePracticeTimer(mode, session, updateSessionElapsed);

  const module = useMemo(
    () => activePack?.modules.find(
      (candidate): candidate is ReadingModule => candidate.type === "reading" && candidate.testId === test?.id,
    ) ?? null,
    [activePack, test],
  );
  const questionEntries = useMemo(() => module ? buildReadingQuestionEntries(module) : [], [module]);
  const sessionMatchesRoute = Boolean(
    session
    && activePack
    && test
    && session.packId === activePack.manifest.id
    && session.testId === test.id
    && session.moduleType === "reading"
    && session.mode === mode,
  );
  const answeredCount = useMemo(() => {
    if (!session) return 0;
    return questionEntries.filter((entry) => {
      const value = answers[answerKey(session.sessionId, entry.question.id)]?.value;
      return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;
    }).length;
  }, [answers, questionEntries, session]);

  useEffect(() => {
    let active = true;
    void loadSetting("reading.splitLayout").then((value) => {
      if (!active || !value) return;
      try {
        const parsed = JSON.parse(value) as SplitLayout;
        if (parsed.left >= 28 && parsed.right >= 28) setLayout(parsed);
      } catch {
        // Keep the documented default for corrupted view-only settings.
      }
    });
    return () => { active = false; };
  }, [loadSetting]);

  useEffect(() => {
    if (!activePack || !module || !test) return;
    let active = true;
    setSessionLoading(true);
    setSessionError(null);
    void ensureSession({
      packId: activePack.manifest.id,
      testId: test.id,
      moduleType: "reading",
      mode,
    }).catch((error: unknown) => {
      if (active) setSessionError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (active) setSessionLoading(false);
    });
    return () => { active = false; };
  }, [activePack, ensureSession, mode, module, sessionRetryRevision, test]);

  useEffect(() => {
    if (!module || !session || !sessionMatchesRoute) return;
    let active = true;
    const sessionId = session.sessionId;
    setHydratedSessionId(null);
    setViewState(null);
    setViewStateNotice(null);
    void loadSetting(readingViewStateSettingKey(sessionId)).then((value) => {
      if (!active) return;
      const restored = parseReadingViewState(value, module);
      setViewState(restored.state);
      setHydratedSessionId(sessionId);
      if (restored.recovered) {
        setViewStateNotice("上次的 Pane 选择引用了已变更内容，已安全回退到有效范围。");
      }
    }).catch((error: unknown) => {
      if (!active) return;
      setViewState(createDefaultReadingViewState(module));
      setHydratedSessionId(sessionId);
      setViewStateNotice(`无法恢复 Pane 选择，已使用默认视图：${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; };
  }, [loadSetting, module, session, sessionMatchesRoute]);

  useEffect(() => {
    if (!session || !viewState || hydratedSessionId !== session.sessionId) return;
    const timerId = window.setTimeout(() => {
      void saveSetting(
        readingViewStateSettingKey(session.sessionId),
        JSON.stringify(viewState),
      ).catch(() => {
        // The repository/store error banner remains the single persistence error source.
      });
    }, 250);
    return () => window.clearTimeout(timerId);
  }, [hydratedSessionId, saveSetting, session, viewState]);

  useEffect(() => {
    if (!questionNavigationTarget) return;
    const target = document.getElementById(
      questionContainerId(
        paneInstanceId(questionNavigationTarget.side),
        questionNavigationTarget.questionId,
      ),
    );
    const scrollContainer = document.querySelector<HTMLElement>(
      `[data-pane-scroll="${questionNavigationTarget.side}"]`,
    );
    if (!target || !scrollContainer) return;
    const targetRect = target.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetTop = Math.max(
      0,
      scrollContainer.scrollTop + targetRect.top - containerRect.top
        - (scrollContainer.clientHeight - targetRect.height) / 2,
    );
    if (typeof scrollContainer.scrollTo === "function") {
      scrollContainer.scrollTo({ top: targetTop, behavior: "smooth" });
    } else {
      scrollContainer.scrollTop = targetTop;
    }
    target.focus({ preventScroll: true });
    setQuestionNavigationTarget(null);
  }, [questionNavigationTarget, viewState]);

  const updatePane = useCallback((side: PaneSide, next: ReadingPaneState) => {
    setViewState((current) => current ? { ...current, [side]: next } : current);
  }, []);

  const updateScrollPosition = useCallback((side: PaneSide, contentKey: string, scrollTop: number) => {
    setViewState((current) => {
      if (!current) return current;
      const pane = current[side];
      if (pane.scrollPositions[contentKey] === scrollTop) return current;
      return {
        ...current,
        [side]: {
          ...pane,
          scrollPositions: { ...pane.scrollPositions, [contentKey]: scrollTop },
        },
      };
    });
  }, []);

  const navigateToQuestion = (entry: ReadingQuestionEntry) => {
    if (!viewState) return;
    const side: PaneSide = paneShowsQuestions(viewState.right.view)
      ? "right"
      : paneShowsQuestions(viewState.left.view)
        ? "left"
        : "right";
    const pane = viewState[side];
    updatePane(side, {
      ...pane,
      view: "questions",
      questionScope: "single",
      singleNumber: entry.displayNumber,
    });
    setQuestionNavigationTarget({ side, questionId: entry.question.id });
  };

  if (routePack.status === "loading") {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>正在读取链接指定的 Reading 题包…</span></div></div>;
  }
  if (routePack.status === "error") {
    return <div className="error-banner reading-empty" role="alert">{routePack.error}</div>;
  }
  if (!activePack || !module || !test) {
    return <div className="empty-state reading-empty">没有可用的 Reading 模块。请先在题库或导入中心安装有效题包。</div>;
  }
  if (sessionError) {
    return (
      <div className="error-banner reading-empty" role="alert">
        <span>无法恢复阅读 Session：{sessionError}</span>
        <button className="button" onClick={() => setSessionRetryRevision((value) => value + 1)} type="button">重试</button>
      </div>
    );
  }
  if (sessionLoading || !sessionMatchesRoute || !session) {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>正在恢复阅读 Session…</span></div></div>;
  }
  if (!viewState || hydratedSessionId !== session.sessionId) {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>正在恢复 Reading Pane 选择…</span></div></div>;
  }

  return (
    <div className="reading-workbench">
      <header className="practice-toolbar">
        <div className="practice-toolbar__identity">
          <Columns2 aria-hidden="true" size={19} />
          <div><strong>{module.title}</strong><span>{activePack.manifest.title}</span></div>
        </div>
        <SegmentedControl
          label="练习模式"
          onChange={(nextMode) => {
            const nextSearch = new URLSearchParams(searchParams);
            nextSearch.set("mode", nextMode);
            setSearchParams(nextSearch);
          }}
          options={[{ value: "study", label: "Study" }, { value: "exam", label: "Exam" }]}
          value={mode}
        />
        {(viewStateNotice || timer.warning) && <span className="reading-view-notice" role="status">{viewStateNotice ?? timer.warning}</span>}
        <div className="practice-toolbar__spacer" />
        <SaveStatus state={saveState} />
        <span aria-label={mode === "exam" ? `考试剩余时间 ${timer.label}` : `练习用时 ${timer.label}`} className="practice-timer" role="timer">
          <Clock3 aria-hidden="true" size={16} />{timer.label}
        </span>
        <button
          className="button button--primary"
          disabled={submitting}
          onClick={async () => {
            const unanswered = questionEntries.length - answeredCount;
            if (!window.confirm(`提交后进入复盘页面。当前未答 ${unanswered} 题、标记待检查 ${questionFlags.size} 题；确定提交吗？`)) return;
            setSubmitting(true);
            try {
              await flushPendingSaves();
              await updateSessionElapsed(session.sessionId, timer.elapsedSeconds);
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
          <CheckCircle2 aria-hidden="true" size={16} />
          {submitting ? "提交中…" : "提交"}
        </button>
      </header>
      <div className="reading-workbench__panes">
        <SplitWorkspace
          defaultLayout={layout}
          left={<ReadingPane entries={questionEntries} module={module} onPaneStateChange={(next) => updatePane("left", next)} onScrollPositionChange={(key, top) => updateScrollPosition("left", key, top)} paneState={viewState.left} side="left" />}
          onLayoutChanged={(nextLayout) => {
            setLayout(nextLayout);
            void saveSetting("reading.splitLayout", JSON.stringify(nextLayout));
          }}
          right={<ReadingPane entries={questionEntries} module={module} onPaneStateChange={(next) => updatePane("right", next)} onScrollPositionChange={(key, top) => updateScrollPosition("right", key, top)} paneState={viewState.right} side="right" />}
        />
      </div>
      <footer className="question-navigator" aria-label="题号导航">
        <div className="question-navigator__summary"><ListChecks aria-hidden="true" size={17} />已答 {answeredCount}/{questionEntries.length} · 未答 {questionEntries.length - answeredCount} · 标记 {questionFlags.size}</div>
        <div className="question-navigator__numbers">
          {questionEntries.map((entry) => {
            const value = answers[answerKey(session.sessionId, entry.question.id)]?.value;
            const answered = Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;
            const targetSide: PaneSide = paneShowsQuestions(viewState.right.view) ? "right" : paneShowsQuestions(viewState.left.view) ? "left" : "right";
            const flagged = questionFlags.has(entry.question.id);
            return (
              <span className="question-navigator__item" key={entry.question.id}>
              <button
                aria-controls={questionContainerId(paneInstanceId(targetSide), entry.question.id)}
                aria-label={`跳到第 ${entry.displayNumber} 题，${answered ? "已答" : "未答"}，${targetSide === "right" ? "右" : "左"}窗格`}
                className={answered ? "is-answered" : undefined}
                onClick={() => navigateToQuestion(entry)}
                type="button"
              >
                {entry.displayNumber}<span className="sr-only">{answered ? "已答" : "未答"}</span>
              </button>
              <button aria-label={`${flagged ? "取消" : "添加"}第 ${entry.displayNumber} 题待检查标记`} className={flagged ? "is-flagged" : "question-navigator__flag"} onClick={() => void toggleQuestionFlag(session.sessionId, entry.question.id)} type="button"><Flag aria-hidden="true" size={11} /></button>
              </span>
            );
          })}
        </div>
      </footer>
    </div>
  );
}
