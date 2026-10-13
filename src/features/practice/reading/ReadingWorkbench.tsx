import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, Columns2, Flag, ListChecks } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { questionContainerId } from "../../../components/QuestionRenderer/questionDomIds";
import { SplitWorkspace, type SplitLayout } from "../../../components/SplitWorkspace/SplitWorkspace";
import { SaveStatus } from "../../../components/common/SaveStatus";
import { SegmentedControl } from "../../../components/common/SegmentedControl";
import type { ReadingModule } from "../../../domain";
import { scoreQuestion } from "../../../domain/questionScoring";
import type { SessionSnapshot } from "../../../infrastructure/repositories/LearningRepository";
import { answerKey, useWorkbenchStore } from "../../../stores/workbenchStore";
import { confirmAction } from "../../../infrastructure/window/windowClose";
import { usePracticeRoutePack } from "../usePracticeRoutePack";
import { derivePracticeElapsed, formatPracticeTime } from "../practiceTimer";
import { ReadingPane } from "./ReadingPane";
import { ReadingWorkspace } from "./ReadingWorkspace";
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
type QuestionNavigatorFilter = "all" | "unanswered" | "flagged";

type QuestionNavigationTarget = {
  readonly side: PaneSide;
  readonly questionId: string;
};

const READING_DEFAULT_SPLIT: SplitLayout = { left: 54, right: 46 };

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
  const [layout, setLayout] = useState<SplitLayout>(READING_DEFAULT_SPLIT);
  const [visiblePane, setVisiblePane] = useState<PaneSide | null>(null);
  const [viewState, setViewState] = useState<ReadingViewState | null>(null);
  const [hydratedSessionId, setHydratedSessionId] = useState<string | null>(null);
  const [viewStateNotice, setViewStateNotice] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionRetryRevision, setSessionRetryRevision] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [questionNavigationTarget, setQuestionNavigationTarget] = useState<QuestionNavigationTarget | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [navigatorFilter, setNavigatorFilter] = useState<QuestionNavigatorFilter>("all");
  const sourceNavigationApplied = useRef<string | null>(null);
  const routePack = usePracticeRoutePack();
  const activePack = routePack.pack;
  const test = routePack.test;
  const session = useWorkbenchStore((state) => state.session);
  const practiceSessionId = session?.sessionId;
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
  const repository = useWorkbenchStore((state) => state.repository);
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
    return questionEntries.reduce((count, entry) => {
      const value = answers[answerKey(session.sessionId, entry.question.id)]?.value;
      const units = 1 + (entry.question.type === "multiple-choice" ? entry.question.additionalNumbers.length : 0);
      return count + (Array.isArray(value) ? Math.min(new Set(value).size, units) : typeof value === "string" && value.trim().length > 0 ? 1 : 0);
    }, 0);
  }, [answers, questionEntries, session]);
  const totalQuestionUnits = questionEntries.reduce((count, entry) => count + 1 + (entry.question.type === "multiple-choice" ? entry.question.additionalNumbers.length : 0), 0);
  const answeredQuestionIds = useMemo(() => new Set(session ? questionEntries.flatMap((entry) => {
    const value = answers[answerKey(session.sessionId, entry.question.id)]?.value;
    const answered = Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;
    return answered ? [entry.question.id] : [];
  }) : []), [answers, questionEntries, session]);
  const visibleNavigationEntries = useMemo(() => questionEntries.filter((entry) => (
    navigatorFilter === "all"
      || (navigatorFilter === "unanswered" && !answeredQuestionIds.has(entry.question.id))
      || (navigatorFilter === "flagged" && questionFlags.has(entry.question.id))
  )), [answeredQuestionIds, navigatorFilter, questionEntries, questionFlags]);
  const currentQuestion = useMemo(() => {
    const active = questionEntries.find((entry) => entry.question.id === activeQuestionId);
    if (active) return { id: active.question.id, number: active.displayNumber };
    if (!viewState) return undefined;
    const questionPane = paneShowsQuestions(viewState.right.view) ? viewState.right : paneShowsQuestions(viewState.left.view) ? viewState.left : null;
    if (!questionPane || questionPane.questionScope !== "single") return undefined;
    const entry = questionEntries.find((candidate) => candidate.displayNumber === questionPane.singleNumber);
    return entry ? { id: entry.question.id, number: entry.displayNumber } : undefined;
  }, [activeQuestionId, questionEntries, viewState]);

  useEffect(() => {
    let active = true;
    void loadSetting("reading.splitLayout").then((value) => {
      if (!active || !value) return;
      try {
        const parsed = JSON.parse(value) as SplitLayout;
        if (Number.isFinite(parsed.left) && Number.isFinite(parsed.right) && parsed.left >= 28 && parsed.right >= 28 && Math.abs(parsed.left + parsed.right - 100) < 0.5) setLayout(parsed);
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
    if (!module || !practiceSessionId || !sessionMatchesRoute) return;
    let active = true;
    const sessionId = practiceSessionId;
    setHydratedSessionId(null);
    setViewState(null);
    setViewStateNotice(null);
    void loadSetting(readingViewStateSettingKey(sessionId)).then((value) => {
      if (!active) return;
      const restored = parseReadingViewState(value, module);
      setViewState(restored.state);
      setHydratedSessionId(sessionId);
      if (restored.recovered) {
        setViewStateNotice("The saved pane selection referenced changed content and was safely reset to a valid range.");
      }
    }).catch((error: unknown) => {
      if (!active) return;
      setViewState(createDefaultReadingViewState(module));
      setHydratedSessionId(sessionId);
      setViewStateNotice(`Unable to restore pane selection; using the default view: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; };
  }, [loadSetting, module, practiceSessionId, sessionMatchesRoute]);

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

  useEffect(() => {
    if (!module || !viewState || !session || hydratedSessionId !== session.sessionId) return;
    const sectionId = searchParams.get("sourceSectionId");
    const blockId = searchParams.get("sourceBlockId");
    const sourceQuestionId = searchParams.get("sourceQuestionId");
    const questionEntry = questionEntries.find((entry) => entry.question.id === sourceQuestionId);
    const questionNumber = questionEntry?.displayNumber ?? Number(searchParams.get("sourceQuestionNumber"));
    const key = `${session.sessionId}:${sectionId ?? ""}:${blockId ?? ""}:${sourceQuestionId ?? ""}:${questionNumber || ""}`;
    if ((!sectionId && !blockId && !questionNumber) || sourceNavigationApplied.current === key) return;
    const section = module.sections.find((candidate) => candidate.id === sectionId) ?? module.sections[0];
    setViewState((current) => current ? {
      ...current,
      left: { ...current.left, view: "passage", passageId: section.id },
      ...(Number.isInteger(questionNumber) && questionNumber > 0 ? {
        right: { ...current.right, view: "questions", questionScope: "single", singleNumber: questionNumber },
      } : sectionId && !blockId ? {
        right: { ...current.right, view: "questions", questionScope: "passage", questionPassageId: section.id },
      } : {}),
    } : current);
    if (questionEntry) {
      setActiveQuestionId(questionEntry.question.id);
      setQuestionNavigationTarget({ side: "right", questionId: questionEntry.question.id });
    }
    sourceNavigationApplied.current = key;
    window.setTimeout(() => {
      const target = blockId ? document.querySelector<HTMLElement>(`[data-pane-scroll="left"] [data-content-block-id="${CSS.escape(blockId)}"]`) : null;
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
  }, [hydratedSessionId, module, questionEntries, searchParams, session, viewState]);

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
    setActiveQuestionId(entry.question.id);
    // Reveal the existing navigation target in single-Pane presentation; do not change its identity.
    if (visiblePane) setVisiblePane(side);
  };

  if (routePack.status === "loading") {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>Loading the linked Reading pack…</span></div></div>;
  }
  if (routePack.status === "error") {
    return <div className="error-banner reading-empty" role="alert">{routePack.error}</div>;
  }
  if (!activePack || !module || !test) {
    return <div className="empty-state reading-empty">No Reading module is available. Install a valid pack from Library or Import.</div>;
  }
  if (sessionError) {
    return (
      <div className="error-banner reading-empty" role="alert">
        <span>Unable to restore the Reading session: {sessionError}</span>
        <button className="button" onClick={() => setSessionRetryRevision((value) => value + 1)} type="button">Retry</button>
      </div>
    );
  }
  if (sessionLoading || !sessionMatchesRoute || !session) {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>Restoring the Reading session…</span></div></div>;
  }
  if (!viewState || hydratedSessionId !== session.sessionId) {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>Restoring Reading pane selection…</span></div></div>;
  }

  return (
    <ReadingWorkspace answered={answeredCount} total={totalQuestionUnits}
      passageTabs={<div className="reading-passage-tabs" role="tablist" aria-label="Reading passages">{module.sections.map((section, index) => {
        const entries = questionEntries.filter((e) => e.section.id === section.id);
        const units = entries.reduce((n,e) => n + 1 + (e.question.type === "multiple-choice" ? e.question.additionalNumbers.length : 0),0);
        const completed = entries.reduce((n,e) => { const v = answers[answerKey(session.sessionId, e.question.id)]?.value; return n + (typeof v === "string" ? Number(v.trim().length > 0) : Math.min(new Set(v ?? []).size,1 + (e.question.type === "multiple-choice" ? e.question.additionalNumbers.length : 0))); },0);
        return <button key={section.id} type="button" role="tab" aria-selected={viewState.left.passageId === section.id} onClick={() => {
          updatePane("left", { ...viewState.left, view: "passage", passageId: section.id });
          updatePane("right", { ...viewState.right, view: "questions", questionScope: "passage", questionPassageId: section.id });
        }}>Passage {index + 1}<small>{completed}/{units}</small></button>;
      })}</div>}
      visiblePane={visiblePane} onVisiblePaneChange={setVisiblePane}
      toolbar={
      <header className="practice-toolbar">
        <div className="practice-toolbar__identity">
          <Columns2 aria-hidden="true" size={19} />
          <div><strong>{module.title}</strong><span title={`${activePack.manifest.title} / ${test.title}`}>{activePack.manifest.title} / {test.title}</span></div>
        </div>
        <SegmentedControl
          label="Practice mode"
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
        {saveState === "error" && <button className="button" type="button" onClick={() => { void flushPendingSaves().catch(() => undefined); }}>Retry save</button>}
        <span aria-label={mode === "exam" ? `Exam time remaining ${timer.label}` : `Practice time ${timer.label}`} className="practice-timer" role="timer">
          <Clock3 aria-hidden="true" size={16} />{timer.label}
        </span>
        <button
          className="button button--primary"
          disabled={submitting}
          onClick={async () => {
            const unanswered = totalQuestionUnits - answeredCount;
            if (!(await confirmAction(`Submit and open Results? ${unanswered} unanswered and ${questionFlags.size} flagged question(s) remain.`))) return;
            setSubmitting(true);
            try {
              await flushPendingSaves();
              await updateSessionElapsed(session.sessionId, timer.elapsedSeconds);
              await submitSession(session.sessionId);
              const reviewCandidates = questionEntries.flatMap((entry) => {
                const value = answers[answerKey(session.sessionId, entry.question.id)]?.value;
                const score = scoreQuestion(entry.question, value);
                const sourceKind = score.status === "incorrect" || score.status === "unanswered"
                  ? "mistake" as const
                  : questionFlags.has(entry.question.id) ? "marked" as const : null;
                return sourceKind ? [{
                  sourceKind,
                  packId: activePack.manifest.id,
                  testId: test.id,
                  moduleType: "reading" as const,
                  questionId: entry.question.id,
                  sourceSessionId: session.sessionId,
                }] : [];
              });
              await Promise.all(reviewCandidates.map((candidate) => repository.saveReviewItem(candidate)));
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
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </header>}
      panes={
        <SplitWorkspace
          defaultLayout={layout}
          resetLayout={READING_DEFAULT_SPLIT}
          visiblePane={visiblePane}
          left={<ReadingPane entries={questionEntries} module={module} onActiveQuestionChange={setActiveQuestionId} onPaneStateChange={(next) => updatePane("left", next)} onScrollPositionChange={(key, top) => updateScrollPosition("left", key, top)} paneState={viewState.left} side="left" vocabularySource={{ packId: activePack.manifest.id, testId: test.id, bookTitle: activePack.manifest.title, testTitle: test.title, ...(currentQuestion ? { currentQuestion } : {}) }} />}
          onLayoutChanged={(nextLayout) => {
            setLayout(nextLayout);
            void saveSetting("reading.splitLayout", JSON.stringify(nextLayout));
          }}
          right={<ReadingPane entries={questionEntries} module={module} onActiveQuestionChange={setActiveQuestionId} onPaneStateChange={(next) => updatePane("right", next)} onScrollPositionChange={(key, top) => updateScrollPosition("right", key, top)} paneState={viewState.right} side="right" vocabularySource={{ packId: activePack.manifest.id, testId: test.id, bookTitle: activePack.manifest.title, testTitle: test.title, ...(currentQuestion ? { currentQuestion } : {}) }} />}
        />}
      navigator={
      <footer className="question-navigator" aria-label="Question navigator">
        <div className="question-navigator__summary"><ListChecks aria-hidden="true" size={17} />Answered {answeredCount}/{totalQuestionUnits} · Unanswered {totalQuestionUnits - answeredCount} · Flagged {questionFlags.size}</div>
        <div className="question-navigator__tools">
          <div aria-label="Question filter" className="question-navigator__filters" role="group">
            {([['all', 'All'], ['unanswered', 'Unanswered'], ['flagged', 'Flagged']] as const).map(([value, label]) => (
              <button aria-pressed={navigatorFilter === value} key={value} onClick={() => setNavigatorFilter(value)} type="button">{label}</button>
            ))}
          </div>
          <button className="question-navigator__next-flagged" disabled={questionFlags.size === 0} onClick={() => {
            const flaggedEntries = questionEntries.filter((entry) => questionFlags.has(entry.question.id));
            if (flaggedEntries.length === 0) return;
            const activeIndex = flaggedEntries.findIndex((entry) => entry.question.id === activeQuestionId);
            navigateToQuestion(flaggedEntries[(activeIndex + 1) % flaggedEntries.length]);
          }} type="button"><Flag aria-hidden="true" size={12} />Next flagged</button>
        </div>
        <div className="question-navigator__numbers">
          {visibleNavigationEntries.map((entry) => {
            const value = answers[answerKey(session.sessionId, entry.question.id)]?.value;
            const answered = Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;
            const targetSide: PaneSide = paneShowsQuestions(viewState.right.view) ? "right" : paneShowsQuestions(viewState.left.view) ? "left" : "right";
            const flagged = questionFlags.has(entry.question.id);
            return (
              <span className="question-navigator__item" key={entry.question.id}>
              <button
                aria-controls={questionContainerId(paneInstanceId(targetSide), entry.question.id)}
                aria-label={`Go to question ${entry.displayNumber}, ${answered ? "answered" : "unanswered"}${flagged ? ", flagged" : ""}, ${targetSide} pane`}
                className={`${answered ? "is-answered" : ""}${activeQuestionId === entry.question.id ? " is-current" : ""}`.trim() || undefined}
                onClick={() => navigateToQuestion(entry)}
                type="button"
              >
                {entry.displayNumber}<span className="sr-only">{answered ? "answered" : "unanswered"}</span>
              </button>
              <button aria-label={`${flagged ? "Remove" : "Add"} review flag for question ${entry.displayNumber}`} className={flagged ? "is-flagged" : "question-navigator__flag"} onClick={() => void toggleQuestionFlag(session.sessionId, entry.question.id)} type="button"><Flag aria-hidden="true" size={11} /></button>
              </span>
            );
          })}
          {visibleNavigationEntries.length === 0 && <span className="question-navigator__empty">No questions match this filter</span>}
        </div>
      </footer>}
    />
  );
}
