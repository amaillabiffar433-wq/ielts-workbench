import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileInput,
  Headphones,
  LibraryBig,
  Mic2,
  PackageOpen,
  PenLine,
  Play,
  RefreshCw,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { PageHeader } from "../../components/common/PageHeader";
import type { IELTSPack, PackModule, Question } from "../../domain";
import { answerIsPresent, scoreQuestion } from "../../domain/questionScoring";
import type {
  LearningRepository,
  PracticeSessionSummary,
  SessionSnapshot,
} from "../../infrastructure/repositories/LearningRepository";
import { sortRecentSessionSummaries } from "../../infrastructure/repositories/LearningRepository";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import type { PracticeModuleType } from "../practice/practiceRoute";
import { findRecentResumableSession, getModuleProgressStatus } from "./libraryProgress";
import { groupLibraryBooks, type BookEntry } from "./libraryBooks";
import { moduleReadiness } from "./moduleReadiness";
import { PracticeStartDialog } from "./PracticeStartDialog";
import { speakingRepository, type SpeakingTopic } from "../../infrastructure/repositories/SpeakingRepository";
import "./library.css";

type AvailableModule = Extract<PackModule, { type: PracticeModuleType }>;

interface ModuleCandidate {
  readonly pack: IELTSPack;
  readonly testId: string;
  readonly testTitle: string;
  readonly module: AvailableModule;
}

interface TestEntry {
  readonly key: string;
  readonly title: string;
  readonly candidates: readonly ModuleCandidate[];
}

interface SessionScore {
  readonly earned: number;
  readonly total: number;
}

const moduleMeta = {
  listening: { label: "Listening", icon: Headphones },
  reading: { label: "Reading", icon: BookOpenText },
  writing: { label: "Writing", icon: PenLine },
} satisfies Record<PracticeModuleType, { label: string; icon: typeof BookOpenText }>;

const allBookModules = ["listening", "reading", "writing", "speaking"] as const;

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

function testsForBook(book: BookEntry): TestEntry[] {
  const tests = new Map<string, { title: string; candidates: ModuleCandidate[] }>();
  book.packs.forEach((pack) => {
    pack.manifest.tests.forEach((test) => {
      const testKey = normalizeKey(test.title);
      const target = tests.get(testKey) ?? { title: test.title, candidates: [] };
      test.moduleIds.forEach((moduleId) => {
        const module = pack.modules.find((candidate) => candidate.id === moduleId);
        if (module) target.candidates.push({ pack, testId: test.id, testTitle: test.title, module });
      });
      tests.set(testKey, target);
    });
  });
  return [...tests.entries()]
    .map(([key, value]) => {
      const candidates=value.candidates.filter(candidate=>{
        const sameSkill=value.candidates.filter(other=>other.module.type===candidate.module.type);
        const verified=sameSkill.filter(other=>moduleReadiness(other.pack,other.module).startsWith("Ready")||(other.module.type==="writing"&&other.pack.modules.some(module=>moduleReadiness(other.pack,module).startsWith("Ready"))));
        if(verified.length===0)return true;
        const preferred=[...verified].sort((a,b)=>b.pack.manifest.createdAt.localeCompare(a.pack.manifest.createdAt))[0];
        return candidate===preferred;
      });
      return {key,title:value.title,candidates};
    })
    .sort((left, right) => {
      const leftNumber = Number(left.title.match(/\d+/u)?.[0] ?? Number.MAX_SAFE_INTEGER);
      const rightNumber = Number(right.title.match(/\d+/u)?.[0] ?? Number.MAX_SAFE_INTEGER);
      return leftNumber - rightNumber || left.title.localeCompare(right.title);
    });
}

function sessionKey(packId: string, testId: string, moduleType: PracticeModuleType): string {
  return `${packId}\u0000${testId}\u0000${moduleType}`;
}

function latestModuleSession(
  sessions: readonly PracticeSessionSummary[],
  candidate: ModuleCandidate,
): PracticeSessionSummary | undefined {
  return sortRecentSessionSummaries(sessions).find((session) => (
    session.status !== "abandoned"
    && session.packId === candidate.pack.manifest.id
    && session.testId === candidate.testId
    && session.moduleType === candidate.module.type
  ));
}

function moduleQuestions(module: AvailableModule): readonly Question[] {
  if (module.type === "writing") return [];
  return module.sections.flatMap((section) => section.questionGroups.flatMap((group) => group.questions));
}

