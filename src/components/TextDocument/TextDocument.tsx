import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { BookPlus, Highlighter, MessageSquareText, Underline, X } from "lucide-react";
import type { ContentBlock } from "../../domain/pack";
import {
  createTextAnchor,
  segmentTextWithAnnotations,
  type AnnotationStyle,
  type TextAnchor,
} from "../../domain/annotation";
import "./TextDocument.css";
import { VisualBlock } from "../VisualBlock/VisualBlock";
import {
  vocabularySelectionFromAnchor,
  type VocabularyTextSelection,
} from "./vocabularySelection";

export type DisplayAnnotation = {
  id: string;
  anchor: TextAnchor;
  style: AnnotationStyle;
  note?: string | null;
};

export type CreateAnnotationInput = {
  anchor: TextAnchor;
  style: AnnotationStyle;
  note?: string;
};

const styleOptions: Array<{ style: AnnotationStyle; label: string }> = [
  { style: "highlight-yellow", label: "黄色" },
  { style: "highlight-green", label: "绿色" },
  { style: "highlight-blue", label: "蓝色" },
  { style: "highlight-pink", label: "粉色" },
  { style: "underline", label: "下划线" },
];

function offsetInside(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function findBlockElement(node: Node | null): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-content-block-id]") ?? null;
}

function BlockElement({ kind, blockId, children }: { kind: ContentBlock["kind"]; blockId: string; children: ReactNode }) {
  const className = `text-block text-block--${kind}`;
  if (kind === "heading") return <h2 className={className} data-content-block-id={blockId}>{children}</h2>;
  if (kind === "quote") return <blockquote className={className} data-content-block-id={blockId}>{children}</blockquote>;
  return <p className={className} data-content-block-id={blockId}>{children}</p>;
}

function AnnotatedBlock({
  block,
  annotations,
  onDelete,
}: {
  block: ContentBlock;
  annotations: readonly DisplayAnnotation[];
  onDelete: (annotationId: string) => void;
}) {
  const blockAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.anchor.blockId === block.id),
    [annotations, block.id],
  );
  const annotationById = useMemo(
    () => new Map(blockAnnotations.map((annotation) => [annotation.id, annotation])),
    [blockAnnotations],
  );
  const { segments, unresolvedAnnotationIds } = useMemo(
    () => segmentTextWithAnnotations(block.text, blockAnnotations, block.id),
    [block.text, block.id, blockAnnotations],
  );
  return (
    <>
      {block.visual && <VisualBlock visual={block.visual} />}
      <BlockElement blockId={block.id} kind={block.kind}>
        {segments.map((segment) => {
          if (segment.annotationIds.length === 0) {
            return <span key={`${segment.startOffset}-${segment.endOffset}`}>{segment.text}</span>;
          }
          const active = segment.annotationIds
            .map((id) => annotationById.get(id))
            .filter((annotation): annotation is DisplayAnnotation => Boolean(annotation));
          const primary = active.at(-1);
          const classes = ["text-annotation", ...new Set(active.map((annotation) => `text-annotation--${annotation.style}`))];
          const notes = active.map((annotation) => annotation.note).filter(Boolean).join(" · ");
          return (
            <button
              aria-label={`标记文字“${segment.text}”；点击删除${notes ? `；备注：${notes}` : ""}`}
              className={classes.join(" ")}
              key={`${segment.startOffset}-${segment.endOffset}-${segment.annotationIds.join("-")}`}
              onClick={() => {
                if (primary && window.confirm(`删除标记“${primary.anchor.quote}”？`)) {
                  onDelete(primary.id);
                }
              }}
              title={notes || "点击删除标记"}
              type="button"
            >
              {segment.text}
            </button>
          );
        })}
      </BlockElement>
      {unresolvedAnnotationIds.length > 0 && (
        <p className="text-anchor-warning" role="status">
          {unresolvedAnnotationIds.length} 个旧标记无法安全定位，未自动显示。
        </p>
      )}
    </>
  );
}

