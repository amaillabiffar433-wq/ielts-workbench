import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CircleDashed, FileClock, Headphones, Highlighter, Lock, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import type { IELTSPack, Question, WritingModule } from "../../domain";
import { PageHeader } from "../../components/common/PageHeader";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { buildPracticeRoute, parsePracticeRouteIdentity } from "../practice/practiceRoute";
import "./ReviewPage.css";

type ReviewPackAttempt = {
  readonly packId: string;
  readonly pack: IELTSPack | null;
  readonly error: string | null;
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function correctAnswers(question: Question): string[] {
  switch (question.type) {
    case "single-choice": return [question.correctOptionId];
    case "true-false-not-given": return [question.correctAnswer];
    case "short-answer":
    case "fill-blank": return [...question.acceptableAnswers];
  }
}

function displayCorrectAnswer(question: Question): string {
  if (question.type === "single-choice") {
    return question.options.find((option) => option.id === question.correctOptionId)?.text ?? question.correctOptionId;
  }
  if (question.type === "true-false-not-given") return question.correctAnswer.replace("not-given", "Not Given");
  return question.acceptableAnswers.join(" / ");
}

export function ReviewPage() {
  const activePack = useWorkbenchStore((state) => state.activePack);
  const session = useWorkbenchStore((state) => state.session);
  const answers = useWorkbenchStore((state) => state.answers);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const repository = useWorkbenchStore((state) => state.repository);
  const loadPack = useWorkbenchStore((state) => state.loadPack);
  const [writingVersionCount, setWritingVersionCount] = useState(0);
  const [packAttempt, setPackAttempt] = useState<ReviewPackAttempt | null>(null);
  const activeExamLock = session?.mode === "exam" && session.status === "in-progress";
  const sessionIdentity = parsePracticeRouteIdentity(session?.packId, session?.testId);
  const requestedPackId = sessionIdentity?.packId ?? null;
  const matchingActivePack = requestedPackId && activePack?.manifest.id === requestedPackId ? activePack : null;
  const attemptedPack = packAttempt?.packId === requestedPackId ? packAttempt.pack : null;
  const packError = packAttempt?.packId === requestedPackId ? packAttempt.error : null;
  const reviewPack = matchingActivePack ?? attemptedPack;

  useEffect(() => {
    if (activeExamLock || !requestedPackId || matchingActivePack || attemptedPack || packError) return;
    let active = true;
    void loadPack(requestedPackId).then((pack) => {
      if (!active) return;
      const matchingPack = pack?.manifest.id === requestedPackId ? pack : null;
      setPackAttempt({
        packId: requestedPackId,
        pack: matchingPack,
        error: matchingPack ? null : `无法读取 Session 对应的题包 ${requestedPackId}。`,
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
    const userAnswer = typeof record?.value === "string" ? record.value : record?.value.join(", ") ?? "";
    const status = !userAnswer.trim()
      ? "unanswered" as const
      : correctAnswers(question).some((answer) => normalize(answer) === normalize(userAnswer))
        ? "correct" as const
        : "incorrect" as const;
    return { question, userAnswer, status };
  }), [answers, questions, session]);

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
          title="考试仍在进行"
          description="提交当前 Exam Session 后才能进入复盘。此页面不会在考试期间读取或显示答案、解析与写作版本。"
        />
        <div aria-live="polite" className="empty-state" role="status">
          <div>
            <Lock aria-hidden="true" size={28} />
            <h2>复盘已锁定</h2>
            <p>当前考试尚未提交。返回考试继续作答，提交后再查看复盘。</p>
            <Link className="button button--primary" to={examRoute}>返回考试</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="page">
        <PageHeader title="复盘" description="复盘只基于本地 Session 中的确定数据，不生成或伪装官方 Band 分数。" />
        <div className="empty-state"><div><CircleDashed size={28} /><p>当前还没有练习 Session。先完成一段 Reading、Listening 或 Writing 练习。</p><Link className="button" to="/library">返回题库</Link></div></div>
      </div>
    );
  }

  if (!sessionIdentity || !session.moduleType) {
    return (
      <div className="page review-page">
        <PageHeader title="复盘" description="复盘必须绑定已保存 Session 的稳定题包与 Test 身份。" />
        <div className="error-banner" role="alert">当前 Session 缺少 packId、testId 或模块身份，已停止加载题目以避免错误复盘。</div>
      </div>
    );
  }

  if (!reviewPack && !packError) {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>正在读取本次 Session 的题包…</span></div></div>;
  }

  if (packError || !reviewPack) {
    return (
      <div className="page review-page">
        <PageHeader title="复盘" description="没有读取到与当前 Session 身份一致的题包，因此不会展示或评分其他题包。" />
        <div className="error-banner" role="alert">
          {packError ?? "无法读取当前 Session 对应的题包。"}
          <button className="button" onClick={() => setPackAttempt(null)} type="button">重试</button>
        </div>
      </div>
    );
  }

  const correct = results.filter((result) => result.status === "correct").length;
  const incorrect = results.filter((result) => result.status === "incorrect").length;
  const unanswered = results.filter((result) => result.status === "unanswered").length;
  const route = buildPracticeRoute(session.moduleType, { identity: sessionIdentity, mode: "study" });

  return (
    <div className="page review-page">
      <PageHeader
        actions={<Link className="button" to={route}><RotateCcw aria-hidden="true" size={15} /> 返回练习</Link>}
        description="下面是当前 Session 的真实保存记录。此处不提供非官方 IELTS Band 换算。"
        title="本次复盘"
      />
      <section className="review-session-strip">
        <div><span>Session</span><strong>{session.sessionId}</strong></div>
        <div><span>模块</span><strong>{session.moduleType?.toUpperCase() ?? "—"}</strong></div>
        <div><span>模式</span><strong>{session.mode}</strong></div>
        <div><span>状态</span><strong>{session.status}</strong></div>
      </section>
      <div className="review-metrics">
        <article><CheckCircle2 aria-hidden="true" /><div><strong>{correct}</strong><span>正确</span></div></article>
        <article><AlertCircle aria-hidden="true" /><div><strong>{incorrect}</strong><span>错误</span></div></article>
        <article><CircleDashed aria-hidden="true" /><div><strong>{unanswered}</strong><span>未答</span></div></article>
        <article><Highlighter aria-hidden="true" /><div><strong>{annotations.length}</strong><span>阅读标记</span></div></article>
        <article><FileClock aria-hidden="true" /><div><strong>{writingVersionCount}</strong><span>写作版本</span></div></article>
      </div>
      {session.moduleType === "writing" ? (
        <section className="review-writing">
          <FileClock aria-hidden="true" size={24} />
          <div><h2>写作版本记录</h2><p>当前 Session 有 {writingVersionCount} 个不可变手动/提交快照；自动保存草稿不计入版本数。可返回写作页面继续比较或保存。</p></div>
        </section>
      ) : results.length === 0 ? (
        <div className="empty-state">此 Session 暂无可复盘题目。</div>
      ) : (
        <section className="review-answers" aria-label="逐题复盘">
          <header><h2>{session.moduleType === "listening" ? "听力错题与答案" : "逐题答案"}</h2><span>{results.length} 题</span></header>
          {results.map(({ question, userAnswer, status }) => (
            <article className={`review-answer review-answer--${status}`} id={`review-question-${question.number}`} key={question.id}>
              <div className="review-answer__number">{question.number}</div>
              <div>
                <div className="review-answer__status">
                  {status === "correct" ? <CheckCircle2 aria-hidden="true" size={15} /> : status === "incorrect" ? <AlertCircle aria-hidden="true" size={15} /> : <CircleDashed aria-hidden="true" size={15} />}
                  {status === "correct" ? "正确" : status === "incorrect" ? "错误" : "未答"}
                  {session.moduleType === "listening" && status === "incorrect" && <Headphones aria-hidden="true" size={14} />}
                </div>
                <p className="review-answer__prompt">{question.prompt}</p>
                <dl><div><dt>你的答案</dt><dd>{userAnswer || "（未作答）"}</dd></div><div><dt>正确答案</dt><dd>{displayCorrectAnswer(question)}</dd></div></dl>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