function scoreSubmittedSession(module: AvailableModule, snapshot: SessionSnapshot): SessionScore | null {
  const answers = new Map(snapshot.answers.map((answer) => [answer.questionId, answer.value]));
  const score = moduleQuestions(module).reduce((total, question) => {
    const result = scoreQuestion(question, answers.get(question.id));
    return { earned: total.earned + result.earnedPoints, total: total.total + result.scorablePoints };
  }, { earned: 0, total: 0 });
  return score.total > 0 ? score : null;
}

function formatDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function questionRange(questions: readonly Question[]): string {
  if (questions.length === 0) return "No objective questions";
  const numbers = questions.flatMap((question) => (
    question.type === "multiple-choice" ? [question.number, ...question.additionalNumbers] : [question.number]
  ));
  return numbers.length === 1 ? `Q${numbers[0]}` : `Q${Math.min(...numbers)}–${Math.max(...numbers)}`;
}

function BookCover({ book, repository }: { readonly book: BookEntry; readonly repository: LearningRepository }) {
  const coverOwner = book.packs.find((pack) => pack.manifest.coverImageAssetId);
  const coverAsset = coverOwner?.manifest.mediaAssets.find(
    (asset) => asset.id === coverOwner.manifest.coverImageAssetId && asset.type === "image",
  );
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    setUrl(null);
    setFailed(false);
    if (!coverOwner || !coverAsset) return () => { alive = false; };
    void repository.readPackMedia(coverOwner.manifest.id, coverAsset.relativePath).then((bytes) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: coverAsset.mimeType }));
      setUrl(objectUrl);
    }).catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [coverAsset, coverOwner, repository]);

  if (url && !failed) return <img alt={`${book.title} cover`} className="book-cover__image" src={url} />;
  return (
    <div aria-label={`${book.title} fallback cover`} className={`book-cover__fallback${book.cambridgeNumber ? "" : " book-cover__fallback--local"}`} role="img">
      <span>{book.cambridgeNumber ? "CAMBRIDGE" : "LUMA"}</span>
      <strong>{book.cambridgeNumber ?? "PRACTICE"}</strong>
      <small>{book.cambridgeNumber ? (/general/iu.test(book.title) ? "GENERAL TRAINING" : "ACADEMIC") : "LOCAL MATERIAL"}</small>
    </div>
  );
}

function completionCopy(session: PracticeSessionSummary | undefined, score: SessionScore | undefined): string {
  if (!session) return "Not started";
  if (session.status !== "submitted") return `In progress · ${formatDuration(session.elapsedSeconds)}`;
  const accuracy = score ? ` · ${Math.round((score.earned / score.total) * 100)}%` : "";
  return `Completed${accuracy} · ${formatDuration(session.elapsedSeconds)} · ${new Date(session.submittedAt ?? session.updatedAt).toLocaleDateString("en-US")}`;
}

function SectionRows({ candidate, recentSessions, scores, onOpen }: {
  readonly candidate: ModuleCandidate;
  readonly recentSessions: readonly PracticeSessionSummary[];
  readonly scores: Readonly<Record<string, SessionScore>>;
  readonly onOpen: (candidate: ModuleCandidate, sectionId?: string) => void;
}) {
  const session = latestModuleSession(recentSessions, candidate);
  const score = scores[sessionKey(candidate.pack.manifest.id, candidate.testId, candidate.module.type)];
  const status = getModuleProgressStatus(recentSessions, candidate.pack.manifest.id, candidate.testId, candidate.module.type);
  return <div className="library-section-list">
    <p className="library-readiness">{moduleReadiness(candidate.pack, candidate.module)}</p>
    <button className="button" onClick={() => onOpen(candidate)} type="button">Full test · {candidate.module.type}</button>
    {candidate.module.sections.map((section, index) => {
      const questions = "questionGroups" in section
        ? section.questionGroups.flatMap((group) => group.questions)
        : [];
      const passageLabel = candidate.module.type === "reading"
        ? `Passage ${index + 1}`
        : candidate.module.type === "listening" ? `Section ${index + 1}` : `Writing ${index + 1}`;
      return <button className="library-section-row" key={section.id} onClick={() => onOpen(candidate,section.id)} type="button">
        <span className={`library-progress-dot library-progress-dot--${status}`} />
        <span className="library-section-row__identity"><small>{passageLabel} · {questionRange(questions)}</small><strong>{section.title}</strong></span>
        <span className="library-section-row__progress">{completionCopy(session, score)}</span>
        <ChevronRight aria-hidden="true" size={16} />
      </button>;
    })}
  </div>;
}

