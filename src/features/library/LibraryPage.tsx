import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileInput,
  Headphones,
  PackageOpen,
  PenLine,
  Play,
  RefreshCw,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { PageHeader } from "../../components/common/PageHeader";
import type { IELTSPack, PackModule } from "../../domain";
import type { PracticeSessionSummary } from "../../infrastructure/repositories/LearningRepository";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { buildPracticeRoute, type PracticeModuleType } from "../practice/practiceRoute";
import {
  findRecentResumableSession,
  getModuleProgressStatus,
  type ModuleProgressStatus,
} from "./libraryProgress";
import "./library.css";

const moduleMeta = {
  reading: {
    label: "Reading",
    description: "双 Pane 阅读、答题与文字标记",
    icon: BookOpenText,
  },
  listening: {
    label: "Listening",
    description: "本地音频、Section 导航与答题",
    icon: Headphones,
  },
  writing: {
    label: "Writing",
    description: "Task 1/2 草稿、自动保存与版本",
    icon: PenLine,
  },
} satisfies Record<PracticeModuleType, { label: string; description: string; icon: typeof BookOpenText }>;

const statusMeta: Record<ModuleProgressStatus, { label: string; className: string }> = {
  "not-started": { label: "未开始", className: "module-status--not-started" },
  "in-progress": { label: "进行中", className: "module-status--in-progress" },
  completed: { label: "已完成", className: "module-status--completed" },
};

function formatInstalledAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isOriginalDemo(packId: string): boolean {
  return packId === "original-demo-pack";
}

function modulesForTest(pack: IELTSPack, moduleIds: readonly string[]): readonly PackModule[] {
  return moduleIds
    .map((moduleId) => pack.modules.find((module) => module.id === moduleId))
    .filter((module): module is PackModule => module !== undefined);
}

