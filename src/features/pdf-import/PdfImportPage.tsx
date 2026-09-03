import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  FileUp,
  Library,
  Play,
  ScanText,
} from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeader } from "../../components/common/PageHeader";
import { buildPracticeRoute } from "../practice/practiceRoute";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { BrowserPdfSourceAdapter } from "./BrowserPdfSourceAdapter";
import { browserFileSource, type DocumentSourceAdapter, type PdfDocumentHandle } from "./documentSource";
import {
  applyAnswerKey,
  buildImportedReadingPack,
  createImportDedupeKey,
  createReadingImportDraft,
  findDuplicateImportedPack,
  parseAnswerKey,
  validatePageRange,
  validatePdfFile,
  type ExtractedPdfPage,
  type PageRange,
  type ReadingImportDraft,
} from "./pdfImportModel";
import "./pdf-import.css";

type ImportStep = "source" | "pages" | "review" | "complete";

const questionTypeOptions = [
  ["single-choice", "Multiple Choice"],
  ["true-false-not-given", "TRUE / FALSE / NOT GIVEN"],
  ["short-answer", "Short Answer / Completion"],
  ["fill-blank", "Sentence Completion"],
  ["matching-headings", "Matching Headings（通用输入）"],
  ["unsupported", "未支持题型（通用输入）"],
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function rangeFrom(start: number, end: number): PageRange {
  return { start, end };
}

async function extractRange(document: PdfDocumentHandle, range: PageRange): Promise<ExtractedPdfPage[]> {
  const pages: ExtractedPdfPage[] = [];
  for (let pageNumber = range.start; pageNumber <= range.end; pageNumber += 1) {
    pages.push(await document.extractPage(pageNumber));
  }
  return pages;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface PdfImportPageProps {
  readonly adapter?: DocumentSourceAdapter;
}

export function PdfImportPage({ adapter = new BrowserPdfSourceAdapter() }: PdfImportPageProps) {
  const repository = useWorkbenchStore((state) => state.repository);
  const installImportedPack = useWorkbenchStore((state) => state.installImportedPack);
  const [step, setStep] = useState<ImportStep>("source");
  const [documentHandle, setDocumentHandle] = useState<PdfDocumentHandle | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentText, setCurrentText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [passageStart, setPassageStart] = useState(1);
  const [passageEnd, setPassageEnd] = useState(1);
  const [questionStart, setQuestionStart] = useState(1);
  const [questionEnd, setQuestionEnd] = useState(1);
  const [answerStart, setAnswerStart] = useState("");
  const [answerEnd, setAnswerEnd] = useState("");
  const [bookTitle, setBookTitle] = useState("Local Reading PDF");
  const [testNumber, setTestNumber] = useState("1");
  const [passageNumber, setPassageNumber] = useState(1);
  const [draft, setDraft] = useState<ReadingImportDraft | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [invalidAnswerLines, setInvalidAnswerLines] = useState<readonly string[]>([]);
  const [installedIdentity, setInstalledIdentity] = useState<{ packId: string; testId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentHandleRef = useRef<PdfDocumentHandle | null>(null);

  const passageRange = rangeFrom(passageStart, passageEnd);
  const questionRange = rangeFrom(questionStart, questionEnd);
  const answerRange = answerStart && answerEnd ? rangeFrom(Number(answerStart), Number(answerEnd)) : undefined;

  useEffect(() => () => { void documentHandleRef.current?.destroy(); }, []);

  useEffect(() => {
    if (!documentHandle || step !== "pages") return;
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPreviewLoading(true);
    setError(null);
    void Promise.all([
      documentHandle.renderPage(currentPage, canvas, 620),
      documentHandle.extractPage(currentPage),
    ]).then(([, page]) => {
      if (!active) return;
      setCurrentText(page.text);
      if (!page.text.trim()) {
        setWarning("当前页没有可提取文本层，可能是扫描页；本轮不会自动 OCR。");
      }
    }).catch((nextError: unknown) => {
      if (active) setError(errorMessage(nextError));
    }).finally(() => {
      if (active) setPreviewLoading(false);
    });
    return () => { active = false; };
  }, [currentPage, documentHandle, step]);

  const openFile = async (file: File) => {
    const validation = validatePdfFile(file);
    setError(validation.error ?? null);
    setWarning(validation.warning ?? null);
    if (!validation.valid) return;
    setBusy(true);
    try {
      const nextDocument = await adapter.open(browserFileSource(file));
      const previousDocument = documentHandleRef.current;
      documentHandleRef.current = nextDocument;
      setDocumentHandle(nextDocument);
      await previousDocument?.destroy();
      setCurrentPage(1);
      setPassageStart(1);
      setPassageEnd(1);
      setQuestionStart(Math.min(2, nextDocument.pageCount));
      setQuestionEnd(Math.min(2, nextDocument.pageCount));
      setAnswerStart("");
      setAnswerEnd("");
      setBookTitle(file.name.replace(/\.pdf$/iu, "") || "Local Reading PDF");
      setDraft(null);
      setInstalledIdentity(null);
      setStep("pages");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void openFile(file);
  };

  const analyze = async () => {
    if (!documentHandle) return;
    const errors = [
      validatePageRange(passageRange, documentHandle.pageCount, "Passage 页码"),
      validatePageRange(questionRange, documentHandle.pageCount, "Questions 页码"),
      answerRange ? validatePageRange(answerRange, documentHandle.pageCount, "Answer Key 页码") : null,
    ].filter(Boolean);
    if (errors.length > 0) {
      setError(errors.join(" "));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [passagePages, questionPages, answerPages] = await Promise.all([
        extractRange(documentHandle, passageRange),
        extractRange(documentHandle, questionRange),
        answerRange ? extractRange(documentHandle, answerRange) : Promise.resolve([]),
      ]);
      if (![...passagePages, ...questionPages].some((page) => page.text.trim())) {
        throw new Error("所选页没有原生文本层。请更换文本版 PDF；本轮不启用 OCR。");
      }
      const nextDraft = createReadingImportDraft(passagePages, questionPages, passageNumber);
      if (!nextDraft.passageText.trim()) throw new Error("Passage 页未提取到正文，请调整页码范围。");
      if (nextDraft.questions.length === 0) throw new Error("Questions 页未识别出任何题目，请调整页码或稍后人工整理。");
      setDraft(nextDraft);
      if (answerPages.length > 0) setAnswerText(answerPages.map((page) => page.text).join("\n"));
      setStep("review");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const parsedAnswerResult = useMemo(() => parseAnswerKey(answerText), [answerText]);

  const applyAnswers = () => {
    if (!draft) return;
    setDraft({ ...draft, questions: applyAnswerKey(draft.questions, parsedAnswerResult.answers) });
    setInvalidAnswerLines(parsedAnswerResult.invalidLines);
  };

  const updateQuestion = (index: number, update: Partial<ReadingImportDraft["questions"][number]>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      questions: draft.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...update } : question,
      ),
    });
  };

  const importPack = async () => {
    if (!documentHandle || !draft) return;
    if (!bookTitle.trim() || !testNumber.trim()) {
      setError("Book title 和 Test number 不能为空。");
      return;
    }
    if (draft.questions.some((question) => !Number.isInteger(question.number) || question.number < 1 || !question.prompt.trim())) {
      setError("每道题都需要正整数题号和非空题干。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dedupeKey = await createImportDedupeKey(
        documentHandle.sourceSha256,
        passageRange,
        questionRange,
        passageNumber,
      );
      const duplicate = await findDuplicateImportedPack(repository, dedupeKey);
      if (duplicate) {
        setError(`相同文件、页码范围和 Passage 已导入：${duplicate.manifest.title}。未创建重复题包。`);
        return;
      }
      const pack = buildImportedReadingPack({
        sourceFileName: documentHandle.fileName,
        sourceFileSize: documentHandle.fileSize,
        sourceSha256: documentHandle.sourceSha256,
        sourceFingerprint: documentHandle.sourceSha256,
        bookTitle: bookTitle.trim(),
        testNumber: testNumber.trim(),
        passageNumber,
        passagePageRange: passageRange,
        questionPageRange: questionRange,
        ...(answerRange ? { answerKeyPageRange: answerRange } : {}),
        importedAt: new Date().toISOString(),
        dedupeKey,
        draft,
      });
      await installImportedPack(pack);
      setInstalledIdentity({ packId: pack.manifest.id, testId: pack.manifest.tests[0].id });
      setStep("complete");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page pdf-import-page">
      <PageHeader
        actions={<Link className="button" to="/import"><ArrowLeft aria-hidden="true" size={16} /> 返回导入中心</Link>}
        description="本地、半自动的 Reading PDF 导入。页面序号统一从 1 开始；原文需人工复核，扫描版暂不 OCR。"
        title="导入 Reading PDF"
      />

      <ol aria-label="PDF 导入步骤" className="pdf-import-steps">
        {[["source", "1 选择来源"], ["pages", "2 页面范围"], ["review", "3 人工整理"], ["complete", "4 导入完成"]].map(([value, label]) => (
          <li className={step === value ? "is-current" : undefined} key={value}>{label}</li>
        ))}
      </ol>

      {error && <div className="error-banner" role="alert"><AlertTriangle aria-hidden="true" size={18} />{error}</div>}
      {warning && <div className="notice-banner" role="status"><AlertTriangle aria-hidden="true" size={18} />{warning}</div>}

      {step === "source" && (
        <section className="pdf-import-panel">
          <div
            className={`pdf-drop-zone${dragActive ? " is-dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <FileUp aria-hidden="true" size={36} />
            <h2>选择一个本地 PDF</h2>
            <p>支持文件选择或拖放。文件只在本机解析，不会上传；大于 50 MB 会提示。</p>
            <input
              accept="application/pdf,.pdf"
              aria-label="选择本地 PDF"
              hidden
              onChange={(event) => { const file = event.target.files?.[0]; if (file) void openFile(file); }}
              ref={fileInputRef}
              type="file"
            />
            <button className="button button--primary" disabled={busy} onClick={() => fileInputRef.current?.click()} type="button">
              {busy ? "正在读取…" : "选择 PDF"}
            </button>
          </div>
        </section>
      )}

      {step === "pages" && documentHandle && (
        <div className="pdf-page-layout">
          <section className="pdf-preview-panel">
            <header>
              <div><strong>{documentHandle.fileName}</strong><span>{formatBytes(documentHandle.fileSize)} · {documentHandle.pageCount} 页 · SHA-256 {documentHandle.sourceSha256.slice(0, 12)}…</span></div>
              <div className="pdf-page-controls">
                <button aria-label="上一页" className="button button--ghost" disabled={currentPage <= 1 || previewLoading} onClick={() => setCurrentPage((value) => value - 1)} type="button"><ArrowLeft size={16} /></button>
                <span>第 {currentPage} / {documentHandle.pageCount} 页</span>
                <button aria-label="下一页" className="button button--ghost" disabled={currentPage >= documentHandle.pageCount || previewLoading} onClick={() => setCurrentPage((value) => value + 1)} type="button"><ArrowRight size={16} /></button>
              </div>
            </header>
            <div className="pdf-canvas-frame"><canvas aria-label={`PDF 第 ${currentPage} 页预览`} ref={canvasRef} /></div>
          </section>
          <aside className="pdf-range-panel">
            <div className="pdf-text-preview"><h2><FileSearch size={18} /> 当前页文本层</h2><pre>{previewLoading ? "正在按需提取…" : currentText || "（无可提取文本）"}</pre></div>
            <h2>选择页码范围</h2>
            <p>以下均为 PDF 阅读器中看到的 1-based 页序号，包含起止页。</p>
            <div className="pdf-range-grid">
              <fieldset><legend>Passage</legend><label>从<input aria-label="Passage 开始页" min={1} onChange={(event) => setPassageStart(Number(event.target.value))} type="number" value={passageStart} /></label><label>到<input aria-label="Passage 结束页" min={1} onChange={(event) => setPassageEnd(Number(event.target.value))} type="number" value={passageEnd} /></label></fieldset>
              <fieldset><legend>Questions</legend><label>从<input aria-label="Questions 开始页" min={1} onChange={(event) => setQuestionStart(Number(event.target.value))} type="number" value={questionStart} /></label><label>到<input aria-label="Questions 结束页" min={1} onChange={(event) => setQuestionEnd(Number(event.target.value))} type="number" value={questionEnd} /></label></fieldset>
              <fieldset><legend>Answer Key（可选）</legend><label>从<input aria-label="Answer Key 开始页" min={1} onChange={(event) => setAnswerStart(event.target.value)} type="number" value={answerStart} /></label><label>到<input aria-label="Answer Key 结束页" min={1} onChange={(event) => setAnswerEnd(event.target.value)} type="number" value={answerEnd} /></label></fieldset>
            </div>
            <label>Passage 编号<select aria-label="Passage 编号" onChange={(event) => setPassageNumber(Number(event.target.value))} value={passageNumber}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
            <div className="pdf-actions"><button className="button" onClick={() => setStep("source")} type="button">重新选择</button><button className="button button--primary" disabled={busy} onClick={() => void analyze()} type="button"><ScanText size={16} />{busy ? "正在提取…" : "提取并整理"}</button></div>
          </aside>
        </div>
      )}

      {step === "review" && draft && documentHandle && (
        <section className="pdf-review-panel">
          <div className="pdf-metadata-grid">
            <label>Book title<input onChange={(event) => setBookTitle(event.target.value)} value={bookTitle} /></label>
            <label>Test number<input onChange={(event) => setTestNumber(event.target.value)} value={testNumber} /></label>
            <label>Passage title<input onChange={(event) => setDraft({ ...draft, passageTitle: event.target.value })} value={draft.passageTitle} /></label>
          </div>
          <label className="pdf-passage-editor">Passage 正文<textarea onChange={(event) => setDraft({ ...draft, passageText: event.target.value })} rows={12} value={draft.passageText} /></label>
          <div className="pdf-answer-editor">
            <label>粘贴 Answer Key<textarea onChange={(event) => setAnswerText(event.target.value)} placeholder={'1 FALSE\n2 TRUE\n3 B'} rows={5} value={answerText} /></label>
            <button className="button" onClick={applyAnswers} type="button">按题号应用答案</button>
            {invalidAnswerLines.length > 0 && <div className="error-banner" role="alert">未识别：{invalidAnswerLines.join(" ｜ ")}</div>}
          </div>
          <div className="pdf-question-list">
            <header><h2>识别到 {draft.questions.length} 题</h2><p>不支持的题型会保留原始文本，并在 Reading 中使用通用文本输入。</p></header>
            {draft.questions.map((question, index) => (
              <article className="pdf-question-editor" key={question.localId}>
                <div className="pdf-question-editor__head">
                  <label>题号<input min={1} onChange={(event) => updateQuestion(index, { number: Number(event.target.value) })} type="number" value={question.number} /></label>
                  <label>题型<select onChange={(event) => updateQuestion(index, { type: event.target.value as typeof question.type, needsReview: true })} value={question.type}>{questionTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="pdf-review-check"><input checked={!question.needsReview} onChange={(event) => updateQuestion(index, { needsReview: !event.target.checked })} type="checkbox" /> 已人工复核</label>
                </div>
                <label>题干<textarea onChange={(event) => updateQuestion(index, { prompt: event.target.value })} rows={3} value={question.prompt} /></label>
                <label>选项（每行一项，如 A Option）<textarea onChange={(event) => updateQuestion(index, { options: event.target.value.split(/\r?\n/u) })} rows={3} value={question.options.join("\n")} /></label>
                <label>答案<input onChange={(event) => updateQuestion(index, { answer: event.target.value })} placeholder="可留空，复盘时标为待核对" value={question.answer} /></label>
                <details><summary>原始提取文本 · 页 {question.sourcePages.join(", ")}</summary><pre>{question.rawText}</pre></details>
              </article>
            ))}
          </div>
          <div className="pdf-actions"><button className="button" onClick={() => setStep("pages")} type="button">返回页码</button><button className="button button--primary" disabled={busy} onClick={() => void importPack()} type="button"><Library size={16} />{busy ? "正在导入…" : "导入本地题库"}</button></div>
        </section>
      )}

      {step === "complete" && installedIdentity && (
        <section className="pdf-import-complete">
          <CheckCircle2 aria-hidden="true" size={38} />
          <h2>Reading 题包已导入</h2>
          <p>题包内容通过现有 repository 保存；Web/Vite 使用 IndexedDB，Tauri 将使用工作区与 SQLite。</p>
          <div className="pdf-actions">
            <Link className="button button--primary" to={buildPracticeRoute("reading", { identity: installedIdentity, mode: "study" })}><Play size={16} /> 立即开始练习</Link>
            <Link className="button" to="/library"><Library size={16} /> 返回题库</Link>
            <button className="button button--ghost" onClick={() => setStep("review")} type="button">继续检查导入结果</button>
          </div>
        </section>
      )}
    </main>
  );
}
