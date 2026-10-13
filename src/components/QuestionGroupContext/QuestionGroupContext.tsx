import { useMemo, useState, type ReactNode } from "react";
import { Highlighter, Underline } from "lucide-react";

import {
  createTextAnchor,
  segmentTextWithAnnotations,
  type AnnotationStyle,
  type TextAnchor,
} from "../../domain/annotation";
import type { QuestionContextBlock } from "../../domain/pack";
import type {
  CreateAnnotationInput,
  DisplayAnnotation,
} from "../TextDocument/TextDocument";
import { confirmAction } from "../../infrastructure/window/windowClose";
import "./QuestionGroupContext.css";
import { VisualBlock } from "../VisualBlock/VisualBlock";

export type ContextQuestionDescriptor = {
  readonly id: string;
  readonly displayNumber: number;
  readonly prompt: string;
};

const annotationStyles: ReadonlyArray<{ style: AnnotationStyle; label: string }> = [
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

function contextTextElement(node: Node | null): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-context-text-block-id]") ?? null;
}

function ContextText({
  blockId,
  text,
  annotations,
  onDeleteAnnotation,
}: {
  readonly blockId: string;
  readonly text: string;
  readonly annotations: readonly DisplayAnnotation[];
  readonly onDeleteAnnotation?: (annotationId: string) => void;
}) {
  const relevant = useMemo(
    () => annotations.filter((annotation) => annotation.anchor.blockId === blockId),
    [annotations, blockId],
  );
  const annotationById = useMemo(
    () => new Map(relevant.map((annotation) => [annotation.id, annotation])),
    [relevant],
  );
  const { segments, unresolvedAnnotationIds } = useMemo(
    () => segmentTextWithAnnotations(text, relevant, blockId),
    [blockId, relevant, text],
  );

  return (
    <span className="question-context__text" data-context-text-block-id={blockId}>
      {segments.map((segment) => {
        if (segment.annotationIds.length === 0) {
          return <span key={`${segment.startOffset}-${segment.endOffset}`}>{segment.text}</span>;
        }
        const active = segment.annotationIds
          .map((id) => annotationById.get(id))
          .filter((annotation): annotation is DisplayAnnotation => Boolean(annotation));
        const primary = active.at(-1);
        return (
          <button
            aria-label={`Annotated “${segment.text}”; click to remove`}
            className={["text-annotation", ...new Set(active.map((annotation) => `text-annotation--${annotation.style}`))].join(" ")}
            key={`${segment.startOffset}-${segment.endOffset}-${segment.annotationIds.join("-")}`}
            onClick={async () => {
              if (primary && onDeleteAnnotation && await confirmAction(`Remove annotation “${primary.anchor.quote}”?`)) {
                onDeleteAnnotation(primary.id);
              }
            }}
            type="button"
          >
            {segment.text}
          </button>
        );
      })}
      {unresolvedAnnotationIds.length > 0 && (
        <span className="question-context__anchor-warning" role="status">
          {unresolvedAnnotationIds.length} previous annotations could not be located.
        </span>
      )}
    </span>
  );
}