export function TextDocument({
  blocks,
  annotations,
  onCreateAnnotation,
  onDeleteAnnotation,
  onSaveVocabulary,
  readOnly = false,
}: {
  blocks: readonly ContentBlock[];
  annotations: readonly DisplayAnnotation[];
  onCreateAnnotation: (input: CreateAnnotationInput) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onSaveVocabulary?: (selection: VocabularyTextSelection) => Promise<void>;
  readOnly?: boolean;
}) {
  const [pendingAnchor, setPendingAnchor] = useState<TextAnchor | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("选中同一段落中的文字以添加标记。");
  const [selectionPoint, setSelectionPoint] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [vocabularySaveState, setVocabularySaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const captureSelection = (event: MouseEvent<HTMLElement>) => {
    if (readOnly) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return;
    const startBlock = findBlockElement(selection.anchorNode);
    const endBlock = findBlockElement(selection.focusNode);
    if (!startBlock || !endBlock || startBlock !== endBlock) {
      setPendingAnchor(null);
      setSelectionPoint(null);
      setMessage("一次标记只能位于同一个稳定内容块内，请重新选择。");
      return;
    }

    const blockId = startBlock.dataset.contentBlockId;
    const block = blocks.find((candidate) => candidate.id === blockId);
    if (!block || !blockId) return;

    let start = offsetInside(startBlock, selection.anchorNode, selection.anchorOffset);
    let end = offsetInside(startBlock, selection.focusNode, selection.focusOffset);
    if (start > end) [start, end] = [end, start];
    try {
      const anchor = createTextAnchor(blockId, block.text, start, end);
      const term = anchor.quote.trim();
      if (!/[A-Za-z]/u.test(term) || term.length > 160) {
        setPendingAnchor(null);
        setSelectionPoint(null);
        setMessage("请选择不超过 160 个字符的英文单词或短语。");
        return;
      }
      setPendingAnchor(anchor);
      setSelectionPoint({
        x: Math.min(window.innerWidth - 190, Math.max(12, event.clientX + 8)),
        y: Math.min(window.innerHeight - 56, Math.max(12, event.clientY + 10)),
      });
      setVocabularySaveState("idle");
      setMessage(`已选中“${anchor.quote}”。请选择标记样式。`);
    } catch {
      setPendingAnchor(null);
      setSelectionPoint(null);
      setMessage("没有捕获到可保存的文字选择。");
    }
  };

  const createAnnotation = (style: AnnotationStyle) => {
    if (!pendingAnchor) {
      setMessage("请先选中同一段落中的文字。");
      return;
    }
    onCreateAnnotation({ anchor: pendingAnchor, style, note: note.trim() || undefined });
    setMessage(`已保存“${pendingAnchor.quote}”的标记，两侧相同内容会同步显示。`);
    setPendingAnchor(null);
    setSelectionPoint(null);
    setNote("");
    window.getSelection()?.removeAllRanges();
  };

  const saveVocabulary = async () => {
    if (!pendingAnchor || !onSaveVocabulary) return;
    const block = blocks.find((candidate) => candidate.id === pendingAnchor.blockId);
    if (!block) return;
    setVocabularySaveState("saving");
    try {
      await onSaveVocabulary(vocabularySelectionFromAnchor(block.text, pendingAnchor));
      setVocabularySaveState("saved");
      setMessage(`已将“${pendingAnchor.quote.trim()}”加入生词本。`);
      window.getSelection()?.removeAllRanges();
      window.setTimeout(() => {
        setPendingAnchor(null);
        setSelectionPoint(null);
        setVocabularySaveState("idle");
      }, 900);
    } catch {
      setVocabularySaveState("error");
      setMessage("加入生词本失败，请重试。");
    }
  };

  return (
    <article className="text-document" onMouseUp={captureSelection}>
      {!readOnly && pendingAnchor && selectionPoint && onSaveVocabulary && (
        <div
          className={`selection-popover selection-popover--${vocabularySaveState}`}
          onMouseUp={(event) => event.stopPropagation()}
          role="toolbar"
          style={{ left: selectionPoint.x, top: selectionPoint.y }}
        >
          <button
            disabled={vocabularySaveState === "saving" || vocabularySaveState === "saved"}
            onClick={() => void saveVocabulary()}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <BookPlus aria-hidden="true" size={14} />
            {vocabularySaveState === "saving" ? "保存中…" : vocabularySaveState === "saved" ? "已加入" : "加入生词本"}
          </button>
          <button
            aria-label="关闭选词操作"
            className="selection-popover__close"
            onClick={() => { setPendingAnchor(null); setSelectionPoint(null); window.getSelection()?.removeAllRanges(); }}
            type="button"
          ><X aria-hidden="true" size={13} /></button>
        </div>
      )}
      {!readOnly && (
        <div className="annotation-toolbar" onMouseUp={(event) => event.stopPropagation()}>
          <div className="annotation-toolbar__styles" aria-label="文字标记样式" role="group">
            {styleOptions.map(({ style, label }) => (
              <button
                aria-label={`添加${label}${style === "underline" ? "标记" : "高亮"}`}
                className={`annotation-style annotation-style--${style}`}
                key={style}
                onClick={() => createAnnotation(style)}
                title={label}
                type="button"
              >
                {style === "underline" ? <Underline aria-hidden="true" size={15} /> : <Highlighter aria-hidden="true" size={15} />}
                <span>{label}</span>
              </button>
            ))}
          </div>
          <label className="annotation-note">
            <MessageSquareText aria-hidden="true" size={15} />
            <span className="sr-only">标记备注（可选）</span>
            <input
              aria-label="标记备注（可选）"
              maxLength={160}
              onChange={(event) => setNote(event.target.value)}
              onMouseUp={(event) => event.stopPropagation()}
              placeholder="可选备注"
              type="text"
              value={note}
            />
          </label>
          <span aria-live="polite" className="annotation-toolbar__message">{message}</span>
        </div>
      )}
      <div className="text-document__content">
        {blocks.map((block) => (
          <AnnotatedBlock
            annotations={annotations}
            block={block}
            key={block.id}
            onDelete={onDeleteAnnotation}
          />
        ))}
      </div>
    </article>
  );
}
