import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
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
import type { SaveState } from "../../components/common/SaveStatus";
import { buildPracticeRoute } from "../practice/practiceRoute";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { closeCurrentWindow, listenForCloseRequested } from "../../infrastructure/window/windowClose";
import { BrowserPdfSourceAdapter } from "./BrowserPdfSourceAdapter";
import { TauriPdfSourceAdapter } from "./TauriPdfSourceAdapter";
import { isTauriRuntime } from "../../infrastructure/repositories/runtime";
import {
  browserFileSource,
  type DocumentSourceAdapter,
  type PdfBinarySource,
  type PdfDocumentHandle,
} from "./documentSource";
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
import { StructuredImportEditor } from "./StructuredImportEditor";
import {
  buildStructuredReadingPack,
  createStructuredImportDraft,
  discardStructuredImportDraft,
  findImportedSourceDuplicate,
  loadStructuredImportDrafts,
  saveStructuredImportDraft,
  touchStructuredDraft,
  verifyStructuredDraftSource,
  type StructuredImportDraft,
} from "./structuredImportModel";
import "./pdf-import.css";

type ImportStep = "source" | "pages" | "review" | "complete";
type ImportMode = "simple" | "structured";

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

function createDefaultAdapter(): DocumentSourceAdapter {
  return isTauriRuntime() ? new TauriPdfSourceAdapter() : new BrowserPdfSourceAdapter();
}

