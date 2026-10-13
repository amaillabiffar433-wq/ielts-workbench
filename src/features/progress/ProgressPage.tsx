import { BarChart3, CalendarDays, CheckCircle2, Clock3, Target } from "lucide-react";
import { PageHeader } from "../../components/common/PageHeader";
import { formatStudyDuration } from "./learningAnalytics";
import { useLearningAnalytics } from "./useLearningAnalytics";
import "./progress.css";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { speakingRepository, type SpeakingSession } from "../../infrastructure/repositories/SpeakingRepository";

const moduleLabels = { listening: "Listening", reading: "Reading", writing: "Writing" } as const;

export function ProgressPage() {
  const { analytics, loading, error } = useLearningAnalytics();
  const [speaking,setSpeaking]=useState<SpeakingSession[]>([]);
  const [speakingError,setSpeakingError]=useState(false);
  useEffect(()=>{void speakingRepository.sessions().then(setSpeaking).catch(()=>setSpeakingError(true));},[]);
  const accuracy = analytics.scorablePoints > 0 ? Math.round((analytics.earnedPoints / analytics.scorablePoints) * 100) : null;
  const maxDaily = Math.max(1, ...analytics.recentDays.map((day) => day.elapsedSeconds));
  const scoredTypes = analytics.byQuestionType.map((item) => ({ ...item, accuracy: Math.round((item.earnedPoints / item.scorablePoints) * 100) }));
  const strongest = [...scoredTypes].sort((left, right) => right.accuracy - left.accuracy || right.attempts - left.attempts)[0];
  const weakest = [...scoredTypes].sort((left, right) => left.accuracy - right.accuracy || right.attempts - left.attempts)[0];
  const questionTypeLabel = (value: string) => value.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");

  return <main className="page progress-page">
    <PageHeader description="Measured from durable sessions in this workspace. No estimates and no cloud data." title="Progress" />
    <p className="progress-method">Accuracy uses the first submitted attempt per test, skill and mode. {analytics.retakes} repeat attempt(s) are counted in practice time, separately from accuracy.</p>
    {error && <div className="error-banner" role="alert">Unable to calculate progress: {error}</div>}
    <section className="progress-card"><h2>Speaking practice</h2>{speakingError?<p role="alert">Speaking records could not be read.</p>:<p>{speaking.filter(s=>s.status==="completed").length} completed · {speaking.filter(s=>s.status==="in-progress").length} in progress · {formatStudyDuration(speaking.reduce((sum,s)=>sum+s.elapsedSeconds,0))} timed practice. <Link to="/practice/speaking">Open topics and recordings</Link></p>}<small>Speaking time and completion are shown separately from the objective practice statistics below.</small></section>

    <section aria-label="Progress summary" className="progress-summary">
      <article><Clock3 aria-hidden="true" size={18} /><span>Total focus</span><strong>{loading ? "—" : formatStudyDuration(analytics.elapsedSeconds)}</strong></article>
      <article><CheckCircle2 aria-hidden="true" size={18} /><span>Completed</span><strong>{loading ? "—" : analytics.completed}</strong></article>
      <article><Target aria-hidden="true" size={18} /><span>Objective accuracy</span><strong>{loading || accuracy === null ? "—" : `${accuracy}%`}</strong></article>
      <article><CalendarDays aria-hidden="true" size={18} /><span>Current streak</span><strong>{loading ? "—" : `${analytics.streakDays} day${analytics.streakDays === 1 ? "" : "s"}`}</strong></article>
    </section>

    <div className="progress-grid">
      <section className="progress-card" aria-labelledby="weekly-heading">
        <header><div><span>LAST 7 DAYS</span><h2 id="weekly-heading">Focused time</h2></div><strong>{formatStudyDuration(analytics.recentDays.reduce((sum, day) => sum + day.elapsedSeconds, 0))}</strong></header>
        <div className="progress-bars" role="img" aria-label="Focused time by day over the last seven days">{analytics.recentDays.map((day) => <div className="progress-bar" key={day.key} title={`${day.label}: ${formatStudyDuration(day.elapsedSeconds)}`}>
          <span className="progress-bar__value">{day.elapsedSeconds ? Math.max(8, Math.round((day.elapsedSeconds / maxDaily) * 100)) : 2}%</span>
          <i style={{ height: `${day.elapsedSeconds ? Math.max(8, Math.round((day.elapsedSeconds / maxDaily) * 100)) : 2}%` }} />
          <small>{day.label}</small>
        </div>)}</div>
      </section>

      <section className="progress-card" aria-labelledby="skills-heading">
        <header><div><span>SKILLS</span><h2 id="skills-heading">Practice balance</h2></div><BarChart3 aria-hidden="true" size={18} /></header>
        <div className="progress-skills">{analytics.byModule.map((module) => {
          const moduleAccuracy = module.scorablePoints ? Math.round((module.earnedPoints / module.scorablePoints) * 100) : null;
          const width = analytics.elapsedSeconds ? Math.round((module.elapsedSeconds / analytics.elapsedSeconds) * 100) : 0;
          return <article key={module.moduleType}>
            <div><strong>{moduleLabels[module.moduleType]}</strong><span>{module.sessions} session{module.sessions === 1 ? "" : "s"} · {formatStudyDuration(module.elapsedSeconds)}</span></div>
            <div className="progress-skill-track"><i style={{ width: `${width}%` }} /></div>
            <small>{moduleAccuracy === null ? "No objective score" : `${moduleAccuracy}% accuracy`}</small>
          </article>;
        })}</div>
      </section>
    </div>

    <div className="progress-grid progress-grid--detail">
      <section className="progress-card" aria-labelledby="accuracy-heading">
        <header><div><span>LAST 7 DAYS</span><h2 id="accuracy-heading">Accuracy over time</h2></div><Target aria-hidden="true" size={18} /></header>
        <div className="accuracy-bars" aria-label="Objective accuracy by day">{analytics.recentDays.map((day) => {
          const dayAccuracy = day.scorablePoints > 0 ? Math.round((day.earnedPoints / day.scorablePoints) * 100) : null;
          return <div key={day.key}><span>{dayAccuracy === null ? "—" : `${dayAccuracy}%`}</span><i><b style={{ height: `${dayAccuracy ?? 2}%` }} /></i><small>{day.label}</small></div>;
        })}</div>
      </section>

      <section className="progress-card" aria-labelledby="focus-heading">
        <header><div><span>EVIDENCE-BASED</span><h2 id="focus-heading">Strengths and focus</h2></div><BarChart3 aria-hidden="true" size={18} /></header>
        {scoredTypes.length ? <div className="progress-focus">
          <article><span>Strongest observed type</span><strong>{questionTypeLabel(strongest.questionType)}</strong><small>{strongest.accuracy}% across {strongest.attempts} attempt{strongest.attempts === 1 ? "" : "s"}</small></article>
          <article><span>Needs attention</span><strong>{questionTypeLabel(weakest.questionType)}</strong><small>{weakest.accuracy}% across {weakest.attempts} attempt{weakest.attempts === 1 ? "" : "s"}</small></article>
        </div> : <p className="progress-card__empty">Submit an objective Reading or Listening session to calculate strengths and weaknesses.</p>}
      </section>
    </div>

    {scoredTypes.length > 0 && <section className="progress-card progress-question-types" aria-labelledby="types-heading">
      <header><div><span>QUESTION TYPES</span><h2 id="types-heading">Objective performance</h2></div><strong>{scoredTypes.reduce((sum, item) => sum + item.attempts, 0)} attempts</strong></header>
      <div>{scoredTypes.map((item) => <article key={item.questionType}><div><strong>{questionTypeLabel(item.questionType)}</strong><span>{item.earnedPoints}/{item.scorablePoints} points · {item.attempts} attempt{item.attempts === 1 ? "" : "s"}</span></div><div className="progress-skill-track"><i style={{ width: `${item.accuracy}%` }} /></div><b>{item.accuracy}%</b></article>)}</div>
    </section>}

    {analytics.sessions === 0 && !loading && <div className="empty-state progress-empty"><div><BarChart3 aria-hidden="true" size={28} /><h2>Your baseline starts with the first session.</h2><p>Open a test from Library; focus time, completions, and locally scored accuracy will appear here.</p></div></div>}
  </main>;
}
