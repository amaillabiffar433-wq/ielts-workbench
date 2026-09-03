import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Columns2, ListChecks } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Question, ReadingModule } from "../../../domain";
import { QuestionRenderer } from "../../../components/QuestionRenderer/QuestionRenderer";
import { questionContainerId } from "../../../components/QuestionRenderer/questionDomIds";
import { SplitWorkspace, type SplitLayout } from "../../../components/SplitWorkspace/SplitWorkspace";
import { TextDocument, type CreateAnnotationInput } from "../../../components/TextDocument/TextDocument";
import { SaveStatus } from "../../../components/common/SaveStatus";
import { SegmentedControl } from "../../../components/common/SegmentedControl";
import { answerKey, useWorkbenchStore } from "../../../stores/workbenchStore";
import { usePracticeRoutePack } from "../usePracticeRoutePack";
import "./ReadingPage.css";

type PaneView = "passage" | "questions" | "whole";
type PracticeMode = "study" | "exam";
type PaneSide = "left" | "right";

type QuestionNavigationTarget = {
  side: PaneSide;
  questionId: string;
};

const paneOptions = [
  { value: "passage" as const, label: "文章" },
  { value: "questions" as const, label: "题目" },
  { value: "whole" as const, label: "整套" },
];

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function usePracticeTimer(mode: PracticeMode): string {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [mode]);
  return mode === "exam" ? formatTime(Math.max(0, 60 * 60 - elapsed)) : formatTime(elapsed);
}

function collectQuestions(module: ReadingModule): Question[] {
  return module.sections.flatMap((section) => section.questionGroups.flatMap((group) => group.questions));
}

function paneShowsQuestions(view: PaneView): boolean {
  return view === "questions" || view === "whole";
}

function paneInstanceId(side: PaneSide): string {
  return `${side}-pane`;
}