export function LibraryShelfPage() {
  const navigate = useNavigate();
  const bootstrapPhase = useWorkbenchStore((state) => state.bootstrapPhase);
  const bootstrap = useWorkbenchStore((state) => state.bootstrap);
  const installedPacks = useWorkbenchStore((state) => state.installedPacks);
  const repository = useWorkbenchStore((state) => state.repository);
  const refreshPacks = useWorkbenchStore((state) => state.refreshPacks);
  const loadHistoricalSession = useWorkbenchStore((state) => state.loadHistoricalSession);
  const storeError = useWorkbenchStore((state) => state.error);
  const clearError = useWorkbenchStore((state) => state.clearError);
  const [loadedPacks, setLoadedPacks] = useState<readonly IELTSPack[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsError, setPacksError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<readonly PracticeSessionSummary[]>(bootstrap?.recentSessions ?? []);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBookKey, setSelectedBookKey] = useState<string | null>(null);
  const [selectedTestKey, setSelectedTestKey] = useState<string | null>(null);
  const [scores, setScores] = useState<Readonly<Record<string, SessionScore>>>({});
  const [recentSnapshot, setRecentSnapshot] = useState<SessionSnapshot | null>(null);
  const [practiceStart,setPracticeStart]=useState<{candidate:ModuleCandidate;sectionId?:string}|null>(null);
  const [speakingTopics,setSpeakingTopics]=useState<SpeakingTopic[]>([]);
  useEffect(()=>{void speakingRepository.topics().then(setSpeakingTopics).catch(()=>setSpeakingTopics([]));},[]);

  useEffect(() => {
    let active = true;
    setPacksLoading(true);
    setPacksError(null);
    void Promise.all(installedPacks.map((summary) => repository.loadPack(summary.id))).then((packs) => {
      if (!active) return;
      setLoadedPacks(packs.filter((pack): pack is IELTSPack => pack !== null));
      setPacksLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setPacksError(error instanceof Error ? error.message : String(error));
      setPacksLoading(false);
    });
    return () => { active = false; };
  }, [installedPacks, repository]);

  useEffect(() => {
    let active = true;
    setRecentSessions(bootstrap?.recentSessions ?? []);
    if (!bootstrap?.available) return () => { active = false; };
    void repository.listRecentSessions().then((sessions) => {
      if (active) setRecentSessions(sessions);
    }).catch((error: unknown) => {
      if (active) setRecentError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, [bootstrap, repository]);

  const books = useMemo(() => groupLibraryBooks(loadedPacks), [loadedPacks]);
  const selectedBook = books.find((book) => book.key === selectedBookKey) ?? null;
  const selectedBookTests = useMemo(() => selectedBook ? testsForBook(selectedBook) : [], [selectedBook]);
  const selectedTest = selectedBookTests.find((test) => test.key === selectedTestKey) ?? null;
  const recentSession = useMemo(() => findRecentResumableSession(recentSessions), [recentSessions]);

  useEffect(() => {
    let active = true;
    if (!recentSession) {
      setRecentSnapshot(null);
      return () => { active = false; };
    }
    void repository.loadSession(recentSession.sessionId).then((snapshot) => {
      if (active) setRecentSnapshot(snapshot);
    }).catch(() => { if (active) setRecentSnapshot(null); });
    return () => { active = false; };
  }, [recentSession, repository]);

  useEffect(() => {
    let active = true;
    const targets = loadedPacks.flatMap((pack) => pack.manifest.tests.flatMap((test) => (
      pack.modules.filter((module) => module.testId === test.id).flatMap((module) => {
        const candidate: ModuleCandidate = { pack, testId: test.id, testTitle: test.title, module };
        const session = latestModuleSession(recentSessions, candidate);
        return session?.status === "submitted" ? [{ candidate, session }] : [];
      })
    )));
    void Promise.all(targets.map(async ({ candidate, session }) => {
      const snapshot = await repository.loadSession(session.sessionId);
      const score = snapshot ? scoreSubmittedSession(candidate.module, snapshot) : null;
      return score ? [sessionKey(candidate.pack.manifest.id, candidate.testId, candidate.module.type), score] as const : null;
    })).then((values) => {
      if (!active) return;
      setScores(Object.fromEntries(values.filter((value): value is readonly [string, SessionScore] => value !== null)));
    }).catch(() => { if (active) setScores({}); });
    return () => { active = false; };
  }, [loadedPacks, recentSessions, repository]);

  useEffect(() => {
    if (selectedBook && selectedBookTests.length > 0 && !selectedTest) setSelectedTestKey(selectedBookTests[0].key);
  }, [selectedBook, selectedBookTests, selectedTest]);

  const openCandidate = (candidate: ModuleCandidate,sectionId?:string) => setPracticeStart({candidate,sectionId});

  const refresh = async () => {
    clearError();
    setRefreshing(true);
    setRecentError(null);
    try {
      await refreshPacks();
      setRecentSessions(await repository.listRecentSessions());
    } catch (error) {
      setRecentError(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshing(false);
    }
  };

  const recentCandidate = recentSession ? loadedPacks.flatMap((pack) => pack.modules.map((module) => ({ pack, module }))).find(
    ({ pack, module }) => pack.manifest.id === recentSession.packId && module.testId === recentSession.testId && module.type === recentSession.moduleType,
  ) : undefined;
  const recentQuestions = recentCandidate ? moduleQuestions(recentCandidate.module) : [];
  const answeredCount = recentQuestions.reduce((sum,q)=>{const value=recentSnapshot?.answers.find(a=>a.questionId===q.id)?.value;return sum+(!answerIsPresent(value)?0:q.type==="multiple-choice"&&Array.isArray(value)?Math.min(value.length,1+q.additionalNumbers.length):1);},0);
  const recentQuestionCount=recentQuestions.reduce((sum,q)=>sum+(q.type==="multiple-choice"?1+q.additionalNumbers.length:1),0);
  const recentSection = recentCandidate?.module.sections[0];
  const submittedSessions = recentSessions.filter((session) => session.status === "submitted");

  return <main className="page library-page">
    {practiceStart && <PracticeStartDialog pack={practiceStart.candidate.pack} module={practiceStart.candidate.module} initialSectionId={practiceStart.sectionId} recent={latestModuleSession(recentSessions,practiceStart.candidate)} onClose={()=>setPracticeStart(null)}/>}
    <PageHeader actions={<div className="library-header-actions">
      <Link className="button" to="/library/references">Reference materials</Link>
      <Link className="button" to="/practice/speaking">Speaking topics</Link>
      <Link className="button" to="/review">Review</Link>
      <button className="button" disabled={refreshing} onClick={refresh} type="button"><RefreshCw aria-hidden="true" className={refreshing ? "is-spinning" : ""} size={16} />{refreshing ? "Refreshing…" : "Refresh"}</button>
      <Link className="button button--primary" to="/import"><FileInput aria-hidden="true" size={16} />Import sources</Link>
    </div>} description="Choose a book, test, and skill. Source packs remain read-only; answers, marks, and vocabulary are stored separately." title="Library" />

    {(storeError || packsError || recentError) && <div className="error-banner library-error" role="alert"><PackageOpen aria-hidden="true" size={18} /><div><strong>Library could not be loaded</strong><div>{storeError ?? packsError ?? recentError}</div></div><button className="button button--ghost" onClick={clearError} type="button">Dismiss</button></div>}

    <section aria-labelledby="continue-title" className="library-continue">
      <div className="library-section-heading"><div><h2 id="continue-title">Continue learning</h2><p>Resume the same durable, unsubmitted session.</p></div></div>
      {recentSession && recentCandidate ? <div className="continue-study-row">
        <span className="recent-session-row__icon"><Clock3 aria-hidden="true" size={19} /></span>
        <div className="recent-session-row__copy"><strong>{recentCandidate.pack.manifest.title}</strong><span>{moduleMeta[recentCandidate.module.type].label} · {recentSection?.title ?? recentSession.testId}</span></div>
        {recentQuestions.length > 0 && <span className="continue-study-row__count">{answeredCount} / {recentQuestionCount}</span>}
        <button className="button button--primary" onClick={() => openCandidate({ pack: recentCandidate.pack, testId: recentSession.testId!, testTitle: recentSession.testId!, module: recentCandidate.module })} type="button"><Play aria-hidden="true" size={15} />Resume</button>
      </div> : <div className="recent-empty"><Clock3 aria-hidden="true" size={18} />No unfinished session. Choose a book from the shelf to begin.</div>}
    </section>

    {bootstrapPhase === "loading" || packsLoading ? <div className="empty-state" role="status">Loading the local library…</div>
      : books.length === 0 ? <div className="empty-state library-empty-state"><div><LibraryBig aria-hidden="true" size={28} /><h3>Your library is empty</h3><p>Install IELTS material that you hold locally from Sources &amp; Import.</p><Link className="button" to="/import">Open import tools</Link></div></div>
        : !selectedBook ? <section aria-labelledby="bookshelf-title" className="library-bookshelf">
          <div className="library-section-heading"><div><h2 id="bookshelf-title">Bookshelf</h2><p>{books.length} book{books.length === 1 ? "" : "s"} · Select a cover to browse tests</p></div></div>
          <div className="book-grid">{books.map((book) => <button className="book-tile" key={book.key} onClick={() => { setSelectedBookKey(book.key); setSelectedTestKey(null); }} type="button"><span className="book-cover"><BookCover book={book} repository={repository} /></span><span className="book-tile__copy"><strong>{book.title}</strong><small>{testsForBook(book).length} test{testsForBook(book).length === 1 ? "" : "s"}</small></span></button>)}</div>
        </section>
          : <section aria-labelledby="book-title" className="library-book-detail">
            <button className="library-back" onClick={() => { setSelectedBookKey(null); setSelectedTestKey(null); }} type="button"><ArrowLeft aria-hidden="true" size={16} />Back to bookshelf</button>
            <div className="library-book-detail__header"><span className="book-cover book-cover--small"><BookCover book={selectedBook} repository={repository} /></span><div><span className="test-record__eyebrow">BOOK</span><h2 id="book-title">{selectedBook.title}</h2><p>{selectedBook.edition ?? "Local pack"} · {selectedBookTests.length} test{selectedBookTests.length === 1 ? "" : "s"}</p></div></div>
            <div aria-label="Choose a test" className="library-test-tabs" role="tablist">{selectedBookTests.map((test) => <button aria-selected={test.key === selectedTest?.key} className={test.key === selectedTest?.key ? "is-current" : undefined} key={test.key} onClick={() => setSelectedTestKey(test.key)} role="tab" type="button">{test.title}</button>)}</div>
            {selectedTest && <div className="library-module-grid">{allBookModules.map((moduleType) => {
              const candidates = moduleType === "speaking" ? [] : selectedTest.candidates.filter((candidate) => candidate.module.type === moduleType);
              const meta = moduleType === "speaking" ? { label: "Speaking", icon: Mic2 } : moduleMeta[moduleType];
              const Icon = meta.icon;
              if(moduleType==="speaking") {
                const topics=speakingTopics.filter(topic=>topic.sourceVersion===`Cambridge IELTS ${selectedBook.cambridgeNumber} Academic`&&topic.title.includes(`· ${selectedTest.title} ·`));
                return <section className="library-module" key="speaking"><div className="library-module__heading"><Mic2 aria-hidden="true" size={18}/><h3>Speaking</h3></div>{topics.length?<Link className="button" to={`/practice/speaking?topics=${topics.map(t=>t.id).join(",")}`}>Open {topics.length} source topic cards</Link>:<p>No structured speaking topics for this test. <Link to="/practice/speaking">Browse speaking collections</Link></p>}</section>;
              }
              return <section className={`library-module ${candidates.length === 0 ? "is-unavailable" : ""}`} key={moduleType}><div className="library-module__heading"><Icon aria-hidden="true" size={18} /><h3>{meta.label}</h3>{candidates.length === 0 && <span>Not installed</span>}</div>{candidates.map((candidate) => <SectionRows candidate={candidate} key={`${candidate.pack.manifest.id}:${candidate.module.id}`} onOpen={openCandidate} recentSessions={recentSessions} scores={scores} />)}</section>;
            })}</div>}
          </section>}

    {submittedSessions.length > 0 && <details className="library-history"><summary><CheckCircle2 aria-hidden="true" size={16} />Practice history ({submittedSessions.length})</summary><div>{submittedSessions.slice(0, 20).map((history) => <div className="recent-session-row" key={history.sessionId}><div className="recent-session-row__copy"><strong>{history.moduleType ? moduleMeta[history.moduleType].label : "Unknown module"}</strong><span>{new Date(history.submittedAt ?? history.updatedAt).toLocaleString("en-US")} · {formatDuration(history.elapsedSeconds)}</span></div><button className="button" onClick={async () => { if (await loadHistoricalSession(history.sessionId)) navigate("/review"); }} type="button">Open review</button></div>)}</div></details>}
  </main>;
}
