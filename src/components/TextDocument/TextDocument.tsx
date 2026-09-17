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
import { confirmAction } from "../../infrastructure/window/windowClose";

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
  { style: "highlight-yellow", label: "Yellow" },
  { style: "highlight-green", label: "Green" },
  { style: "highlight-blue", label: "Blue" },
  { style: "highlight-pink", label: "Pink" },
  { style: "underline", label: "Underline" },
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
              aria-label={`Annotated text “${segment.text}”; click to delete${notes ? `; note: ${notes}` : ""}`}
              className={classes.join(" ")}
              key={`${segment.startOffset}-${segment.endOffset}-${segment.annotationIds.join("-")}`}
              onClick={async () => {
                if (primary && await confirmAction(`Delete the annotation “${primary.anchor.quote}”?`)) {
                  onDelete(primary.id);
                }
              }}
              title={notes || "Click to delete annotation"}
              type="button"
            >
              {segment.text}
            </button>
          );
        })}
      </BlockElement>
      {unresolvedAnnotationIds.length > 0 && (
        <p className="text-anchor-warning" role="status">
          {unresolvedAnnotationIds.length} older annotation{unresolvedAnnotationIds.length === 1 ? "" : "s"} could not be located safely and are hidden.
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
  const [message, setMessage] = useState("Select text within one paragraph to add an annotation.");
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
      setMessage("One annotation must stay within a single stable content block. Select again.");
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
        setMessage("Select an English word or phrase no longer than 160 characters.");
        return;
      }
      setPendingAnchor(anchor);
      setSelectionPoint({
        x: Math.min(window.innerWidth - 190, Math.max(12, event.clientX + 8)),
        y: Math.min(window.innerHeight - 56, Math.max(12, event.clientY + 10)),
      });
      setVocabularySaveState("idle");
      setMessage(`Selected “${anchor.quote}”. Choose an annotation style.`);
    } catch {
      setPendingAnchor(null);
      setSelectionPoint(null);
      setMessage("No savable text selection was captured.");
    }
  };

  const createAnnotation = (style: AnnotationStyle) => {
    if (!pendingAnchor) {
      setMessage("First select text within one paragraph.");
      return;
    }
    onCreateAnnotation({ anchor: pendingAnchor, style, note: note.trim() || undefined });
    setMessage(`Saved the annotation for “${pendingAnchor.quote}”; matching content in both panes updates together.`);
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
      setMessage(`Added “${pendingAnchor.quote.trim()}” to Vocabulary.`);
      window.getSelection()?.removeAllRanges();
      window.setTimeout(() => {
        setPendingAnchor(null);
        setSelectionPoint(null);
        setVocabularySaveState("idle");
      }, 900);
    } catch {
      setVocabularySaveState("error");
      setMessage("Could not add the selection to Vocabulary. Try again.");
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
            {vocabularySaveState === "saving" ? "Saving…" : vocabularySaveState === "saved" ? "Added" : "Add to Vocabulary"}
          </button>
          <button
            aria-label="Close selection actions"
            className="selection-popover__close"
            onClick={() => { setPendingAnchor(null); setSelectionPoint(null); window.getSelection()?.removeAllRanges(); }}
            type="button"
          ><X aria-hidden="true" size={13} /></button>
        </div>
      )}
      {!readOnly && (
        <div className="annotation-toolbar" onMouseUp={(event) => event.stopPropagation()}>
          <div className="annotation-toolbar__styles" aria-label="Text annotation styles" role="group">
            {styleOptions.map(({ style, label }) => (
              <button
                aria-label={`Add ${label.toLowerCase()} ${style === "underline" ? "annotation" : "highlight"}`}
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
            <span className="sr-only">Annotation note (optional)</span>
            <input
              aria-label="Annotation note (optional)"
              maxLength={160}
              onChange={(event) => setNote(event.target.value)}
              onMouseUp={(event) => event.stopPropagation()}
              placeholder="Optional note"
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