export function QuestionGroupContext({
  blocks,
  questions,
  editableQuestionIds,
  renderAnswerSlot,
  annotations = [],
  onCreateAnnotation,
  onDeleteAnnotation,
  readOnly = false,
  instanceId,
}: {
  readonly blocks: readonly QuestionContextBlock[];
  readonly questions: readonly ContextQuestionDescriptor[];
  readonly editableQuestionIds: ReadonlySet<string>;
  readonly renderAnswerSlot: (question: ContextQuestionDescriptor, editable: boolean) => ReactNode;
  readonly annotations?: readonly DisplayAnnotation[];
  readonly onCreateAnnotation?: (input: CreateAnnotationInput) => void;
  readonly onDeleteAnnotation?: (annotationId: string) => void;
  readonly readOnly?: boolean;
  readonly instanceId: string;
}) {
  const [pendingAnchor, setPendingAnchor] = useState<TextAnchor | null>(null);
  const [message, setMessage] = useState("Select text within one paragraph or cell.");
  const questionById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions],
  );
  const textByBlockId = useMemo(() => new Map(blocks.flatMap((block) => {
    if ("assetId" in block) return block.ocrText ? [[block.id, block.ocrText] as const] : [];
    if (block.type === "paragraph") return [[block.id, block.text] as const];
    if (block.type === "list") return block.items.map((item) => [item.id, item.text] as const);
    if (block.type === "completion") {
      return block.parts.flatMap((part) => part.kind === "text" ? [[part.id, part.text] as const] : []);
    }
    return block.rows.flatMap((row) => row.cells.map((cell) => [cell.id, cell.text] as const));
  })), [blocks]);

  const captureSelection = () => {
    if (readOnly || !onCreateAnnotation) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return;
    const startBlock = contextTextElement(selection.anchorNode);
    const endBlock = contextTextElement(selection.focusNode);
    if (!startBlock || !endBlock || startBlock !== endBlock) {
      setPendingAnchor(null);
      setMessage("Select within one paragraph or cell.");
      return;
    }
    const blockId = startBlock.dataset.contextTextBlockId;
    const text = blockId ? textByBlockId.get(blockId) : undefined;
    if (!blockId || text === undefined) return;
    let start = offsetInside(startBlock, selection.anchorNode, selection.anchorOffset);
    let end = offsetInside(startBlock, selection.focusNode, selection.focusOffset);
    if (start > end) [start, end] = [end, start];
    try {
      const anchor = createTextAnchor(blockId, text, start, end);
      setPendingAnchor(anchor);
      setMessage(`Selected “${anchor.quote}”. Choose a style.`);
    } catch {
      setPendingAnchor(null);
      setMessage("No text selection was captured.");
    }
  };

  const createAnnotation = (style: AnnotationStyle) => {
    if (!pendingAnchor || !onCreateAnnotation) {
      setMessage("Select text within one paragraph first.");
      return;
    }
    onCreateAnnotation({ anchor: pendingAnchor, style });
    setMessage(`Annotation saved.`);
    setPendingAnchor(null);
    window.getSelection()?.removeAllRanges();
  };

  if (blocks.length === 0) return null;

  const renderText = (blockId: string, text: string) => (
    <ContextText
      annotations={annotations}
      blockId={blockId}
      onDeleteAnnotation={onDeleteAnnotation}
      text={text}
    />
  );

  return (
    <section className="question-context" data-context-instance-id={instanceId} onMouseUp={captureSelection}>
      {!readOnly && onCreateAnnotation && (
        <div className="question-context__annotation-toolbar" onMouseUp={(event) => event.stopPropagation()}>
          <div aria-label="Context annotation styles" role="group">
            {annotationStyles.map(({ style, label }) => (
              <button
                aria-label={`Add ${label} annotation`}
                className={`annotation-style annotation-style--${style}`}
                key={style}
                onClick={() => createAnnotation(style)}
                title={label}
                type="button"
              >
                {style === "underline" ? <Underline aria-hidden="true" size={14} /> : <Highlighter aria-hidden="true" size={14} />}
              </button>
            ))}
          </div>
          <span aria-live="polite">{message}</span>
        </div>
      )}
      <div className="question-context__blocks">
        {blocks.map((block) => {
          if ("assetId" in block) {
            const visual = <VisualBlock visual={block} />;
            return <div key={block.id}>{blocks.some((candidate) => candidate.type === "completion") ? <details><summary>View original page</summary>{visual}</details> : visual}{block.ocrText && <details><summary>Source text / OCR</summary>{renderText(block.id, block.ocrText)}</details>}</div>;
          }
          if (block.type === "paragraph") {
            return <p className="question-context__paragraph" key={block.id}>{renderText(block.id, block.text)}</p>;
          }
          if (block.type === "list") {
            const List = block.style === "ordered" ? "ol" : "ul";
            return (
              <List className="question-context__list" key={block.id}>
                {block.items.map((item) => <li key={item.id}>{renderText(item.id, item.text)}</li>)}
              </List>
            );
          }
          if (block.type === "completion") {
            return (
              <section className={`question-context__completion question-context__completion--${block.style}`} key={block.id}>
                {block.title && <h4>{block.title}</h4>}
                <div className="question-context__completion-flow">
                  {block.parts.map((part) => {
                    if (part.kind === "text") return <span key={part.id}>{renderText(part.id, part.text)}</span>;
                    const question = questionById.get(part.questionId);
                    return question
                      ? <span className="question-context__completion-answer" key={part.id}>{renderAnswerSlot(question, editableQuestionIds.has(question.id))}</span>
                      : <span className="question-context__invalid-reference" key={part.id}>Invalid question reference</span>;
                  })}
                </div>
              </section>
            );
          }
          const headerRow = block.hasHeaderRow ? block.rows[0] : undefined;
          const bodyRows = block.hasHeaderRow ? block.rows.slice(1) : block.rows;
          return (
            <div className="question-context__table-scroll" key={block.id} tabIndex={0}>
              <table className="question-context__table">
                {headerRow && (
                  <thead><tr>{headerRow.cells.map((cell) => (
                    <th key={cell.id} scope="col">
                      {renderText(cell.id, cell.text)}
                      {cell.questionId && questionById.has(cell.questionId)
                        ? renderAnswerSlot(questionById.get(cell.questionId)!, editableQuestionIds.has(cell.questionId))
                        : null}
                    </th>
                  ))}</tr></thead>
                )}
                <tbody>
                  {bodyRows.map((row) => <tr key={row.id}>{row.cells.map((cell, cellIndex) => {
                    const Cell = block.hasRowHeaders && cellIndex === 0 ? "th" : "td";
                    const question = cell.questionId ? questionById.get(cell.questionId) : undefined;
                    return (
                      <Cell key={cell.id} {...(Cell === "th" ? { scope: "row" as const } : {})}>
                        {renderText(cell.id, cell.text)}
                        {question
                          ? renderAnswerSlot(question, editableQuestionIds.has(question.id))
                          : cell.questionId
                            ? <span className="question-context__invalid-reference">Invalid question reference</span>
                            : null}
                      </Cell>
                    );
                  })}</tr>)}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
