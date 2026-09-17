import { ArrowRight, BookOpenText, Clock3, LibraryBig, RefreshCw, Target, TimerReset } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/common/PageHeader";
import { sortRecentSessionSummaries } from "../../infrastructure/repositories/LearningRepository";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { findRecentResumableSession } from "../library/libraryProgress";
import { buildPracticeRoute } from "../practice/practiceRoute";
import { formatStudyDuration } from "../progress/learningAnalytics";
import { useLearningAnalytics } from "../progress/useLearningAnalytics";
import "./home.css";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const navigate = useNavigate();
  const workspaceName = useWorkbenchStore((state) => state.bootstrap?.workspace?.displayName ?? "Local workspace");
  const loadHistoricalSession = useWorkbenchStore((state) => state.loadHistoricalSession);
  const { analytics, packs, sessions, loading, error } = useLearningAnalytics();
  const recent = findRecentResumableSession(sessions);
  const recentPack = recent?.packId ? packs.find((pack) => pack.manifest.id === recent.packId) : undefined;
  const recentTest = recentPack?.manifest.tests.find((test) => test.id === recent?.testId);
  const history = sortRecentSessionSummaries(sessions).filter((session) => session.status === "submitted").slice(0, 4);
  const accuracy = analytics.scorablePoints > 0 ? Math.round((analytics.earnedPoints / analytics.scorablePoints) * 100) : null;

  const resume = () => {
    if (!recent?.moduleType || !recent.packId || !recent.testId) return;
    navigate(buildPracticeRoute(recent.moduleType, { identity: { packId: recent.packId, testId: recent.testId }, mode: recent.mode === "exam" ? "exam" : "study" }));
  };

  return <main className="page home-page">
    <PageHeader description={`${workspaceName} · Private, local, and available offline.`} title={`${greeting()}.`} />
    {error && <div className="error-banner" role="alert">Unable to read learning activity: {error}</div>}

    <section className="home-hero" aria-labelledby="today-heading">
      <div className="home-hero__copy">
        <span className="home-eyebrow">TODAY</span>
        <h2 id="today-heading">{recent ? "Pick up where you left off." : "Choose one focused practice block."}</h2>
        <p>{recent ? `${recentPack?.manifest.title ?? "Local pack"} · ${recentTest?.title ?? recent.testId} · ${recent.moduleType}` : "Your library is the starting point for every test and skill."}</p>
        <div className="home-hero__actions">
          {recent ? <button className="button button--primary" onClick={resume} type="button"><RefreshCw aria-hidden="true" size={16} />Resume session</button>
            : <Link className="button button--primary" to="/library"><LibraryBig aria-hidden="true" size={16} />Open Library</Link>}
          <Link className="button" to="/review?view=queue"><TimerReset aria-hidden="true" size={16} />Review</Link>
        </div>
      </div>
      <div className="home-today-metric"><span>Focused today</span><strong>{formatStudyDuration(analytics.todaySeconds)}</strong><small>{analytics.completed} completed session{analytics.completed === 1 ? "" : "s"} in this workspace</small></div>
    </section>

    <section aria-label="Learning summary" className="home-metrics">
      <article><Clock3 aria-hidden="true" size={18} /><span>Total focus</span><strong>{loading ? "—" : formatStudyDuration(analytics.elapsedSeconds)}</strong></article>
      <article><Target aria-hidden="true" size={18} /><span>Objective accuracy</span><strong>{loading || accuracy === null ? "—" : `${accuracy}%`}</strong><small>{accuracy === null ? "Complete an objective test to unlock" : `${analytics.earnedPoints}/${analytics.scorablePoints} points`}</small></article>
      <article><RefreshCw aria-hidden="true" size={18} /><span>Questions to revisit</span><strong>{loading ? "—" : analytics.mistakes}</strong><small>From submitted, locally scored sessions</small></article>
    </section>

    <div className="home-grid">
      <section className="home-panel" aria-labelledby="recent-heading">
        <header><div><span className="home-eyebrow">ACTIVITY</span><h2 id="recent-heading">Recent work</h2></div><Link to="/progress">View progress <ArrowRight aria-hidden="true" size={14} /></Link></header>
        {history.length ? <div className="home-activity-list">{history.map((session) => {
          const pack = session.packId ? packs.find((candidate) => candidate.manifest.id === session.packId) : undefined;
          const test = pack?.manifest.tests.find((candidate) => candidate.id === session.testId);
          return <button key={session.sessionId} onClick={async () => { if (await loadHistoricalSession(session.sessionId)) navigate("/review"); }} type="button">
            <span className="home-activity-list__icon"><BookOpenText aria-hidden="true" size={16} /></span>
            <span><strong>{pack?.manifest.title ?? "Local practice"}</strong><small>{test?.title ?? session.testId ?? "Session"} · {session.moduleType ?? "practice"}</small></span>
            <time>{new Date(session.submittedAt ?? session.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
            <ArrowRight aria-hidden="true" size={14} />
          </button>;
        })}</div> : <div className="home-panel__empty">No completed sessions yet. Results will appear here after your first submission.</div>}
      </section>

      <section className="home-panel home-brief" aria-labelledby="brief-heading">
        <header><div><span className="home-eyebrow">DAILY BRIEF</span><h2 id="brief-heading">One source of truth</h2></div></header>
        <p>Today’s note can be exported to your Obsidian vault after the integration is configured in Settings. Nothing is written outside the workspace without an explicit export.</p>
        <Link className="button" to="/settings">Configure integration <ArrowRight aria-hidden="true" size={14} /></Link>
      </section>
    </div>
  </main>;
}