export function PdfImportPage({ adapter = createDefaultAdapter() }: PdfImportPageProps) {
  const repository = useWorkbenchStore((state) => state.repository);
  const installImportedPack = useWorkbenchStore((state) => state.installImportedPack);
  const [step, setStep] = useState<ImportStep>("source");
  const [mode, setMode] = useState<ImportMode>("simple");
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
  const [structuredDraft, setStructuredDraft] = useState<StructuredImportDraft | null>(null);
  const [savedStructuredDrafts, setSavedStructuredDrafts] = useState<readonly StructuredImportDraft[]>([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<SaveState>("idle");
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
  const structuredDraftRef = useRef<StructuredImportDraft | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSavedDraftJsonRef = useRef<string | null>(null);
  const allowCloseRef = useRef(false);
  const structuredInstallLockRef = useRef(false);

  const passageRange = rangeFrom(passageStart, passageEnd);
  const questionRange = rangeFrom(questionStart, questionEnd);
  const answerRange = answerStart && answerEnd ? rangeFrom(Number(answerStart), Number(answerEnd)) : undefined;

  useEffect(() => () => { void documentHandleRef.current?.destroy(); }, []);

  useEffect(() => {
    let active = true;
    void loadStructuredImportDrafts(repository).then((restored) => {
      if (!active) return;
      setSavedStructuredDrafts(restored);
      setDraftsLoaded(true);
    }).catch((nextError: unknown) => {
      if (!active) return;
      setError(`读取结构化导入草稿失败：${errorMessage(nextError)}`);
      setDraftsLoaded(true);
    });
    return () => { active = false; };
  }, [repository]);

  const persistStructuredDraft = useCallback(async (): Promise<void> => {
    const current = structuredDraftRef.current;
    if (!current || !draftsLoaded) return;
    const serialized = JSON.stringify(current);
    if (serialized === lastSavedDraftJsonRef.current) {
      setDraftSaveState("saved");
      return;
    }
    setDraftSaveState("saving");
    const operation = draftWriteQueueRef.current.then(async () => {
      await saveStructuredImportDraft(repository, current);
      lastSavedDraftJsonRef.current = serialized;
      setSavedStructuredDrafts(await loadStructuredImportDrafts(repository));
    });
    draftWriteQueueRef.current = operation.catch(() => undefined);
    try {
      await operation;
      setDraftSaveState("saved");
    } catch (nextError) {
      setDraftSaveState("error");
      throw nextError;
    }
  }, [draftsLoaded, repository]);

  const flushStructuredDraft = useCallback(async (): Promise<void> => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    await persistStructuredDraft();
    await draftWriteQueueRef.current;
  }, [persistStructuredDraft]);

  useEffect(() => {
    structuredDraftRef.current = structuredDraft;
    if (!structuredDraft || !draftsLoaded) return;
    setDraftSaveState("saving");
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      void persistStructuredDraft().catch((nextError: unknown) => setError(`草稿保存失败：${errorMessage(nextError)}`));
    }, 450);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    };
  }, [draftsLoaded, persistStructuredDraft, structuredDraft]);

  useEffect(() => {
    let active = true;
    let unlisten: () => void = () => undefined;
    void listenForCloseRequested((event) => {
      if (allowCloseRef.current || !structuredDraftRef.current) return;
      event.preventDefault();
      void flushStructuredDraft().then(async () => {
        allowCloseRef.current = true;
        await closeCurrentWindow();
      }).catch((nextError: unknown) => {
        if (!active) return;
        setDraftSaveState("error");
        setError(`关闭前保存草稿失败：${errorMessage(nextError)}`);
        if (window.confirm("结构化导入草稿保存失败。是否放弃本次未保存的更改并退出？")) {
          allowCloseRef.current = true;
          void closeCurrentWindow();
        }
      });
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    }).catch((nextError: unknown) => {
      if (active) setError(`注册关闭保存失败：${errorMessage(nextError)}`);
    });
    return () => { active = false; unlisten(); };
  }, [flushStructuredDraft]);

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

  const openSource = async (source: PdfBinarySource) => {
    const validation = validatePdfFile({ name: source.name, size: source.size, type: source.mimeType });
    setError(validation.error ?? null);
    setWarning(validation.warning ?? null);
    if (!validation.valid) return;
    setBusy(true);
    try {
      const nextDocument = await adapter.open(source);
      const previousDocument = documentHandleRef.current;
      documentHandleRef.current = nextDocument;
      setDocumentHandle(nextDocument);
      await previousDocument?.destroy();
      setCurrentPage(1);
      setPassageStart(1);
      setPassageEnd(mode === "structured" ? nextDocument.pageCount : 1);
      setQuestionStart(Math.min(2, nextDocument.pageCount));
      setQuestionEnd(Math.min(2, nextDocument.pageCount));
      setAnswerStart("");
      setAnswerEnd("");
      setBookTitle(source.name.replace(/\.pdf$/iu, "") || "Local Reading PDF");
      setDraft(null);
      setStructuredDraft(null);
      structuredDraftRef.current = null;
      lastSavedDraftJsonRef.current = null;
      setInstalledIdentity(null);
      setStep("pages");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (file: File) => openSource(browserFileSource(file));

  const selectPdf = async () => {
    if (!adapter.selectSource) {
      fileInputRef.current?.click();
      return;
    }
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const source = await adapter.selectSource();
      if (source) await openSource(source);
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
    const errors = (mode === "structured" ? [
      validatePageRange(passageRange, documentHandle.pageCount, "来源页码"),
      answerRange ? validatePageRange(answerRange, documentHandle.pageCount, "Answer Key 页码") : null,
    ] : [
      validatePageRange(passageRange, documentHandle.pageCount, "Passage 页码"),
      validatePageRange(questionRange, documentHandle.pageCount, "Questions 页码"),
      answerRange ? validatePageRange(answerRange, documentHandle.pageCount, "Answer Key 页码") : null,
    ]).filter(Boolean);
    if (errors.length > 0) {
      setError(errors.join(" "));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "structured") {
        const existingDraft = (await loadStructuredImportDrafts(repository)).find(
          (item) => item.source.sourceSha256 === documentHandle.sourceSha256,
        );
        if (existingDraft) {
          restoreStructuredDraft(existingDraft);
          setWarning(`该 PDF 已有结构化草稿，已恢复而未创建或覆盖新草稿：${existingDraft.id}。`);
          return;
        }
        const [sourcePages, answerPages] = await Promise.all([
          extractRange(documentHandle, passageRange),
          answerRange ? extractRange(documentHandle, answerRange) : Promise.resolve([]),
        ]);
        if (!sourcePages.some((page) => page.text.trim())) {
          throw new Error("所选来源页没有原生文本层。请更换文本版 PDF；本轮不启用 OCR。");
        }
        const nextDraft = createStructuredImportDraft({
          fileName: documentHandle.fileName,
          fileSize: documentHandle.fileSize,
          sourceSha256: documentHandle.sourceSha256,
          pageCount: documentHandle.pageCount,
          pages: sourcePages,
        });
        const withAnswers = answerPages.length > 0
          ? touchStructuredDraft(nextDraft, { answerKeyText: answerPages.map((page) => page.text).join("\n") })
          : nextDraft;
        structuredDraftRef.current = withAnswers;
        setStructuredDraft(withAnswers);
        setDraftSaveState("saving");
        await saveStructuredImportDraft(repository, withAnswers);
        lastSavedDraftJsonRef.current = JSON.stringify(withAnswers);
        setSavedStructuredDrafts(await loadStructuredImportDrafts(repository));
        setDraftSaveState("saved");
        setStep("review");
        return;
      }
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

  const restoreStructuredDraft = (restored: StructuredImportDraft) => {
    setMode("structured");
    setDraft(null);
    setStructuredDraft(restored);
    structuredDraftRef.current = restored;
    lastSavedDraftJsonRef.current = JSON.stringify(restored);
    setDraftSaveState("saved");
    setInstalledIdentity(null);
    setStep("review");
    setError(null);
    setWarning("已从工作区恢复结构化草稿。原 PDF 未重新读取；如需核验来源，请使用“重选并核验来源”。");
  };

  const reselectStructuredSource = async () => {
    if (!structuredDraft) return;
    if (!adapter.selectSource) {
      setError("当前浏览器预览无法为已恢复草稿重新绑定原文件；桌面版可使用原生文件对话框并核对 SHA-256。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const source = await adapter.selectSource();
      if (!source) return;
      const nextDocument = await adapter.open(source);
      const verificationError = verifyStructuredDraftSource(structuredDraft, nextDocument);
      if (verificationError) {
        await nextDocument.destroy();
        throw new Error(`${verificationError} 草稿未被覆盖。`);
      }
      const previous = documentHandleRef.current;
      documentHandleRef.current = nextDocument;
      setDocumentHandle(nextDocument);
      await previous?.destroy();
      setWarning("来源文件 SHA-256 核验通过；草稿中的文本快照和稳定 ID 保持不变。");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const keepStructuredDraftAndExit = async () => {
    setBusy(true);
    setError(null);
    try {
      await flushStructuredDraft();
      setStructuredDraft(null);
      structuredDraftRef.current = null;
      setStep("source");
      setWarning("结构化草稿已保留在当前工作区，可从下方列表继续。");
    } catch (nextError) {
      setDraftSaveState("error");
      setError(`草稿保存失败，仍停留在编辑器：${errorMessage(nextError)}`);
    } finally {
      setBusy(false);
    }
  };

  const discardCurrentStructuredDraft = async () => {
    if (!structuredDraft) return;
    if (!window.confirm("只删除这份未安装的结构化导入草稿？来源 PDF、已安装题包和学习数据都不会删除。")) return;
    setBusy(true);
    setError(null);
    try {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
      await draftWriteQueueRef.current;
      await discardStructuredImportDraft(repository, structuredDraft.id);
      setSavedStructuredDrafts(await loadStructuredImportDrafts(repository));
      setStructuredDraft(null);
      structuredDraftRef.current = null;
      lastSavedDraftJsonRef.current = null;
      setStep("source");
      setWarning("该结构化草稿已明确丢弃；未删除原 PDF 或任何已安装题包。");
    } catch (nextError) {
      setError(`丢弃草稿失败：${errorMessage(nextError)}`);
    } finally {
      setBusy(false);
    }
  };

  const installStructuredPack = async () => {
    if (!structuredDraft || structuredInstallLockRef.current) return;
    structuredInstallLockRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await flushStructuredDraft();
      const sourceDuplicate = await findImportedSourceDuplicate(repository, structuredDraft.source.sourceSha256);
      if (sourceDuplicate) {
        throw new Error(`该 PDF 来源已导入为“${sourceDuplicate.manifest.title}”（${sourceDuplicate.manifest.id}）。没有覆盖或创建部分题包。`);
      }
      const packIdConflict = await repository.loadPack(structuredDraft.packId);
      if (packIdConflict) {
        throw new Error(`Pack ID ${structuredDraft.packId} 已存在。来源去重与 Pack ID 冲突已分别检查；没有覆盖现有题包。`);
      }
      const pack = await buildStructuredReadingPack(structuredDraft);
      await installImportedPack(pack);
      const installedDraft = touchStructuredDraft(structuredDraft, { installedPackId: pack.manifest.id });
      structuredDraftRef.current = installedDraft;
      setStructuredDraft(installedDraft);
      await saveStructuredImportDraft(repository, installedDraft);
      lastSavedDraftJsonRef.current = JSON.stringify(installedDraft);
      setSavedStructuredDrafts(await loadStructuredImportDrafts(repository));
      setInstalledIdentity({ packId: pack.manifest.id, testId: pack.manifest.tests[0].id });
      setDraftSaveState("saved");
      setStep("complete");
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      structuredInstallLockRef.current = false;
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
            onDragEnter={adapter.selectSource ? undefined : (event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={adapter.selectSource ? undefined : () => setDragActive(false)}
            onDragOver={adapter.selectSource ? undefined : (event) => event.preventDefault()}
            onDrop={adapter.selectSource ? undefined : handleDrop}
          >
            <FileUp aria-hidden="true" size={36} />
            <h2>选择一个本地 PDF</h2>
            <p>{adapter.selectSource
              ? "使用 Windows 文件对话框选择；Rust 只读取本次明确选择的 PDF，不会上传或保留原文件副本。"
              : "支持文件选择或拖放。文件只在本机解析，不会上传；大于 50 MB 会提示。"}</p>
            {!adapter.selectSource && <input
              accept="application/pdf,.pdf"
              aria-label="选择本地 PDF"
              hidden
              onChange={(event) => { const file = event.target.files?.[0]; if (file) void openFile(file); }}
              ref={fileInputRef}
              type="file"
            />}
            <button className="button button--primary" disabled={busy} onClick={() => void selectPdf()} type="button">
              {busy ? "正在读取…" : "选择 PDF"}
            </button>
          </div>
          <div className="pdf-saved-drafts">
            <header><div><h2>结构化导入草稿</h2><p>草稿保存在当前工作区，与正式题包分开；恢复不会重新读取源 PDF。</p></div><span>{draftsLoaded ? `${savedStructuredDrafts.length} 份` : "正在读取…"}</span></header>
            {draftsLoaded && savedStructuredDrafts.length === 0 && <p>暂无可恢复草稿。</p>}
            {savedStructuredDrafts.map((restored) => (
              <article key={restored.id}>
                <div><strong>{restored.bookTitle || restored.source.fileName}</strong><span>{restored.passages.length} Passage · 更新于 {new Date(restored.updatedAt).toLocaleString()} · {restored.installedPackId ? `已安装 ${restored.installedPackId}` : "未安装"}</span></div>
                <button className="button" onClick={() => restoreStructuredDraft(restored)} type="button">继续编辑</button>
              </article>
            ))}
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
            <h2>选择导入方式与页码</h2>
            <div className="pdf-mode-choice" role="radiogroup" aria-label="PDF 导入方式">
              <label><input checked={mode === "structured"} onChange={() => { setMode("structured"); setPassageStart(1); setPassageEnd(documentHandle.pageCount); }} type="radio" />多 Passage / 多题组（人工确认）</label>
              <label><input checked={mode === "simple"} onChange={() => setMode("simple")} type="radio" />简单单 Passage（保留原流程）</label>
            </div>
            <p>以下均为 PDF 阅读器中看到的 1-based 页序号，包含起止页。结构化模式会保存所选页文本快照，再由你逐片段分配。</p>
            <div className="pdf-range-grid">
              <fieldset><legend>{mode === "structured" ? "全部来源页" : "Passage"}</legend><label>从<input aria-label={mode === "structured" ? "来源开始页" : "Passage 开始页"} min={1} onChange={(event) => setPassageStart(Number(event.target.value))} type="number" value={passageStart} /></label><label>到<input aria-label={mode === "structured" ? "来源结束页" : "Passage 结束页"} min={1} onChange={(event) => setPassageEnd(Number(event.target.value))} type="number" value={passageEnd} /></label></fieldset>
              {mode === "simple" && <fieldset><legend>Questions</legend><label>从<input aria-label="Questions 开始页" min={1} onChange={(event) => setQuestionStart(Number(event.target.value))} type="number" value={questionStart} /></label><label>到<input aria-label="Questions 结束页" min={1} onChange={(event) => setQuestionEnd(Number(event.target.value))} type="number" value={questionEnd} /></label></fieldset>}
              <fieldset><legend>Answer Key（可选）</legend><label>从<input aria-label="Answer Key 开始页" min={1} onChange={(event) => setAnswerStart(event.target.value)} type="number" value={answerStart} /></label><label>到<input aria-label="Answer Key 结束页" min={1} onChange={(event) => setAnswerEnd(event.target.value)} type="number" value={answerEnd} /></label></fieldset>
            </div>
            {mode === "simple" && <label>Passage 编号<select aria-label="Passage 编号" onChange={(event) => setPassageNumber(Number(event.target.value))} value={passageNumber}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>}
            <div className="pdf-actions"><button className="button" onClick={() => setStep("source")} type="button">重新选择</button><button className="button button--primary" disabled={busy} onClick={() => void analyze()} type="button"><ScanText size={16} />{busy ? "正在提取…" : "提取并整理"}</button></div>
          </aside>
        </div>
      )}

      {step === "review" && mode === "simple" && draft && documentHandle && (
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

      {step === "review" && mode === "structured" && structuredDraft && (
        <StructuredImportEditor
          busy={busy}
          draft={structuredDraft}
          onChange={(nextDraft) => {
            structuredDraftRef.current = nextDraft;
            setStructuredDraft(nextDraft);
          }}
          onDiscard={() => void discardCurrentStructuredDraft()}
          onInstall={() => void installStructuredPack()}
          onKeepDraftAndExit={() => void keepStructuredDraftAndExit()}
          onReselectSource={() => void reselectStructuredSource()}
          saveState={draftSaveState}
          sourceConnected={documentHandle?.sourceSha256 === structuredDraft.source.sourceSha256}
        />
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
