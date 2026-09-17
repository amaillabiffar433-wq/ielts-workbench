import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { VisualSource } from "../../domain/pack";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { confirmAction } from "../../infrastructure/window/windowClose";
import type { PdfDocumentHandle } from "./documentSource";
import { replaceDraftOptions, touchStructuredDraft, type StructuredImportDraft, type SupportedImportQuestionType } from "./structuredImportModel";
import { addQuickQuestions, appendVisual, cropFromPoints, fullPageCrop, type PdfCrop } from "./visualImportModel";
import "./PdfRegionEditor.css";
import { recognizeLocalEnglish } from "./localOcr";

async function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer>> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("截图编码失败。")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

export function PdfRegionEditor({ draft, documentHandle, onChange, onPendingSave }: {
  readonly onPendingSave?: (promise: Promise<void>) => void;
  readonly draft: StructuredImportDraft;
  readonly documentHandle: PdfDocumentHandle | null;
  readonly onChange: (draft: StructuredImportDraft) => void;
}) {
  const repository = useWorkbenchStore((state) => state.repository);
  const [page, setPage] = useState(draft.source.pages[0]?.pageNumber ?? 1);
  const [zoom, setZoom] = useState(100);
  const [crop, setCrop] = useState<PdfCrop>(fullPageCrop);
  const [target, setTarget] = useState(draft.editorState.activeGroupId ?? draft.passages[0]?.id ?? "");
  const [replaceId, setReplaceId] = useState("");
  const [kind, setKind] = useState<VisualSource["type"]>("snapshot");
  const [alt, setAlt] = useState("原版区域");
  const [text, setText] = useState("");
  const [ocrText, setOcrText] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [loadedPage, setLoadedPage] = useState(0);
  const [questionRange, setQuestionRange] = useState("14-19");
  const [questionType, setQuestionType] = useState<SupportedImportQuestionType>("short-answer");
  const [optionRange, setOptionRange] = useState("A-J");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelsRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef({ draft, onChange });
  const ocrController = useRef<AbortController | null>(null);
  useEffect(() => () => { ocrController.current?.abort(); }, []);
  useEffect(() => { latest.current = { draft, onChange }; }, [draft, onChange]);
  const connected = documentHandle?.sourceSha256 === draft.source.sourceSha256;
  const groups = draft.passages.flatMap((passage) => passage.questionGroups);
  const targetPassage = draft.passages.find((passage) => passage.id === target);
  const targetGroup = groups.find((group) => group.id === target);
  const replaceable = targetPassage ? targetPassage.contentBlocks.filter((block) => block.visual)
    : targetGroup?.contextBlocks.filter((block) => "assetId" in block) ?? [];

  useEffect(() => {
    if (!documentHandle || !connected) return;
    let cancelled = false;
    const draw = async () => {
      const pixels = document.createElement("canvas");
      await documentHandle.renderPage(page, pixels, 2000);
      const extracted = await documentHandle.extractPage(page);
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = pixels.width; canvas.height = pixels.height;
      canvas.getContext("2d")?.drawImage(pixels, 0, 0);
      pixelsRef.current = pixels;
      setLoadedPage(page);
      setText(extracted.text);
      setOcrText(false);
      setMessage(extracted.layout?.message ?? (extracted.text.replace(/\s/gu, "").length < 40 ? "此页可能为扫描页面：可使用原版区域，或执行本地 OCR。" : "拖动框选；截图不会改变题目和题组 ID。"));
    };
    void draw().catch((error: unknown) => { if (!cancelled) setMessage(String(error)); });
    return () => { cancelled = true; };
  }, [connected, documentHandle, page]);

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };
  const regionCanvas = () => {
    const source = pixelsRef.current;
    if (!source || loadedPage !== page) throw new Error("请等待所选 PDF 页完成渲染。");
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(source.width * crop.width));
    output.height = Math.max(1, Math.round(source.height * crop.height));
    output.getContext("2d")?.drawImage(source, source.width * crop.x, source.height * crop.y, source.width * crop.width, source.height * crop.height, 0, 0, output.width, output.height);
    return output;
  };
  const saveRegion = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (ocrText && text.length > 20000) throw new Error("识别文字超过单块 20000 字符；请缩小区域或取消附带文字后保存原图。");
      const asset = await repository.saveImportImage(draft.id, await pngBytes(regionCanvas()));
      const current = latest.current;
      if (current.draft.id !== draft.id) return;
      const visual: VisualSource = { type: kind, assetId: asset.id, altText: alt.trim() || "原版区域", sourcePage: page, crop, ...(ocrText && text.trim() ? { ocrText: text.trim().slice(0, 20000) } : {}) };
      let next = appendVisual(current.draft, target, asset, visual);
      if (replaceId) {
        // Keep the old logical block and its editable OCR text; only replace image provenance.
        const oldExists = replaceable.some((block) => block.id === replaceId);
        if (!oldExists) throw new Error("要替换的原版区域已不存在。");
        next = touchStructuredDraft(current.draft, { imageAssets: next.imageAssets,
          passages: current.draft.passages.map((passage) => ({ ...passage,
            contentBlocks: passage.contentBlocks.map((block) => block.id === replaceId ? { ...block, visual } : block),
            questionGroups: passage.questionGroups.map((group) => ({ ...group, contextBlocks: group.contextBlocks.map((block) => block.id === replaceId && "assetId" in block ? { ...block, ...visual } : block) })),
          })),
        });
      }
      current.onChange(next);
      setMessage(`原版区域已保存到工作区（${asset.width} × ${asset.height}）；请核对所属题组。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); throw error; }
    finally { setBusy(false); }
  };
  const changePage = (next: number) => { setPage(next); setCrop(fullPageCrop); };
  const runOcr = async (wholePage: boolean) => {
    if (busy || !pixelsRef.current || loadedPage !== page) return;
    setBusy(true);
    const controller = new AbortController(); ocrController.current = controller;
    setOcrBusy(true);
    try {
      const result = await recognizeLocalEnglish(wholePage ? pixelsRef.current : regionCanvas(), controller.signal, setMessage);
      if (!controller.signal.aborted) {
        setText(result.text); setOcrText(true);
        setMessage(`本地 OCR 完成，置信度 ${Math.round(result.confidence)}%。请展开下方文字校对；不会自动填写答案。${result.confidence < 70 ? " 识别不可靠时请保留原图。" : ""}`);
      }
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); setOcrBusy(false); ocrController.current = null; }
  };
  return <section className="pdf-region-editor" aria-label="原版区域与快速导入">
    <h3>使用原版区域 · 快速作答框</h3>
    <p>复杂表格、地图、流程图保留原图。输入框在题组下方，无需重建排版。</p>
    <fieldset disabled={busy}>
      <label>插入到<select value={target} onChange={(event) => { setTarget(event.target.value); setReplaceId(""); }}>
        <option value="" disabled>请选择 Passage / 题组</option>
        {draft.passages.map((passage) => <optgroup key={passage.id} label={passage.title}>
          <option value={passage.id}>{passage.title} 正文</option>
          {passage.questionGroups.map((group) => <option key={group.id} value={group.id}>{group.title || group.id} · 题组</option>)}
        </optgroup>)}
      </select></label>
      <label>区域类型<select value={kind} onChange={(event) => setKind(event.target.value as VisualSource["type"])}><option value="snapshot">原版 Snapshot / 表格</option><option value="figure">Figure / 地图 / 流程图</option><option value="image">Image / 图片</option></select></label>
      <label>图片说明<input maxLength={1000} value={alt} onChange={(event) => setAlt(event.target.value)} /></label>
      <label>添加 / 重新框选<select value={replaceId} onChange={(event) => setReplaceId(event.target.value)}><option value="">新增区域</option>{replaceable.map((block) => <option key={block.id} value={block.id}>替换 {block.id}</option>)}</select></label>
      <div className="pdf-actions">
        <button type="button" disabled={page <= 1 || !connected} onClick={() => changePage(page - 1)}>上一页</button>
        <label>PDF 页<select value={page} onChange={(event) => changePage(Number(event.target.value))}>{Array.from({ length: draft.source.pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
        <button type="button" disabled={page >= draft.source.pageCount || !connected} onClick={() => changePage(page + 1)}>下一页</button>
        <label>缩放<select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>{[100, 150, 200].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label>
        <button type="button" onClick={() => setCrop(fullPageCrop)}>整页 / 取消框选</button>
        <button type="button" onClick={() => setCrop({ x: 0, y: 0, width: 0.5, height: 1 })}>左栏</button>
        <button type="button" onClick={() => setCrop({ x: 0.5, y: 0, width: 0.5, height: 1 })}>右栏</button>
      </div>
      {connected ? <div className="pdf-region-scroll"><div className="pdf-region-canvas" style={{ width: `${zoom}%` }}
        onPointerDown={(event) => { if (busy || event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = point(event); }}
        onPointerMove={(event) => { if (dragRef.current) { const next = cropFromPoints(dragRef.current, point(event)); if (next) setCrop(next); } }}
        onPointerUp={(event) => { if (dragRef.current) { const next = cropFromPoints(dragRef.current, point(event)); if (next) setCrop(next); } dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}>
        <canvas ref={canvasRef} aria-label={`PDF 第 ${page} 页框选画布`} />
        <div className="pdf-region-selection" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />
      </div></div> : <p>请重新连接并核验 PDF 来源，已保存的区域仍可编辑。</p>}
      <button className="button button--primary" type="button" disabled={!connected || loadedPage !== page || !target} onClick={() => { const promise = saveRegion(); onPendingSave?.(promise); void promise.catch(() => undefined); }}>{busy ? "保存中…" : "作为原版区域"}</button>
      <div className="pdf-actions"><button type="button" disabled={!connected || loadedPage !== page} onClick={() => void runOcr(true)}>OCR 此页</button><button type="button" disabled={!connected || loadedPage !== page} onClick={() => void runOcr(false)}>OCR 所选区域</button></div>
      <button type="button" disabled={!connected || !documentHandle?.extractRegion || loadedPage !== page} onClick={async () => {
        setBusy(true);
        try { setText(await documentHandle!.extractRegion!(page, crop)); setOcrText(true); setMessage("已按所选栏/区域提取文字；请在下方校对后追加。空结果可改用 OCR。"); }
        catch (error) { setMessage(String(error)); } finally { setBusy(false); }
      }}>提取所选区域文字</button>
      <label><input type="checkbox" checked={ocrText} onChange={(event) => setOcrText(event.target.checked)} />将校对文字附在截图中（最多 20000 字符）</label>
      <details><summary>提取文字（可校对；追加或保存区域后进入草稿）</summary><textarea aria-label="区域提取文字" rows={8} value={text} onChange={(event) => setText(event.target.value)} />
        <button type="button" disabled={!text.trim() || (!targetPassage && !targetGroup)} onClick={() => {
          const chunks = text.match(/[\s\S]{1,4000}/gu) ?? [];
          if (targetGroup && targetGroup.contextBlocks.length + chunks.length > 32) { setMessage("题组最多 32 个上下文块，请减少文字或保留原图。"); return; }
          onChange(touchStructuredDraft(draft, { passages: draft.passages.map((passage) => ({ ...passage,
            contentBlocks: passage.id === target ? [...passage.contentBlocks, { id: `content-${crypto.randomUUID()}`, text, sourcePages: [page] }] : passage.contentBlocks,
            questionGroups: passage.questionGroups.map((group) => group.id === target ? { ...group, contextBlocks: [...group.contextBlocks, ...chunks.map((chunk) => ({ id: `context-${crypto.randomUUID()}`, type: "paragraph" as const, text: chunk }))] } : group),
          })) }));
        }}>追加校对文字到所选位置</button>
      </details>
      <div className="pdf-actions"><label>批量题号范围<input value={questionRange} onChange={(event) => setQuestionRange(event.target.value)} /></label>
        <label>答案控件<select value={questionType} onChange={(event) => setQuestionType(event.target.value as SupportedImportQuestionType)}>
          <option value="short-answer">Text / 图表、简答、填词</option><option value="true-false-not-given">TRUE / FALSE / NOT GIVEN</option><option value="yes-no-not-given">YES / NO / NOT GIVEN</option><option value="single-choice">单选</option><option value="multiple-choice">多选</option><option value="matching">匹配 / 标号</option><option value="fill-blank">句子填空</option>
        </select></label>
        <button type="button" disabled={!targetGroup} onClick={() => { try { onChange(addQuickQuestions(draft, target, questionRange, questionType)); setMessage("作答框已创建。请在题组设置共享选项、字数限制及答案 Key。"); } catch (error) { setMessage(String(error)); } }}>创建题组作答框</button>
      </div>
      <div className="pdf-actions"><label>批量选项字母<input value={optionRange} onChange={(event) => setOptionRange(event.target.value)} /></label><button type="button" disabled={!targetGroup} onClick={async () => {
        const match = /^\s*([A-Z])\s*[-–—]\s*([A-Z])\s*$/u.exec(optionRange.toUpperCase());
        if (!match || match[2] <= match[1]) { setMessage("请输入如 A-J 的连续选项字母范围。"); return; }
        if (targetGroup!.sharedOptions.length && !(await confirmAction("替换该题组现有共享选项？请核对选项和答案映射。"))) return;
        const labels = Array.from({ length: match[2].charCodeAt(0) - match[1].charCodeAt(0) + 1 }, (_, index) => String.fromCharCode(match[1].charCodeAt(0) + index));
        onChange(touchStructuredDraft(draft, { passages: draft.passages.map((passage) => ({ ...passage, questionGroups: passage.questionGroups.map((group) => group.id === target ? { ...group, sharedOptions: replaceDraftOptions(group.sharedOptions, labels.map((label) => `${label} ${label} (see original context)`).join("\n")) } : group) })) }));
        setMessage("题组共享选项已生成；原图中的具体选项文字需保持可见。");
      }}>设置题组共享选项</button></div>
    </fieldset>
    {ocrBusy && <button type="button" onClick={() => ocrController.current?.abort()}>取消 OCR</button>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
