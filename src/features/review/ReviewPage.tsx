import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CircleDashed, FileClock, Headphones, Highlighter, Lock, RotateCcw } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  displayQuestionAnswer,
  displayQuestionCorrectAnswer,
  questionNumberLabel,
  scoreQuestion,
  type IELTSPack,
  type Question,
  type QuestionAnswerValue,
  type QuestionScoreStatus,
  type ReadingModule,
  type WritingModule,
} from "../../domain";
import { QuestionGroupContext } from "../../components/QuestionGroupContext/QuestionGroupContext";
import { boundQuestionIdsFromContext } from "../../components/QuestionGroupContext/questionGroupContextModel";
import { PageHeader } from "../../components/common/PageHeader";
import type { ReviewItem, ReviewRating } from "../../infrastructure/repositories/LearningRepository";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { buildPracticeRoute, parsePracticeRouteIdentity } from "../practice/practiceRoute";
import "./ReviewPage.css";

type ReviewPackAttempt = {
  readonly packId: string;
  readonly pack: IELTSPack | null;
  readonly error: string | null;
};

type ReviewResult = {
  readonly question: Question;
  readonly userAnswer: QuestionAnswerValue | undefined;
  readonly status: QuestionScoreStatus;
  readonly earnedPoints: number;
  readonly scorablePoints: number;
};

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function ReviewAnswer({ result, inline = false }: { readonly result: ReviewResult; readonly inline?: boolean }) {
  const { question, userAnswer, status } = result;
  return (
    <article
      className={`review-answer review-answer--${status}${inline ? " review-answer--inline" : ""}`}
      id={inline ? undefined : `review-question-${question.number}`}
    >
      <div className="review-answer__number">{questionNumberLabel(question)}</div>
      <div>
        <div className="review-answer__status">
          {status === "correct" ? <CheckCircle2 aria-hidden="true" size={15} /> : status === "incorrect" ? <AlertCircle aria-hidden="true" size={15} /> : <CircleDashed aria-hidden="true" size={15} />}
          {status === "correct" ? "Correct" : status === "incorrect" ? "Incorrect" : status === "unscored" ? "Manual check" : "Unanswered"}
        </div>
        <p className="review-answer__prompt">{question.prompt}</p>
        <dl><div><dt>Your answer</dt><dd>{displayQuestionAnswer(question, userAnswer)}</dd></div><div><dt>Correct answer</dt><dd>{displayQuestionCorrectAnswer(question)}</dd></div></dl>
        {status !== "unscored" && <p className="review-answer__points">Points {result.earnedPoints}/{result.scorablePoints}</p>}
      </div>
    </article>
  );
}

