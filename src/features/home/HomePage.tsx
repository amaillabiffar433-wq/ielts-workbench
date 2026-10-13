import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  BookOpenText,
  Brain,
  Clock3,
  Headphones,
  LibraryBig,
  Mic2,
  PenLine,
  RefreshCw,
  Sparkles,
  Target,
  TimerReset,
  TrendingUp,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/common/PageHeader";
import type { ReviewItem } from "../../infrastructure/repositories/LearningRepository";
import { sortRecentSessionSummaries } from "../../infrastructure/repositories/LearningRepository";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { findRecentResumableSession } from "../library/libraryProgress";
import { formatStudyDuration } from "../progress/learningAnalytics";
import { useLearningAnalytics } from "../progress/useLearningAnalytics";
import "./home.css";

const moduleMeta: Record<string, { label: string; icon: typeof BookOpenText }> = {
  listening: { label: "Listening", icon: Headphones },
  reading: { label: "Reading", icon: BookOpenText },
  writing: { label: "Writing", icon: PenLine },
  speaking: { label: "Speaking", icon: Mic2 },
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function todayDateString(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function HomePage() {
  const navigate = useNavigate();
  const workspaceName = useWorkbenchStore((state) => state.bootstrap?.workspace?.displayName ?? "Local workspace");
  const loadHistoricalSession = useWorkbenchStore((state) => state.loadHistoricalSession);
  const repository = useWorkbenchStore((state) => state.repository);
  const { analytics, packs, sessions, loading, error } = useLearningAnalytics();

  const recent = findRecentResumableSession(sessions);
  const recentPack = recent?.packId ? packs.find((pack) => pack.manifest.id === recent.packId) : undefined;
  const recentTest = recentPack?.manifest.tests.find((test) => test.id === recent?.testId);
  const recentModule = recentPack?.modules.find((module) => module.testId === recent?.testId && module.type === recent?.moduleType);

  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [vocabCount, setVocabCount] = useState(0);

  useEffect(() => {
    void repository.listReviewItems().then((items) => {
      const now = new Date().toISOString();
      setReviewItems(items.filter((item) => item.dueAt <= now));
    });
    void repository.listVocabularyItems().then((items) => setVocabCount(items.length));
  }, [repository]);

  const dueReviewCount = reviewItems.length;
  const accuracy = analytics.scorablePoints > 0 ? Math.round((analytics.earnedPoints / analytics.scorablePoints) * 100) : null;
  const history = sortRecentSessionSummaries(sessions).filter((session) => session.status === "submitted").slice(0, 3);
  const studyDayCount = analytics.recentDays.filter((d) => d.elapsedSeconds > 0).length;
  const todayMinutes = Math.round(analytics.todaySeconds / 60);

  const quickActions = [
    { to: "/library", icon: LibraryBig, label: "Start Practice", description: "Choose a test from your library", primary: true },
    { to: "/vocabulary", icon: BookOpen, label: "Review Vocabulary", description: `${vocabCount} saved words and phrases` },
    { to: "/review?view=queue", icon: TimerReset, label: "Review Mistakes", description: `${dueReviewCount} item${dueReviewCount === 1 ? "" : "s"} due for review` },
    { to: "/practice/speaking", icon: Mic2, label: "Speaking", description: "Practice spoken responses" },
    { to: "/progress", icon: TrendingUp, label: "View Progress", description: "Track your learning journey" },
  ];

  return (
    <main className="page dashboard-page">
      <PageHeader
        title={greeting()}
        description={`${todayDateString()} · ${workspaceName}`}
      />

      {error && <div className="error-banner" role="alert">Unable to read learning activity: {error}</div>}

      {/* Stats row */}
      <section aria-label="Learning overview" className="dashboard-stats">
        <article>
          <Clock3 aria-hidden="true" size={18} />
          <div>
            <span>Study today</span>
            <strong>{loading ? "—" : `${todayMinutes} min`}</strong>
          </div>
        </article>
        <article>
          <Target aria-hidden="true" size={18} />
          <div>
            <span>Accuracy</span>
            <strong>{loading || accuracy === null ? "—" : `${accuracy}%`}</strong>
          </div>
        </article>
        <article>
          <Brain aria-hidden="true" size={18} />
          <div>
            <span>Vocabulary</span>
            <strong>{vocabCount} words</strong>
          </div>
        </article>
        <article>
          <TimerReset aria-hidden="true" size={18} />
          <div>
            <span>Review due</span>
            <strong>{dueReviewCount} item{dueReviewCount === 1 ? "" : "s"}</strong>
          </div>
        </article>
        <article>
          <Sparkles aria-hidden="true" size={18} />
          <div>
            <span>Day streak</span>
            <strong>{analytics.streakDays} day{analytics.streakDays === 1 ? "" : "s"}</strong>
          </div>
        </article>
      </section>

      <div className="dashboard-primary-grid">
        {/* Continue Learning */}
        <section className="dashboard-card dashboard-continue" aria-labelledby="continue-heading">
          <header>
            <div>
              <span className="dashboard-eyebrow">CONTINUE</span>
              <h2 id="continue-heading">Resume learning</h2>
            </div>
          </header>
          {recent && recentPack && recentModule ? (
            <div className="dashboard-continue__body">
              <div className="dashboard-continue__info">
                <span className="dashboard-module-badge">{moduleMeta[recent.moduleType ?? "reading"]?.label ?? "Practice"}</span>
                <strong>{recentPack.manifest.title}</strong>
                <small>{recentTest?.title ?? recent.testId} · {recent.moduleType}</small>
              </div>
              <Link
                className="button button--primary"
                to={`/practice/${recent.moduleType}?packId=${recent.packId}&testId=${recent.testId}&mode=${recent.mode}`}
              >
                <RefreshCw aria-hidden="true" size={15} />Continue Learning
              </Link>
            </div>
          ) : (
            <div className="dashboard-empty-inline">
              <BookOpenText aria-hidden="true" size={18} />
              <span>No active session. Start a new practice.</span>
              <Link className="button" to="/library">Open Library</Link>
            </div>
          )}
        </section>

        {/* Quick Practice */}
        <section className="dashboard-card" aria-labelledby="quick-heading">
          <header>
            <div>
              <span className="dashboard-eyebrow">PRACTICE</span>
              <h2 id="quick-heading">Quick actions</h2>
            </div>
          </header>
          <div className="dashboard-quick-actions">
            {quickActions.map((action) => (
              <Link
                className={`dashboard-quick-action${action.primary ? " dashboard-quick-action--primary" : ""}`}
                key={action.to}
                to={action.to}
              >
                <action.icon aria-hidden="true" size={18} />
                <div>
                  <strong>{action.label}</strong>
                  <small>{action.description}</small>
                </div>
                <ArrowRight aria-hidden="true" size={14} />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-secondary-grid">
        {/* Recent Activity */}
        <section className="dashboard-card" aria-labelledby="recent-heading">
          <header>
            <div>
              <span className="dashboard-eyebrow">ACTIVITY</span>
              <h2 id="recent-heading">Recent sessions</h2>
            </div>
            <Link to="/progress">View all <ArrowRight aria-hidden="true" size={14} /></Link>
          </header>
          {history.length > 0 ? (
            <div className="dashboard-activity-list">
              {history.map((session) => {
                const pack = session.packId ? packs.find((c) => c.manifest.id === session.packId) : undefined;
                const test = pack?.manifest.tests.find((c) => c.id === session.testId);
                const meta = session.moduleType ? moduleMeta[session.moduleType] : undefined;
                return (
                  <button
                    key={session.sessionId}
                    className="dashboard-activity-row"
                    onClick={async () => {
                      if (await loadHistoricalSession(session.sessionId)) navigate("/review");
                    }}
                    type="button"
                  >
                    <span className="dashboard-activity-row__icon">
                      {meta ? <meta.icon aria-hidden="true" size={16} /> : <BookOpenText aria-hidden="true" size={16} />}
                    </span>
                    <span className="dashboard-activity-row__info">
                      <strong>{pack?.manifest.title ?? "Local practice"}</strong>
                      <small>{test?.title ?? session.testId ?? "Session"} · {session.moduleType ?? "practice"}</small>
                    </span>
                    <time>{new Date(session.submittedAt ?? session.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
                    <ArrowRight aria-hidden="true" size={14} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty-inline">
              No completed sessions yet. Results will appear after your first submission.
            </div>
          )}
        </section>

        {/* Review Due */}
        <section className="dashboard-card" aria-labelledby="review-due-heading">
          <header>
            <div>
              <span className="dashboard-eyebrow">REVIEW</span>
              <h2 id="review-due-heading">Words &amp; mistakes due</h2>
            </div>
            <Link to="/review?view=queue">Open Review <ArrowRight aria-hidden="true" size={14} /></Link>
          </header>
          {dueReviewCount > 0 ? (
            <div className="dashboard-review-list">
              {reviewItems.slice(0, 5).map((item) => (
                <div className="dashboard-review-row" key={item.id}>
                  <span className="dashboard-review-kind">{item.sourceKind === "mistake" ? "Mistake" : item.sourceKind === "vocabulary" ? "Vocabulary" : item.sourceKind === "marked" ? "Marked" : "Review"}</span>
                  <span className="dashboard-review-label">
                    {item.sourceKind === "vocabulary" ? "Saved word to review" : item.questionId ? `Question ${item.questionId}` : "Spaced review item"}
                  </span>
                  <Link className="button button--ghost" to={item.sourceKind === "vocabulary" ? "/vocabulary" : "/review?view=queue"}>
                    Open
                  </Link>
                </div>
              ))}
              {dueReviewCount > 5 && (
                <Link className="dashboard-review-more" to="/review?view=queue">
                  +{dueReviewCount - 5} more due for review
                </Link>
              )}
            </div>
          ) : (
            <div className="dashboard-empty-inline dashboard-empty--success">
              <div><TimerReset aria-hidden="true" size={18} />All caught up — nothing due for review.</div>
            </div>
          )}
        </section>
      </div>

      {/* Weekly summary */}
      {analytics.recentDays.length > 0 && studyDayCount > 0 && (
        <section className="dashboard-card dashboard-weekly" aria-labelledby="weekly-heading">
          <header>
            <div>
              <span className="dashboard-eyebrow">THIS WEEK</span>
              <h2 id="weekly-heading">Daily focus</h2>
            </div>
            <strong>{formatStudyDuration(analytics.recentDays.reduce((sum, d) => sum + d.elapsedSeconds, 0))} this week</strong>
          </header>
          <div className="dashboard-weekly-bars" role="img" aria-label="Focus time by day">
            {analytics.recentDays.map((day) => {
              const maxSeconds = Math.max(1, ...analytics.recentDays.map((d) => d.elapsedSeconds));
              const height = day.elapsedSeconds > 0 ? Math.max(12, Math.round((day.elapsedSeconds / maxSeconds) * 100)) : 4;
              const hasFocus = day.elapsedSeconds > 0;
              return (
                <div className={`dashboard-bar${hasFocus ? " dashboard-bar--active" : ""}`} key={day.key} title={`${day.label}: ${formatStudyDuration(day.elapsedSeconds)}`}>
                  <i style={{ height: `${height}%` }} />
                  <small>{day.label}</small>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}