function ReadingPane({
  side,
  view,
  onViewChange,
  module,
  questions,
  mode,
}: {
  side: PaneSide;
  view: PaneView;
  onViewChange: (view: PaneView) => void;
  module: ReadingModule;
  questions: readonly Question[];
  mode: PracticeMode;
}) {
  const session = useWorkbenchStore((state) => state.session);
  const answers = useWorkbenchStore((state) => state.answers);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const answerQuestion = useWorkbenchStore((state) => state.answerQuestion);
  const addAnnotation = useWorkbenchStore((state) => state.addAnnotation);
  const removeAnnotation = useWorkbenchStore((state) => state.removeAnnotation);
  const firstSection = module.sections[0];

  const handleCreateAnnotation = (input: CreateAnnotationInput) => {
    if (!session) return;
    void addAnnotation({ sessionId: session.sessionId, ...input });
  };

  const showPassage = view === "passage" || view === "whole";
  const showQuestions = view === "questions" || view === "whole";

  return (
    <section aria-label={`${side === "left" ? "左" : "右"}窗格`} className="reading-pane">
      <header className="reading-pane__header">
        <span className="reading-pane__label">{side === "left" ? "Pane A" : "Pane B"}</span>
        <label>
          <span className="sr-only">选择{side === "left" ? "左" : "右"}窗格内容</span>
          <select
            aria-label={`${side === "left" ? "左" : "右"}窗格内容`}
            className="select reading-pane__selector"
            disabled={mode === "exam"}
            onChange={(event) => onViewChange(event.target.value as PaneView)}
            value={view}
          >
            {paneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </header>
      <div className="reading-pane__scroll" data-pane-scroll={side}>
        {showPassage && firstSection && (
          <TextDocument
            annotations={annotations}
            blocks={firstSection.contentBlocks}
            onCreateAnnotation={handleCreateAnnotation}
            onDeleteAnnotation={(id) => void removeAnnotation(id)}
          />
        )}
        {showQuestions && (
          <div className={`reading-questions${showPassage ? " reading-questions--after-passage" : ""}`}>
            <div className="reading-questions__intro">
              <span>Questions 1–{questions.length}</span>
              <p>答案由 Session 和题目 ID 唯一标识；两个窗格显示同一题时会立即同步。</p>
            </div>
            {questions.map((question) => {
              const value = session ? answers[answerKey(session.sessionId, question.id)]?.value : "";
              return (
                <QuestionRenderer
                  answer={typeof value === "string" ? value : value?.join(", ")}
                  instanceId={paneInstanceId(side)}
                  key={question.id}
                  onAnswer={(questionId, answer) => {
                    if (session) void answerQuestion(session.sessionId, questionId, answer);
                  }}
                  question={question}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function ReadingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: PracticeMode = searchParams.get("mode") === "exam" ? "exam" : "study";
  const [leftView, setLeftView] = useState<PaneView>("passage");
  const [rightView, setRightView] = useState<PaneView>("questions");
  const [layout, setLayout] = useState<SplitLayout>({ left: 52, right: 48 });
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
  const timer = usePracticeTimer(mode);

  const module = useMemo(
    () => activePack?.modules.find(
      (candidate): candidate is ReadingModule => candidate.type === "reading" && candidate.testId === test?.id,
    ) ?? null,
    [activePack, test],
  );
  const questions = useMemo(() => module ? collectQuestions(module) : [], [module]);
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
    return questions.filter((question) => {
      const value = answers[answerKey(session.sessionId, question.id)]?.value;
      return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;
    }).length;
  }, [answers, questions, session]);

  useEffect(() => {
    if (mode === "exam") {
      setLeftView("passage");
      setRightView("questions");
    }
  }, [mode]);

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
    if (!questionNavigationTarget) return;
    const target = document.getElementById(
      questionContainerId(
        paneInstanceId(questionNavigationTarget.side),
        questionNavigationTarget.questionId,
      ),
    );
    if (!target) return;
    target.scrollIntoView?.({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
    setQuestionNavigationTarget(null);
  }, [leftView, questionNavigationTarget, rightView]);

  const navigateToQuestion = (questionId: string) => {
    const side: PaneSide = paneShowsQuestions(rightView)
      ? "right"
      : paneShowsQuestions(leftView)
        ? "left"
        : "right";
    if (side === "right" && !paneShowsQuestions(rightView)) {
      setRightView("questions");
    }
    setQuestionNavigationTarget({ side, questionId });
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

  return (
    <div className="reading-workbench">
      <header className="practice-toolbar">
        <div className="practice-toolbar__identity">
          <Columns2 aria-hidden="true" size={19} />
          <div>
            <strong>{module.title}</strong>
            <span>{activePack.manifest.title}</span>
          </div>
        </div>
        <SegmentedControl
          label="练习模式"
          onChange={(nextMode) => {
            const nextSearch = new URLSearchParams(searchParams);
            nextSearch.set("mode", nextMode);
            setSearchParams(nextSearch);
          }}
          options={[
            { value: "study", label: "Study" },
            { value: "exam", label: "Exam" },
          ]}
          value={mode}
        />
        <div className="practice-toolbar__spacer" />
        <SaveStatus state={saveState} />
        <span aria-label={mode === "exam" ? `考试剩余时间 ${timer}` : `练习用时 ${timer}`} className="practice-timer" role="timer">
          <Clock3 aria-hidden="true" size={16} />
          {timer}
        </span>
        <button
          className="button button--primary"
          disabled={submitting}
          onClick={async () => {
            if (!window.confirm("提交后进入复盘页面？本轮答案已自动保存。")) return;
            setSubmitting(true);
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
          <CheckCircle2 aria-hidden="true" size={16} />
          {submitting ? "提交中…" : "提交"}
        </button>
      </header>
      <div className="reading-workbench__panes">
        <SplitWorkspace
          defaultLayout={layout}
          left={<ReadingPane mode={mode} module={module} onViewChange={setLeftView} questions={questions} side="left" view={leftView} />}
          onLayoutChanged={(nextLayout) => {
            setLayout(nextLayout);
            void saveSetting("reading.splitLayout", JSON.stringify(nextLayout));
          }}
          right={<ReadingPane mode={mode} module={module} onViewChange={setRightView} questions={questions} side="right" view={rightView} />}
        />
      </div>
      <footer className="question-navigator" aria-label="题号导航">
        <div className="question-navigator__summary">
          <ListChecks aria-hidden="true" size={17} />
          已答 {answeredCount}/{questions.length}
        </div>
        <div className="question-navigator__numbers">
          {questions.map((question) => {
            const value = answers[answerKey(session.sessionId, question.id)]?.value;
            const answered = Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;
            const targetSide: PaneSide = paneShowsQuestions(rightView)
              ? "right"
              : paneShowsQuestions(leftView)
                ? "left"
                : "right";
            return (
              <button
                aria-controls={questionContainerId(paneInstanceId(targetSide), question.id)}
                aria-label={`跳到第 ${question.number} 题，${answered ? "已答" : "未答"}，${targetSide === "right" ? "右" : "左"}窗格`}
                className={answered ? "is-answered" : undefined}
                key={question.id}
                onClick={() => navigateToQuestion(question.id)}
                type="button"
              >
                {question.number}<span className="sr-only">{answered ? "已答" : "未答"}</span>
              </button>
            );
          })}
        </div>
      </footer>
    </div>
  );
}