export function ReviewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showQueue = searchParams.get("view") === "queue";
  const activePack = useWorkbenchStore((state) => state.activePack);
  const session = useWorkbenchStore((state) => state.session);
  const answers = useWorkbenchStore((state) => state.answers);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const repository = useWorkbenchStore((state) => state.repository);
  const loadPack = useWorkbenchStore((state) => state.loadPack);
  const startNewSession = useWorkbenchStore((state) => state.startNewSession);
  const [restarting, setRestarting] = useState(false);
  const [writingVersionCount, setWritingVersionCount] = useState(0);
  const [packAttempt, setPackAttempt] = useState<ReviewPackAttempt | null>(null);
  const [reviewItems, setReviewItems] = useState<readonly ReviewItem[]>([]);
  const [reviewPacks, setReviewPacks] = useState<Readonly<Record<string, IELTSPack>>>({});
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [gradingItemId, setGradingItemId] = useState<string | null>(null);
  const activeExamLock = session?.mode === "exam" && session.status === "in-progress";
  const sessionIdentity = parsePracticeRouteIdentity(session?.packId, session?.testId);
  const requestedPackId = sessionIdentity?.packId ?? null;
  const matchingActivePack = requestedPackId && activePack?.manifest.id === requestedPackId ? activePack : null;
  const attemptedPack = packAttempt?.packId === requestedPackId ? packAttempt.pack : null;
  const packError = packAttempt?.packId === requestedPackId ? packAttempt.error : null;
  const reviewPack = matchingActivePack ?? attemptedPack;

  useEffect(() => {
    if (!showQueue || activeExamLock) return;
    let active = true;
    setQueueLoading(true);
    setQueueError(null);
    void repository.listReviewItems().then(async (items) => {
      const packIds = [...new Set(items.flatMap((item) => item.packId ? [item.packId] : []))];
      const packs = await Promise.all(packIds.map((packId) => repository.loadPack(packId)));
      if (!active) return;
      setReviewItems(items);
      setReviewPacks(Object.fromEntries(packs.filter((pack): pack is IELTSPack => pack !== null).map((pack) => [pack.manifest.id, pack])));
      setQueueLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setQueueError(error instanceof Error ? error.message : String(error));
      setQueueLoading(false);
    });
    return () => { active = false; };
  }, [activeExamLock, repository, showQueue]);

  useEffect(() => {
    if (activeExamLock || !requestedPackId || matchingActivePack || attemptedPack || packError) return;
    let active = true;
    void loadPack(requestedPackId).then((pack) => {
      if (!active) return;
      const matchingPack = pack?.manifest.id === requestedPackId ? pack : null;
      setPackAttempt({
        packId: requestedPackId,
        pack: matchingPack,
        error: matchingPack ? null : `Could not load pack ${requestedPackId} for this session.`,
      });
    });
    return () => { active = false; };
  }, [activeExamLock, attemptedPack, loadPack, matchingActivePack, packError, requestedPackId]);

  const questions = useMemo(() => {
    if (activeExamLock || !reviewPack || !session?.testId) return [];
    const module = reviewPack.modules.find(
      (candidate) => candidate.type === session.moduleType && candidate.testId === session.testId,
    );
    if (!module || module.type === "writing") return [];
    return module.sections.flatMap((section) => section.questionGroups.flatMap((group) => group.questions));
  }, [activeExamLock, reviewPack, session]);

  const results = useMemo(() => questions.map((question) => {
    const record = session ? Object.values(answers).find((answer) => answer.sessionId === session.sessionId && answer.questionId === question.id) : undefined;
    const score = scoreQuestion(question, record?.value);
    return { question, userAnswer: record?.value, ...score };
  }), [answers, questions, session]);

  const readingGroups = useMemo(() => {
    if (!reviewPack || !session?.testId || session.moduleType !== "reading") return [];
    const module = reviewPack.modules.find(
      (candidate): candidate is ReadingModule => candidate.type === "reading" && candidate.testId === session.testId,
    );
    if (!module) return [];
    const resultByQuestionId = new Map(results.map((result) => [result.question.id, result]));
    return module.sections.flatMap((section) => section.questionGroups.map((group) => ({
      section,
      group,
      results: group.questions.flatMap((question) => {
        const result = resultByQuestionId.get(question.id);
        return result ? [result] : [];
      }),
    })));
  }, [results, reviewPack, session]);

  useEffect(() => {
    if (activeExamLock || !session?.testId || !reviewPack || session.moduleType !== "writing") {
      setWritingVersionCount(0);
      return;
    }
    const writing = reviewPack.modules.find(
      (module): module is WritingModule => module.type === "writing" && module.testId === session.testId,
    );
    if (!writing) return;
    let active = true;
    void Promise.all(writing.sections.flatMap((section) => section.tasks.map((task) => repository.listWritingVersions(session.sessionId, task.id))))
      .then((groups) => { if (active) setWritingVersionCount(groups.reduce((sum, group) => sum + group.length, 0)); });
    return () => { active = false; };
  }, [activeExamLock, repository, reviewPack, session]);

  if (activeExamLock) {
    const examRoute = buildPracticeRoute(session.moduleType ?? "reading", {
      identity: sessionIdentity,
      mode: "exam",
    });
    return (
      <div className="page review-page">
        <PageHeader
          title="Exam in progress"
          description="Submit the active Exam session before opening results. Answers, explanations, and writing versions remain unavailable during the exam."
        />
        <div aria-live="polite" className="empty-state" role="status">
          <div>
            <Lock aria-hidden="true" size={28} />
            <h2>Results are locked</h2>
            <p>This exam has not been submitted. Return to the exam, finish the attempt, and submit before reviewing answers.</p>
            <Link className="button button--primary" to={examRoute}>Return to exam</Link>
          </div>
        </div>
      </div>
    );
  }

  if (showQueue || !session) {
    const now = new Date().toISOString();
    const due = reviewItems.filter((item) => item.dueAt <= now);
    const scheduled = reviewItems.filter((item) => item.dueAt > now);
    const grade = async (item: ReviewItem, rating: ReviewRating) => {
      setGradingItemId(item.id);
      setQueueError(null);
      try {
        const updated = await repository.gradeReviewItem(item.id, rating);
        setReviewItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      } catch (error) {
        setQueueError(error instanceof Error ? error.message : String(error));
      } finally {
        setGradingItemId(null);
      }
    };
    const queueRow = (item: ReviewItem) => {
      const pack = item.packId ? reviewPacks[item.packId] : undefined;
      const test = pack?.manifest.tests.find((candidate) => candidate.id === item.testId);
      const module = item.moduleType && item.testId ? pack?.modules.find((candidate) => candidate.type === item.moduleType && candidate.testId === item.testId) : undefined;
      const sourceLabel = item.sourceKind === "mistake" ? "Mistake" : item.sourceKind === "marked" ? "Marked" : item.sourceKind === "vocabulary" ? "Vocabulary" : "Manual";
      const route = item.sourceKind === "vocabulary" ? "/vocabulary" : item.moduleType && item.packId && item.testId
        ? buildPracticeRoute(item.moduleType, {
          identity: { packId: item.packId, testId: item.testId },
          mode: "study",
          ...(item.moduleType === "listening" && item.sourceStartMs !== undefined ? { audioStartMs: item.sourceStartMs } : {}),
          ...(item.moduleType === "reading" && item.questionId ? { sourceQuestionId: item.questionId } : {}),
        })
        : "/library";
      return <article className="review-queue-row" key={item.id}>
        <div className="review-queue-row__identity"><span className="status-badge">{sourceLabel}</span><div><strong>{pack?.manifest.title ?? (item.sourceKind === "vocabulary" ? "Vocabulary item" : "Local source")}</strong><small>{test?.title ?? "Review source"}{module ? ` · ${module.title}` : ""}</small></div></div>
        <div className="review-queue-row__due"><span>Due</span><time>{item.dueAt <= now ? "Now" : new Date(item.dueAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div>
        <Link className="button" to={route}>{item.moduleType === "listening" && item.sourceStartMs !== undefined ? "Jump to audio" : "Open source"}</Link>
        <div aria-label="Rate this review" className="review-rating" role="group">
          {(["again", "hard", "good", "easy"] as const).map((rating) => <button disabled={gradingItemId === item.id} key={rating} onClick={() => void grade(item, rating)} type="button">{rating}</button>)}
        </div>
      </article>;
    };
    return (
      <div className="page review-page">
        <PageHeader actions={<div className="review-page__actions"><Link className="button" to="/vocabulary">Vocabulary</Link><Link className="button button--primary" to="/library">Open Library</Link></div>} title="Review" description="A local queue built from submitted mistakes, marked questions, and vocabulary. Ratings create an auditable schedule." />
        {queueError && <div className="error-banner review-queue-error" role="alert">{queueError}</div>}
        <section aria-labelledby="due-review-heading" className="review-queue">
          <header><div><span className="review-queue__eyebrow">DUE NOW</span><h2 id="due-review-heading">{queueLoading ? "Loading…" : `${due.length} item${due.length === 1 ? "" : "s"}`}</h2></div><p>Again: 1 day + reset · Hard: 1 day · Good: 1→3→7→14 days · Easy: 3→7→14 days</p></header>
          {due.length ? <div>{due.map(queueRow)}</div> : <div className="review-queue__empty"><CheckCircle2 aria-hidden="true" size={24} /><div><strong>You’re caught up.</strong><p>New mistakes and marked questions enter this queue after a session is submitted.</p></div></div>}
        </section>
        {scheduled.length > 0 && <details className="review-scheduled"><summary>Scheduled later ({scheduled.length})</summary><div>{scheduled.map(queueRow)}</div></details>}
      </div>
    );
  }

  if (!sessionIdentity || !session.moduleType) {
    return (
      <div className="page review-page">
        <PageHeader title="Session results" description="Results require a saved session with a stable pack and test identity." />
        <div className="error-banner" role="alert">This session is missing its pack, test, or module identity. Question loading stopped to prevent incorrect scoring.</div>
      </div>
    );
  }

  if (!reviewPack && !packError) {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>Loading the pack for this session…</span></div></div>;
  }

  if (packError || !reviewPack) {
    return (
      <div className="page review-page">
        <PageHeader title="Session results" description="The exact pack for this session is unavailable, so IELTS Workbench will not score against another source." />
        <div className="error-banner" role="alert">
          {packError ?? "Could not load the pack for this session."}
          <button className="button" onClick={() => setPackAttempt(null)} type="button">Retry</button>
        </div>
      </div>
    );
  }

  const correct = results.reduce((total, result) => total + result.earnedPoints, 0);
  const scorable = results.reduce((total, result) => total + result.scorablePoints, 0);
  const correctQuestions = results.filter((result) => result.status === "correct").length;
  const scorableQuestions = results.filter((result) => result.status !== "unscored").length;
  const incorrect = results.filter((result) => result.status === "incorrect").length;
  const unanswered = results.filter((result) => result.status === "unanswered").length;
  const unscored = results.filter((result) => result.status === "unscored").length;
  const route = buildPracticeRoute(session.moduleType, { identity: sessionIdentity, mode: "study" });

  return (
    <div className="page review-page">
      <PageHeader
        actions={session.status === "submitted" ? <button className="button" disabled={restarting} onClick={async () => {
          setRestarting(true);
          try {
            await startNewSession({ packId: sessionIdentity.packId, testId: sessionIdentity.testId, moduleType: session.moduleType!, mode: session.mode === "exam" ? "exam" : "study" });
            navigate(buildPracticeRoute(session.moduleType!, { identity: sessionIdentity, mode: session.mode === "exam" ? "exam" : "study" }));
          } finally {
            setRestarting(false);
          }
        }} type="button"><RotateCcw aria-hidden="true" size={15} />{restarting ? "Starting…" : "Retry in a new session"}</button> : <Link className="button" to={route}><RotateCcw aria-hidden="true" size={15} />Return to practice</Link>}
        description="A layered result calculated from this session’s durable local record. Band is not estimated for partial or non-standard modules."
        title="Session results"
      />
      <section className="review-session-strip">
        <div><span>Session</span><strong>{session.sessionId}</strong></div>
        <div><span>Skill</span><strong>{session.moduleType?.toUpperCase() ?? "—"}</strong></div>
        <div><span>Mode</span><strong>{session.mode}</strong></div>
        <div><span>Status</span><strong>{session.status}</strong></div>
        <div><span>Time</span><strong>{formatElapsed(session.elapsedSeconds ?? 0)}</strong></div>
      </section>
      <div className="review-metrics">
        <article><CheckCircle2 aria-hidden="true" /><div><strong>{correctQuestions}/{scorableQuestions}</strong><span>Correct / scored questions</span></div></article>
        <article><CheckCircle2 aria-hidden="true" /><div><strong>{correct}/{scorable}</strong><span>Points earned</span></div></article>
        <article><AlertCircle aria-hidden="true" /><div><strong>{incorrect}</strong><span>Incorrect</span></div></article>
        <article><CircleDashed aria-hidden="true" /><div><strong>{unanswered}</strong><span>Unanswered</span></div></article>
        <article><CircleDashed aria-hidden="true" /><div><strong>{unscored}</strong><span>Manual check</span></div></article>
        <article><Highlighter aria-hidden="true" /><div><strong>{annotations.length}</strong><span>Annotations</span></div></article>
        <article><FileClock aria-hidden="true" /><div><strong>{writingVersionCount}</strong><span>Writing versions</span></div></article>
      </div>
      {session.moduleType === "writing" ? (
        <section className="review-writing">
          <FileClock aria-hidden="true" size={24} />
          <div><h2>Writing version record</h2><p>This session has {writingVersionCount} immutable manual or submission snapshot(s). Autosaved drafts are not counted as versions.</p></div>
        </section>
      ) : results.length === 0 ? (
        <div className="empty-state">This session has no questions to review.</div>
      ) : session.moduleType === "reading" ? (
        <section className="review-answers" aria-label="Question review">
          <header><h2>Question review</h2><span>{results.length} questions</span></header>
          {readingGroups.map(({ section, group, results: groupResults }) => {
            const contextBlocks = group.contextBlocks ?? [];
            const boundQuestionIds = boundQuestionIdsFromContext(contextBlocks);
            const resultById = new Map(groupResults.map((result) => [result.question.id, result]));
            return (
              <section className="review-question-group" key={`${section.id}:${group.id}`}>
                <header><span>{section.title}</span>{group.title && <h3>{group.title}</h3>}<p>{group.instructions}</p></header>
                <QuestionGroupContext
                  annotations={annotations}
                  blocks={contextBlocks}
                  editableQuestionIds={new Set()}
                  instanceId={`review-${group.id}`}
                  questions={groupResults.map((result) => ({
                    id: result.question.id,
                    displayNumber: result.question.number,
                    prompt: result.question.prompt,
                  }))}
                  readOnly
                  renderAnswerSlot={(question) => {
                    const result = resultById.get(question.id);
                    return result ? <ReviewAnswer inline result={result} /> : null;
                  }}
                />
                {groupResults
                  .filter((result) => !boundQuestionIds.has(result.question.id))
                  .map((result) => <ReviewAnswer key={result.question.id} result={result} />)}
              </section>
            );
          })}
        </section>
      ) : (
        <section className="review-answers" aria-label="Question review">
          <header><h2>{session.moduleType === "listening" ? "Listening answers" : "Question review"}</h2><span>{results.length} questions</span></header>
          {results.map((result) => (
            <div key={result.question.id}>
              {result.status === "incorrect" && <Headphones aria-hidden="true" className="review-answer__listening-icon" size={14} />}
              <ReviewAnswer result={result} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