export function LibraryPage() {
  const navigate = useNavigate();
  const bootstrapPhase = useWorkbenchStore((state) => state.bootstrapPhase);
  const bootstrap = useWorkbenchStore((state) => state.bootstrap);
  const installedPacks = useWorkbenchStore((state) => state.installedPacks);
  const repository = useWorkbenchStore((state) => state.repository);
  const loadPack = useWorkbenchStore((state) => state.loadPack);
  const refreshPacks = useWorkbenchStore((state) => state.refreshPacks);
  const loadHistoricalSession = useWorkbenchStore((state) => state.loadHistoricalSession);
  const storeError = useWorkbenchStore((state) => state.error);
  const clearError = useWorkbenchStore((state) => state.clearError);

  const [expandedPackIds, setExpandedPackIds] = useState<ReadonlySet<string>>(new Set());
  const [loadedPacks, setLoadedPacks] = useState<Readonly<Record<string, IELTSPack>>>({});
  const [loadingPackIds, setLoadingPackIds] = useState<ReadonlySet<string>>(new Set());
  const [packErrors, setPackErrors] = useState<Readonly<Record<string, string>>>({});
  const [recentSessions, setRecentSessions] = useState<readonly PracticeSessionSummary[]>(
    bootstrap?.recentSessions ?? [],
  );
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRecentSessions(bootstrap?.recentSessions ?? []);
    setRecentError(null);
    if (!bootstrap?.available) {
      setRecentLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setRecentLoading(true);
    void repository
      .listRecentSessions()
      .then((sessions) => {
        if (!cancelled) {
          setRecentSessions(sessions);
          setRecentLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRecentError(error instanceof Error ? error.message : String(error));
          setRecentLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrap, repository]);

  const recentSession = useMemo(
    () => findRecentResumableSession(recentSessions),
    [recentSessions],
  );

  const installedModuleCount = useMemo(
    () => installedPacks.reduce((total, pack) => total + pack.modules.length, 0),
    [installedPacks],
  );

  const togglePack = async (packId: string) => {
    const wasExpanded = expandedPackIds.has(packId);
    setExpandedPackIds((current) => {
      const next = new Set(current);
      if (wasExpanded) next.delete(packId);
      else next.add(packId);
      return next;
    });

    if (wasExpanded || loadedPacks[packId] || loadingPackIds.has(packId)) return;

    setLoadingPackIds((current) => new Set(current).add(packId));
    setPackErrors((current) => {
      const next = { ...current };
      delete next[packId];
      return next;
    });
    const pack = await loadPack(packId);
    if (pack) {
      setLoadedPacks((current) => ({ ...current, [packId]: pack }));
    } else {
      setPackErrors((current) => ({ ...current, [packId]: "无法读取该题包的 Test 与模块信息。" }));
    }
    setLoadingPackIds((current) => {
      const next = new Set(current);
      next.delete(packId);
      return next;
    });
  };

  const openModule = (
    packId: string,
    testId: string,
    moduleType: PracticeModuleType,
    mode: "study" | "exam" = "study",
  ) => {
    navigate(buildPracticeRoute(moduleType, { identity: { packId, testId }, mode }));
  };

  const refresh = async () => {
    clearError();
    setRefreshing(true);
    setRecentLoading(true);
    setRecentError(null);
    try {
      const [, sessions] = await Promise.all([
        refreshPacks(),
        repository.listRecentSessions(),
      ]);
      setRecentSessions(sessions);
    } catch (error) {
      setRecentError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecentLoading(false);
      setRefreshing(false);
    }
  };

  const recentIsResumable = recentSession !== null;
  const submittedSessions = recentSessions.filter((candidate) => candidate.status === "submitted");

  return (
    <main className="page library-page">
      <PageHeader
        title="题库"
        description="浏览已安装的本地题包，按 Test 进入 Reading、Listening 或 Writing。题包内容只读，练习状态单独保存。"
        actions={
          <div className="library-header-actions">
            <button className="button" disabled={refreshing} onClick={refresh} type="button">
              <RefreshCw aria-hidden="true" className={refreshing ? "is-spinning" : ""} size={16} />
              {refreshing ? "正在刷新…" : "刷新"}
            </button>
            <Link className="button button--primary" to="/import">
              <FileInput aria-hidden="true" size={16} />
              导入题包
            </Link>
          </div>
        }
      />

      {storeError && (
        <div className="error-banner library-error" role="alert">
          <PackageOpen aria-hidden="true" size={18} />
          <div>
            <strong>题库操作失败</strong>
            <div>{storeError}</div>
          </div>
          <button className="button button--ghost" onClick={clearError} type="button">
            关闭
          </button>
        </div>
      )}

      <section aria-labelledby="recent-title" className="library-recent-panel">
        <div className="library-section-heading">
          <div>
            <h2 id="recent-title">最近继续</h2>
            <p>恢复同一个未提交 Session，不新建 Pane 专属答案。</p>
          </div>
          <span className="library-summary" aria-label={`${installedPacks.length} 个题包，${installedModuleCount} 个模块类型`}>
            {installedPacks.length} 个题包 · {installedModuleCount} 个模块入口
          </span>
        </div>

        {recentLoading ? (
          <div aria-live="polite" className="recent-empty">正在读取最近 Session…</div>
        ) : recentError ? (
          <div className="error-banner" role="alert">无法读取最近 Session：{recentError}</div>
        ) : recentIsResumable ? (
          <div className="recent-session-row">
            <span className="recent-session-row__icon"><Clock3 aria-hidden="true" size={19} /></span>
            <div className="recent-session-row__copy">
              <strong>{moduleMeta[recentSession.moduleType!].label} · 未完成练习</strong>
              <span>题包 {recentSession.packId} · Test {recentSession.testId}</span>
            </div>
            <span className="status-badge status-badge--warning">进行中</span>
            <button
              className="button button--primary"
              onClick={() =>
                openModule(
                  recentSession.packId!,
                  recentSession.testId!,
                  recentSession.moduleType!,
                  recentSession.mode === "exam" ? "exam" : "study",
                )
              }
              type="button"
            >
              <Play aria-hidden="true" size={15} />
              继续
            </button>
          </div>
        ) : (
          <div className="recent-empty">
            <Clock3 aria-hidden="true" size={18} />
            暂无可恢复的未完成练习。可从下方任一模块开始。
          </div>
        )}
      </section>

      <section aria-labelledby="history-title" className="library-recent-panel">
        <div className="library-section-heading"><div><h2 id="history-title">练习历史</h2><p>已提交 Session 保持只读；重新练习会另建记录。</p></div><span className="library-summary">{submittedSessions.length} 次已提交</span></div>
        {submittedSessions.length === 0 ? <div className="recent-empty">暂无已提交练习。</div> : submittedSessions.slice(0, 20).map((history) => (
          <div className="recent-session-row" key={history.sessionId}>
            <span className="recent-session-row__icon"><CheckCircle2 aria-hidden="true" size={19} /></span>
            <div className="recent-session-row__copy"><strong>{history.moduleType ? moduleMeta[history.moduleType].label : "未知模块"} · {history.mode}</strong><span>{new Date(history.submittedAt ?? history.updatedAt).toLocaleString()} · 用时 {Math.floor(history.elapsedSeconds / 60)} 分 {history.elapsedSeconds % 60} 秒</span></div>
            <button className="button" onClick={async () => {
              const loaded = await loadHistoricalSession(history.sessionId);
              if (loaded) navigate("/review");
            }} type="button">查看复盘</button>
          </div>
        ))}
      </section>

      <section aria-labelledby="installed-packs-title" className="library-packs-section">
        <div className="library-section-heading">
          <div>
            <h2 id="installed-packs-title">已安装题包</h2>
            <p>按 Pack / Test 展开。来源标签来自已校验 manifest，不伪造官方内容。</p>
          </div>
        </div>

        {bootstrapPhase === "loading" ? (
          <div className="empty-state" role="status">正在读取本地题包…</div>
        ) : installedPacks.length === 0 ? (
          <div className="empty-state library-empty-state">
            <div>
              <PackageOpen aria-hidden="true" size={26} />
              <h3>尚未安装题包</h3>
              <p>导入一个合法持有的 `IELTSPack v1` 文件夹。PDF、DOCX 和 OCR 暂不支持。</p>
              <Link className="button" to="/import">前往导入中心</Link>
            </div>
          </div>
        ) : (
          <div className="pack-list">
            {installedPacks.map((summary) => {
              const expanded = expandedPackIds.has(summary.id);
              const pack = loadedPacks[summary.id];
              const detailsId = `pack-details-${summary.id}`;
              return (
                <article className="pack-record" key={summary.id}>
                  <button
                    aria-controls={detailsId}
                    aria-expanded={expanded}
                    className="pack-record__toggle"
                    onClick={() => void togglePack(summary.id)}
                    type="button"
                  >
                    {expanded ? <ChevronDown aria-hidden="true" size={18} /> : <ChevronRight aria-hidden="true" size={18} />}
                    <span className="pack-record__identity">
                      <strong>{summary.title}</strong>
                      <span>{summary.sourceLabel}{summary.edition ? ` · ${summary.edition}` : ""}</span>
                    </span>
                    <span className="pack-record__badges">
                      {isOriginalDemo(summary.id) && (
                        <span className="status-badge status-badge--success">
                          <CheckCircle2 aria-hidden="true" size={13} />
                          原创示例 · 非官方
                        </span>
                      )}
                      <span className="status-badge">{summary.modules.length} 个模块</span>
                      <time dateTime={summary.installedAt}>安装于 {formatInstalledAt(summary.installedAt)}</time>
                    </span>
                  </button>

                  {expanded && (
                    <div className="pack-record__details" id={detailsId}>
                      {loadingPackIds.has(summary.id) ? (
                        <div aria-live="polite" className="pack-record__loading">正在读取 Test…</div>
                      ) : packErrors[summary.id] ? (
                        <div className="error-banner" role="alert">{packErrors[summary.id]}</div>
                      ) : pack ? (
                        <div className="test-list">
                          {pack.manifest.tests.map((test) => {
                            const testModules = modulesForTest(pack, test.moduleIds);
                            return (
                              <section aria-labelledby={`test-title-${test.id}`} className="test-record" key={test.id}>
                                <div className="test-record__heading">
                                  <div>
                                    <span className="test-record__eyebrow">TEST</span>
                                    <h3 id={`test-title-${test.id}`}>{test.title}</h3>
                                  </div>
                                  <code>{test.id}</code>
                                </div>
                                <div className="module-list">
                                  {testModules.map((module) => {
                                    const meta = moduleMeta[module.type];
                                    const Icon = meta.icon;
                                    const status = getModuleProgressStatus(
                                      recentSessions,
                                      summary.id,
                                      test.id,
                                      module.type,
                                    );
                                    const statusInfo = statusMeta[status];
                                    return (
                                      <button
                                        aria-label={`打开 ${test.title} 的 ${meta.label}，状态：${statusInfo.label}`}
                                        className="module-entry"
                                        key={module.id}
                                        onClick={() => openModule(summary.id, test.id, module.type)}
                                        type="button"
                                      >
                                        <span className="module-entry__icon"><Icon aria-hidden="true" size={20} /></span>
                                        <span className="module-entry__copy">
                                          <strong>{meta.label}</strong>
                                          <span>{meta.description}</span>
                                        </span>
                                        <span className={`module-status ${statusInfo.className}`}>
                                          {statusInfo.label}
                                        </span>
                                        <ChevronRight aria-hidden="true" size={17} />
                                      </button>
                                    );
                                  })}
                                  {testModules.length === 0 && (
                                    <div className="error-banner" role="alert">该 Test 的 module ID 无法解析。</div>
                                  )}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
