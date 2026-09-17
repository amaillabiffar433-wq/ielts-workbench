import { useEffect, useMemo, useState } from "react";
import { BookOpenText, ChevronDown, ChevronRight, Download, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeader } from "../../components/common/PageHeader";
import type { VocabularyItem, VocabularyLearningState } from "../../infrastructure/repositories/LearningRepository";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { buildPracticeRoute } from "../practice/practiceRoute";
import { saveVocabularyExport, type VocabularyExportFormat } from "./vocabularyExport";
import "./vocabulary.css";

const stateLabels: Record<VocabularyLearningState, string> = {
  new: "新词",
  learning: "学习中",
  familiar: "熟悉",
  mastered: "已掌握",
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

function sourceLabel(item: VocabularyItem): string {
  return [item.sourceBookTitle, item.sourceTestTitle, item.sourceSectionTitle].filter(Boolean).join(" · ") || "未分类来源";
}

function sourceRoute(item: VocabularyItem): string | null {
  if (!item.sourcePackId || !item.sourceTestId || item.sourceModule !== "reading") return null;
  const base = buildPracticeRoute("reading", { identity: { packId: item.sourcePackId, testId: item.sourceTestId } });
  const [path, query = ""] = base.split("?");
  const params = new URLSearchParams(query);
  if (item.sourceSectionId) params.set("sourceSectionId", item.sourceSectionId);
  if (item.sourceBlockId) params.set("sourceBlockId", item.sourceBlockId);
  if (item.sourceQuestionNumber) params.set("sourceQuestionNumber", String(item.sourceQuestionNumber));
  return `${path}?${params.toString()}`;
}

export function VocabularyPage() {
  const repository = useWorkbenchStore((state) => state.repository);
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState<"all" | VocabularyLearningState>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let active = true;
    void repository.listVocabularyItems().then((records) => {
      if (active) { setItems(records); setLoading(false); }
    }).catch((nextError: unknown) => {
      if (active) { setError(nextError instanceof Error ? nextError.message : String(nextError)); setLoading(false); }
    });
    return () => { active = false; };
  }, [repository]);

  const sources = useMemo(() => [...new Set(items.map(sourceLabel))].sort((a, b) => a.localeCompare(b)), [items]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => (
      (!needle || `${item.term}\n${item.sentence}\n${item.note}`.toLocaleLowerCase().includes(needle))
      && (source === "all" || sourceLabel(item) === source)
      && (status === "all" || item.learningState === status)
    ));
  }, [items, query, source, status]);

  const update = async (item: VocabularyItem, patch: { note?: string; learningState?: VocabularyLearningState }) => {
    setError(null);
    const updated = await repository.updateVocabularyItem({
      id: item.id,
      note: patch.note ?? item.note,
      learningState: patch.learningState ?? item.learningState,
    });
    setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    setMessage(`已更新“${updated.term}”。`);
  };

  const exportItems = async (format: VocabularyExportFormat) => {
    const chosen = selectedIds.size > 0 ? filtered.filter((item) => selectedIds.has(item.id)) : filtered;
    if (chosen.length === 0) { setError("当前没有可导出的生词。"); return; }
    setError(null);
    try {
      await saveVocabularyExport(chosen, format);
      setMessage(`已导出 ${chosen.length} 条生词（${format.toUpperCase()}）。`);
    } catch (nextError) {
      if (nextError instanceof DOMException && nextError.name === "AbortError") return;
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  return (
    <main className="page vocabulary-page">
      <PageHeader title="生词本" description="保留选词时的原句和来源；释义不会由 AI 自动写入。" />
      <section aria-label="生词筛选与导出" className="vocabulary-toolbar">
        <label className="vocabulary-search"><Search aria-hidden="true" size={15} /><span className="sr-only">搜索生词</span><input aria-label="搜索生词" onChange={(event) => setQuery(event.target.value)} placeholder="搜索单词、原句或备注" value={query} /></label>
        <label><span className="sr-only">来源筛选</span><select aria-label="来源筛选" className="select" onChange={(event) => setSource(event.target.value)} value={source}><option value="all">全部来源</option>{sources.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span className="sr-only">掌握状态筛选</span><select aria-label="掌握状态筛选" className="select" onChange={(event) => setStatus(event.target.value as "all" | VocabularyLearningState)} value={status}><option value="all">全部状态</option>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <span className="vocabulary-toolbar__count">{filtered.length} 条</span>
        <div className="vocabulary-export" role="group" aria-label="批量导出">
          <Download aria-hidden="true" size={14} />
          {(["markdown", "json", "csv"] as const).map((format) => <button key={format} onClick={() => void exportItems(format)} type="button">{format === "markdown" ? "Markdown" : format.toUpperCase()}</button>)}
        </div>
      </section>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {message && <div aria-live="polite" className="vocabulary-message" role="status">{message}</div>}
      {loading ? <div className="empty-state">正在读取生词本…</div> : filtered.length === 0 ? (
        <div className="empty-state"><div><BookOpenText aria-hidden="true" size={26} /><h2>还没有符合条件的生词</h2><p>在 Reading 正文中选中英文单词或短语，点击“加入生词本”。</p></div></div>
      ) : (
        <section aria-label="生词列表" className="vocabulary-list">
          <div className="vocabulary-list__header"><span>选择</span><span>生词</span><span>原句</span><span>来源</span><span>标记时间</span><span>掌握状态</span><span /></div>
          {filtered.map((item) => {
            const expanded = expandedId === item.id;
            const route = sourceRoute(item);
            return <article className={`vocabulary-row${expanded ? " is-expanded" : ""}`} key={item.id}>
              <div className="vocabulary-row__summary">
                <input aria-label={`选择 ${item.term}`} checked={selectedIds.has(item.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} type="checkbox" />
                <button className="vocabulary-row__term" onClick={() => setExpandedId(expanded ? null : item.id)} type="button"><strong>{item.term}</strong><span>{item.normalizedTerm !== item.term.toLocaleLowerCase() ? item.normalizedTerm : ""}</span></button>
                <span className="vocabulary-row__sentence">{item.sentence || `${item.contextBefore}${item.term}${item.contextAfter}`}</span>
                <span className="vocabulary-row__source">{sourceLabel(item)}{item.sourceQuestionNumber ? ` · Q${item.sourceQuestionNumber}` : ""}</span>
                <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                <select aria-label={`${item.term} 的掌握状态`} onChange={(event) => void update(item, { learningState: event.target.value as VocabularyLearningState }).catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : String(nextError)))} value={item.learningState}>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <button aria-label={`${expanded ? "收起" : "展开"} ${item.term}`} className="vocabulary-row__expand" onClick={() => setExpandedId(expanded ? null : item.id)} type="button">{expanded ? <ChevronDown aria-hidden="true" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}</button>
              </div>
              {expanded && <div className="vocabulary-row__detail">
                <dl><div><dt>原句</dt><dd>{item.sentence || "未保存"}</dd></div><div><dt>前后文</dt><dd>{item.contextBefore}<mark>{item.term}</mark>{item.contextAfter}</dd></div><div><dt>来源</dt><dd>{sourceLabel(item)}{item.sourceQuestionNumber ? ` · Question ${item.sourceQuestionNumber}` : ""}</dd></div></dl>
                <label>我的备注<textarea defaultValue={item.note} maxLength={2000} onBlur={(event) => { if (event.target.value !== item.note) void update(item, { note: event.target.value }).catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : String(nextError))); }} placeholder="补充搭配、用法或复习提示" /></label>
                <div className="vocabulary-row__actions">{route && <Link className="button" to={route}>回到原文</Link>}<button className="button button--ghost" onClick={() => { if (!window.confirm(`删除生词“${item.term}”？`)) return; void repository.deleteVocabularyItem(item.id).then(() => { setItems((current) => current.filter((candidate) => candidate.id !== item.id)); setSelectedIds((current) => { const next = new Set(current); next.delete(item.id); return next; }); }).catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : String(nextError))); }} type="button"><Trash2 aria-hidden="true" size={14} />删除</button></div>
              </div>}
            </article>;
          })}
        </section>
      )}
    </main>
  );
}
