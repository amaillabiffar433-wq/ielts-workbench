import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, ChevronDown, ChevronRight, Download, FileUp, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeader } from "../../components/common/PageHeader";
import type { ReviewItem, VocabularyEntryKind, VocabularyItem, VocabularyLearningState } from "../../infrastructure/repositories/LearningRepository";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { confirmAction } from "../../infrastructure/window/windowClose";
import { buildPracticeRoute } from "../practice/practiceRoute";
import { saveVocabularyExport, type VocabularyExportFormat } from "./vocabularyExport";
import { parseVocabularyText, type ParsedVocabularyEntry } from "./vocabularyImport";
import "./vocabulary.css";

const stateLabels: Record<VocabularyLearningState, string> = { new: "New", learning: "Learning", familiar: "Familiar", mastered: "Mastered" };
const kindLabels: Record<VocabularyEntryKind, string> = { word: "Words", phrase: "Phrases", sentence: "Sentences", note: "Notes" };
type NotebookView = "all" | VocabularyEntryKind | "mistakes";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function sourceLabel(item: VocabularyItem): string {
  return [item.sourceBookTitle, item.sourceTestTitle, item.sourceSectionTitle].filter(Boolean).join(" · ") || "Personal notebook";
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

function reviewLabel(item: ReviewItem): string {
  return item.sourceKind === "vocabulary" ? "Saved vocabulary" : item.sourceKind === "mistake" ? "Mistake" : "Marked question";
}

export function VocabularyPage() {
  const repository = useWorkbenchStore((state) => state.repository);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<NotebookView>("all");
  const [source, setSource] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | VocabularyLearningState>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftKind, setDraftKind] = useState<VocabularyEntryKind>("word");
  const [draftTerm, setDraftTerm] = useState("");
  const [draftSentence, setDraftSentence] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async () => {
    const [records, reviews] = await Promise.all([repository.listVocabularyItems(), repository.listReviewItems()]);
    setItems(records);
    setReviewItems(reviews);
  }, [repository]);

  useEffect(() => {
    let active = true;
    void reload().then(() => { if (active) setLoading(false); }).catch((nextError: unknown) => {
      if (active) { setError(nextError instanceof Error ? nextError.message : String(nextError)); setLoading(false); }
    });
    return () => { active = false; };
  }, [reload]);

  const sources = useMemo(() => [...new Set(items.map(sourceLabel))].sort((a, b) => a.localeCompare(b)), [items]);
  const filtered = useMemo(() => items.filter((item) => (
    (view === "all" || view === "mistakes" || item.entryKind === view)
    && (source === "all" || sourceLabel(item) === source)
    && (status === "all" || item.learningState === status)
    && (!query.trim() || `${item.term} ${item.sentence} ${item.note}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  )), [items, source, status, query, view]);
  const grouped = useMemo(() => {
    const groups = new Map<string, VocabularyItem[]>();
    filtered.forEach((item) => {
      const key = `${item.entryKind}:${item.normalizedTerm}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return [...groups.values()];
  }, [filtered]);

  const update = async (item: VocabularyItem, patch: { note?: string; learningState?: VocabularyLearningState }) => {
    setError(null);
    const targets = patch.learningState ? items.filter((candidate) => candidate.entryKind === item.entryKind && candidate.normalizedTerm === item.normalizedTerm) : [item];
    for (const target of targets) {
      const updated = await repository.updateVocabularyItem({ id: target.id, note: patch.note ?? target.note, learningState: patch.learningState ?? target.learningState });
      setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    }
    setMessage(`Updated “${item.term}”.`);
  };

  const saveManualEntry = async () => {
    const sentence = draftSentence.trim();
    const term = (draftKind === "sentence" ? sentence : draftTerm).trim();
    if (!term) { setError(draftKind === "sentence" ? "Write a sentence first." : "Add a word or phrase first."); return; }
    setError(null);
    try {
      const saved = await repository.saveVocabularyItem({ term, normalizedTerm: term.toLocaleLowerCase().replace(/\s+/gu, " "), entryKind: draftKind, sentence, contextBefore: "", contextAfter: "", sourceBookTitle: "My Notebook", sourceTestTitle: "Personal entry", note: draftNote.trim(), learningState: "new" });
      setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraftTerm(""); setDraftSentence(""); setDraftNote(""); setComposerOpen(false);
      setMessage(`Saved ${kindLabels[draftKind].toLocaleLowerCase().replace(/s$/u, "")} to your vocabulary.`);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
  };

  const saveImportedEntry = async (entry: ParsedVocabularyEntry, fileName: string) => repository.saveVocabularyItem({ term: entry.term, normalizedTerm: entry.normalizedTerm, entryKind: entry.entryKind, sentence: entry.sentence, contextBefore: "", contextAfter: "", sourceBookTitle: `CET6 · ${fileName}`, sourceTestTitle: "Imported vocabulary", note: entry.note, learningState: "new" });

  const importFile = async (file: File) => {
    setImporting(true); setError(null); setMessage(null);
    try {
      const parsed = parseVocabularyText(await file.text(), file.name);
      if (parsed.length === 0) throw new Error("No usable vocabulary entries were found in this file.");
      for (const entry of parsed) await saveImportedEntry(entry, file.name);
      await reload();
      setMessage(`Imported ${parsed.length.toLocaleString()} entries from ${file.name}.`);
      setView("all");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : String(nextError)); }
    finally { setImporting(false); if (importInputRef.current) importInputRef.current.value = ""; }
  };

  const exportItems = async (format: VocabularyExportFormat) => {
    const selectedTerms = new Set(items.filter((item) => selectedIds.has(item.id)).map((item) => item.normalizedTerm));
    const chosen = selectedIds.size > 0 ? items.filter((item) => selectedTerms.has(item.normalizedTerm)) : filtered;
    if (chosen.length === 0) { setError("No notebook entries to export."); return; }
    setError(null);
    try { await saveVocabularyExport(chosen, format); setMessage(`Exported ${new Set(chosen.map((item) => item.normalizedTerm)).size} entries (${format.toUpperCase()}).`); }
    catch (nextError) { if (nextError instanceof DOMException && nextError.name === "AbortError") return; setError(nextError instanceof Error ? nextError.message : String(nextError)); }
  };

  return (
    <main className="page vocabulary-page">
      <PageHeader title="Vocabulary" description="Build your personal word bank with definitions, sentences, and learning states. Words saved from the Reader appear here automatically." actions={<div className="notebook-actions"><button className="button button--primary" onClick={() => setComposerOpen((value) => !value)} type="button"><Plus aria-hidden="true" size={15} />Add Word</button><button className="button" disabled={importing} onClick={() => importInputRef.current?.click()} type="button"><FileUp aria-hidden="true" size={15} />{importing ? "Importing…" : "Import File"}</button><input accept=".json,.jsonl,.csv,.tsv,.txt" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} ref={importInputRef} type="file" /><Link className="button" to="/review?view=queue">Review Queue</Link></div>} />

      {composerOpen && <section aria-labelledby="new-entry-title" className="notebook-composer"><div><span className="eyebrow">ADD TO VOCABULARY</span><h2 id="new-entry-title">New entry</h2><p>Capture a word, phrase, sentence, or study note. Entries from the Reader include source context automatically.</p></div><div className="notebook-composer__fields"><label>Type<select className="select" onChange={(event) => setDraftKind(event.target.value as VocabularyEntryKind)} value={draftKind}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label.replace(/s$/u, "")}</option>)}</select></label>{draftKind !== "sentence" && <label>Word or phrase<input className="input" onChange={(event) => setDraftTerm(event.target.value)} placeholder="e.g. carry out" value={draftTerm} /></label>}<label className="notebook-composer__wide">Example sentence<textarea onChange={(event) => setDraftSentence(event.target.value)} placeholder={draftKind === "sentence" ? "Write the sentence you want to remember." : "Add context or a usage example."} value={draftSentence} /></label><label className="notebook-composer__wide">Meaning / notes<textarea onChange={(event) => setDraftNote(event.target.value)} placeholder="Definition, translation, collocations, or why this matters" value={draftNote} /></label></div><div className="notebook-composer__actions"><button className="button button--primary" onClick={() => void saveManualEntry()} type="button">Save Entry</button><button className="button button--ghost" onClick={() => setComposerOpen(false)} type="button">Cancel</button></div></section>}

      <nav aria-label="Vocabulary sections" className="notebook-tabs" role="tablist">{(["all", "word", "phrase", "sentence", "note", "mistakes"] as const).map((tab) => <button aria-selected={view === tab} className={view === tab ? "is-current" : undefined} key={tab} onClick={() => setView(tab)} role="tab" type="button">{tab === "all" ? "All entries" : tab === "mistakes" ? `Mistakes (${reviewItems.length})` : kindLabels[tab]}{tab !== "mistakes" && <small>{items.filter((item) => tab === "all" || item.entryKind === tab).length}</small>}</button>)}</nav>

      {view !== "mistakes" && <section aria-label="Vocabulary filters and export" className="vocabulary-toolbar"><input className="input" type="search" aria-label="Search vocabulary" placeholder="Search words, phrases, and sentences" value={query} onChange={(event) => setQuery(event.target.value)} /><label><span className="sr-only">Source filter</span><select aria-label="Source filter" className="select" onChange={(event) => setSource(event.target.value)} value={source}><option value="all">All Sources</option>{sources.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span className="sr-only">Proficiency filter</span><select aria-label="Proficiency filter" className="select" onChange={(event) => setStatus(event.target.value as "all" | VocabularyLearningState)} value={status}><option value="all">All Proficiency</option>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><span className="vocabulary-toolbar__count">{grouped.length} unique · {filtered.length} saved</span><div className="vocabulary-export" role="group" aria-label="Export vocabulary"><Download aria-hidden="true" size={14} />{(["markdown", "json", "csv"] as const).map((format) => <button key={format} onClick={() => void exportItems(format)} type="button">{format === "markdown" ? "Markdown" : format.toUpperCase()}</button>)}</div></section>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {message && <div aria-live="polite" className="vocabulary-message" role="status">{message}</div>}

      {view === "mistakes" ? <section aria-label="Review targets" className="notebook-mistakes"><div className="notebook-mistakes__heading"><div><span className="eyebrow">SPACED REVIEW</span><h2>Review targets</h2><p>Mistakes and marked questions are managed in the Review queue.</p></div><Link className="button button--primary" to="/review">Open Review</Link></div>{reviewItems.length === 0 ? <p className="empty-state">No review targets yet. Mark a question or save a vocabulary entry for review.</p> : reviewItems.map((item) => <article className="notebook-mistake-row" key={item.id}><span className="notebook-kind-badge">{reviewLabel(item)}</span><div><strong>{item.vocabularyId ? items.find((candidate) => candidate.id === item.vocabularyId)?.term ?? "Saved vocabulary" : `Question ${item.questionId ?? ""}`}</strong><small>Due {formatDate(item.dueAt)} · {item.repetitions} repetitions</small></div><Link className="button button--ghost" to="/review">Open</Link></article>)}</section>
        : loading ? <div className="empty-state">Loading vocabulary…</div> : grouped.length === 0 ? <div className="empty-state"><div><BookOpenText aria-hidden="true" size={26} /><h2>No entries yet</h2><p>Select English text while reading, add a word manually, or import a vocabulary file.</p></div></div> : <section aria-label="Vocabulary entries" className="vocabulary-list"><div className="vocabulary-list__header"><span>Select</span><span>Entry</span><span>Sentence</span><span>Source</span><span>Added</span><span>State</span><span /></div>{grouped.map((contexts) => { const item = contexts[0]; const expanded = expandedId === item.id; const route = sourceRoute(item); return <article className={`vocabulary-row${expanded ? " is-expanded" : ""}`} key={item.id}><div className="vocabulary-row__summary"><input aria-label={`Select ${item.term}`} checked={selectedIds.has(item.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} type="checkbox" /><button className="vocabulary-row__term" onClick={() => setExpandedId(expanded ? null : item.id)} type="button"><span className="notebook-kind-badge">{kindLabels[item.entryKind].replace(/s$/u, "")}</span><strong>{item.term}</strong></button><span className="vocabulary-row__sentence">{item.sentence || `${item.contextBefore}${item.term}${item.contextAfter}`}</span><span className="vocabulary-row__source">{sourceLabel(item)}{item.sourceQuestionNumber ? ` · Q${item.sourceQuestionNumber}` : ""}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time><select aria-label={`Learning state for ${item.term}`} onChange={(event) => void update(item, { learningState: event.target.value as VocabularyLearningState }).catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : String(nextError)))} value={item.learningState}>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button aria-label={`${expanded ? "Collapse" : "Expand"} ${item.term}`} className="vocabulary-row__expand" onClick={() => setExpandedId(expanded ? null : item.id)} type="button">{expanded ? <ChevronDown aria-hidden="true" size={15} /> : <ChevronRight aria-hidden="true" size={15} />}</button></div>{expanded && <div className="vocabulary-row__detail">{contexts.length > 1 && <div className="vocabulary-sources"><strong>{contexts.length} saved contexts</strong>{contexts.map((saved) => <div key={saved.id}><p>{saved.sentence}</p><small>{sourceLabel(saved)} · {formatDate(saved.createdAt)}</small>{saved.note && <p>{saved.note}</p>}</div>)}</div>}<dl><div><dt>Sentence</dt><dd>{item.sentence || "Not saved"}</dd></div><div><dt>Context</dt><dd>{item.contextBefore}<mark>{item.term}</mark>{item.contextAfter}</dd></div><div><dt>Source</dt><dd>{sourceLabel(item)}{item.sourceQuestionNumber ? ` · Question ${item.sourceQuestionNumber}` : ""}</dd></div><div><dt>Type</dt><dd>{kindLabels[item.entryKind].replace(/s$/u, "")}</dd></div></dl><label>Meaning / my notes<textarea defaultValue={item.note} maxLength={2000} onBlur={(event) => { if (event.target.value !== item.note) void update(item, { note: event.target.value }).catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : String(nextError))); }} placeholder="Add a definition, collocation, grammar note, or review cue" /></label><div className="vocabulary-row__actions">{route && <Link className="button" to={route}>Return to source</Link>}<button className="button button--ghost" onClick={async () => { if (!(await confirmAction(`Remove this saved context for “${item.term}”? Other contexts will remain.`))) return; void repository.deleteVocabularyItem(item.id).then(() => { setItems((current) => current.filter((candidate) => candidate.id !== item.id)); setSelectedIds((current) => { const next = new Set(current); next.delete(item.id); return next; }); }).catch((nextError: unknown) => setError(nextError instanceof Error ? nextError.message : String(nextError))); }} type="button"><Trash2 aria-hidden="true" size={14} />Remove context</button></div></div>}</article>; })}</section>}
    </main>
  );
}
