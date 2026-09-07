import { useLayoutEffect, useMemo, useRef, type UIEvent } from "react";

import { QuestionRenderer } from "../../../components/QuestionRenderer/QuestionRenderer";
import { TextDocument, type CreateAnnotationInput } from "../../../components/TextDocument/TextDocument";
import type { ReadingModule } from "../../../domain";
import { answerKey, useWorkbenchStore } from "../../../stores/workbenchStore";
import {
  groupSelectedReadingQuestions,
  passageLabel,
  questionSelectionLabel,
  selectReadingQuestions,
  type ReadingQuestionEntry,
  type ReadingQuestionSelection,
  type ReadingQuestionSelectionResult,
} from "./readingModel";
import {
  paneQuestionSelection,
  readingPaneContentKey,
  type ReadingPaneState,
  type ReadingPaneView,
  type ReadingQuestionScope,
} from "./readingViewState";
import { paneInstanceId, type PaneSide } from "./readingPaneIdentity";

const paneOptions = [
  { value: "passage" as const, label: "文章" },
  { value: "questions" as const, label: "题目" },
  { value: "whole" as const, label: "整套" },
];

const questionScopeOptions: ReadonlyArray<{ value: ReadingQuestionScope; label: string }> = [
  { value: "all", label: "全部" },
  { value: "passage", label: "按 Passage" },
  { value: "range", label: "题段" },
  { value: "single", label: "单题" },
];

function QuestionGroups({
  entries,
  selectionResult,
  questionSelection,
  module,
  side,
}: {
  readonly entries: readonly ReadingQuestionEntry[];
  readonly selectionResult: ReadingQuestionSelectionResult;
  readonly questionSelection: ReadingQuestionSelection;
  readonly module: ReadingModule;
  readonly side: PaneSide;
}) {
  const session = useWorkbenchStore((state) => state.session);
  const answers = useWorkbenchStore((state) => state.answers);
  const answerQuestion = useWorkbenchStore((state) => state.answerQuestion);
  const selection = selectionResult.error ? null : selectionResult.entries;
  const groups = useMemo(
    () => groupSelectedReadingQuestions(selection ?? []),
    [selection],
  );

  return (
    <div className="reading-questions">
      <div className="reading-questions__intro">
        <span>{questionSelectionLabel(questionSelection, entries, module)}</span>
        <p>题组说明和共享作答上下文会随所选题目保留；筛选不会删除其他答案。</p>
      </div>
      {selectionResult.error ? (
        <div className="reading-selection-error" role="alert">{selectionResult.error}</div>
      ) : groups.length === 0 ? (
        <div className="empty-state reading-questions__empty">当前范围没有可显示的题目。</div>
      ) : groups.map((selectedGroup) => (
        <section
          className="reading-question-group"
          data-question-group-id={selectedGroup.group.id}
          key={`${selectedGroup.section.id}:${selectedGroup.group.id}`}
        >
          <header className="reading-question-group__header">
            <span>{passageLabel(selectedGroup.section, selectedGroup.sectionIndex)}</span>
            {selectedGroup.group.title && <h3>{selectedGroup.group.title}</h3>}
            <p>{selectedGroup.group.instructions}</p>
          </header>
          {selectedGroup.entries.map((entry) => {
            const value = session ? answers[answerKey(session.sessionId, entry.question.id)]?.value : "";
            return (
              <QuestionRenderer
                answer={typeof value === "string" ? value : value?.join(", ")}
                displayNumber={entry.displayNumber}
                instanceId={paneInstanceId(side)}
                key={entry.question.id}
                onAnswer={(questionId, answer) => {
                  if (session) void answerQuestion(session.sessionId, questionId, answer);
                }}
                question={entry.question}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function ReadingPane({
  side,
  paneState,
  onPaneStateChange,
  onScrollPositionChange,
  module,
  entries,
}: {
  readonly side: PaneSide;
  readonly paneState: ReadingPaneState;
  readonly onPaneStateChange: (next: ReadingPaneState) => void;
  readonly onScrollPositionChange: (contentKey: string, scrollTop: number) => void;
  readonly module: ReadingModule;
  readonly entries: readonly ReadingQuestionEntry[];
}) {
  const session = useWorkbenchStore((state) => state.session);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const addAnnotation = useWorkbenchStore((state) => state.addAnnotation);
  const removeAnnotation = useWorkbenchStore((state) => state.removeAnnotation);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentKey = readingPaneContentKey(paneState);
  const restoredScrollTop = paneState.scrollPositions[contentKey] ?? 0;
  const selectedSectionIndex = module.sections.findIndex((section) => section.id === paneState.passageId);
  const selectedSection = module.sections[selectedSectionIndex] ?? module.sections[0];
  const questionSelection = paneQuestionSelection(paneState);
  const selectionResult = useMemo(
    () => selectReadingQuestions(entries, questionSelection),
    [entries, questionSelection],
  );

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = restoredScrollTop;
  }, [contentKey, restoredScrollTop]);

  const updatePane = (patch: Partial<ReadingPaneState>) => {
    onPaneStateChange({ ...paneState, ...patch });
  };

  const handleCreateAnnotation = (input: CreateAnnotationInput) => {
    if (!session) return;
    void addAnnotation({ sessionId: session.sessionId, ...input });
  };

  const renderDocument = (section: ReadingModule["sections"][number]) => (
    <TextDocument
      annotations={annotations}
      blocks={section.contentBlocks}
      onCreateAnnotation={handleCreateAnnotation}
      onDeleteAnnotation={(id) => void removeAnnotation(id)}
    />
  );

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    onScrollPositionChange(contentKey, event.currentTarget.scrollTop);
  };

  return (
    <section aria-label={`${side === "left" ? "左" : "右"}窗格`} className="reading-pane">
      <header className="reading-pane__header">
        <span className="reading-pane__label">{side === "left" ? "Pane A" : "Pane B"}</span>
        <div className="reading-pane__controls">
          <label>
            <span className="sr-only">选择{side === "left" ? "左" : "右"}窗格内容</span>
            <select
              aria-label={`${side === "left" ? "左" : "右"}窗格内容`}
              className="select reading-pane__selector"
              onChange={(event) => updatePane({ view: event.target.value as ReadingPaneView })}
              value={paneState.view}
            >
              {paneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {paneState.view === "passage" && (
            <label>
              <span className="sr-only">{side === "left" ? "左" : "右"}窗格 Passage</span>
              <select
                aria-label={`${side === "left" ? "左" : "右"}窗格 Passage`}
                className="select reading-pane__passage-selector"
                onChange={(event) => updatePane({ passageId: event.target.value })}
                value={paneState.passageId}
              >
                {module.sections.map((section, index) => (
                  <option key={section.id} value={section.id}>Passage {index + 1}</option>
                ))}
              </select>
            </label>
          )}
          {paneState.view === "questions" && (
            <>
              <label>
                <span className="sr-only">{side === "left" ? "左" : "右"}窗格题目范围类型</span>
                <select
                  aria-label={`${side === "left" ? "左" : "右"}窗格题目范围类型`}
                  className="select reading-pane__scope-selector"
                  onChange={(event) => updatePane({ questionScope: event.target.value as ReadingQuestionScope })}
                  value={paneState.questionScope}
                >
                  {questionScopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {paneState.questionScope === "passage" && (
                <label>
                  <span className="sr-only">{side === "left" ? "左" : "右"}窗格题目 Passage</span>
                  <select
                    aria-label={`${side === "left" ? "左" : "右"}窗格题目 Passage`}
                    className="select reading-pane__passage-selector"
                    onChange={(event) => updatePane({ questionPassageId: event.target.value })}
                    value={paneState.questionPassageId}
                  >
                    {module.sections.map((section, index) => (
                      <option key={section.id} value={section.id}>Passage {index + 1}</option>
                    ))}
                  </select>
                </label>
              )}
              {paneState.questionScope === "range" && (
                <span className="reading-pane__number-range">
                  <label>
                    <span className="sr-only">{side === "left" ? "左" : "右"}窗格起始题号</span>
                    <input aria-label={`${side === "left" ? "左" : "右"}窗格起始题号`} min={1} onChange={(event) => updatePane({ rangeStart: Number(event.target.value) })} type="number" value={paneState.rangeStart} />
                  </label>
                  <span aria-hidden="true">–</span>
                  <label>
                    <span className="sr-only">{side === "left" ? "左" : "右"}窗格结束题号</span>
                    <input aria-label={`${side === "left" ? "左" : "右"}窗格结束题号`} min={1} onChange={(event) => updatePane({ rangeEnd: Number(event.target.value) })} type="number" value={paneState.rangeEnd} />
                  </label>
                </span>
              )}
              {paneState.questionScope === "single" && (
                <label>
                  <span className="sr-only">{side === "left" ? "左" : "右"}窗格单题题号</span>
                  <input
                    aria-label={`${side === "left" ? "左" : "右"}窗格单题题号`}
                    className="reading-pane__single-number"
                    min={1}
                    onChange={(event) => updatePane({ singleNumber: Number(event.target.value) })}
                    type="number"
                    value={paneState.singleNumber}
                  />
                </label>
              )}
            </>
          )}
        </div>
      </header>
      <div className="reading-pane__scroll" data-pane-scroll={side} onScroll={handleScroll} ref={scrollRef}>
        {paneState.view === "passage" && selectedSection && (
          <section className="reading-passage" data-reading-section-id={selectedSection.id}>
            <header className="reading-passage__identity">
              <span>{passageLabel(selectedSection, selectedSectionIndex)}</span>
            </header>
            {renderDocument(selectedSection)}
          </section>
        )}
        {paneState.view === "questions" && (
          <QuestionGroups entries={entries} module={module} questionSelection={questionSelection} selectionResult={selectionResult} side={side} />
        )}
        {paneState.view === "whole" && (
          <div className="reading-whole-test">
            {module.sections.map((section, sectionIndex) => {
              const sectionQuestions = selectReadingQuestions(entries, { kind: "passage", sectionId: section.id });
              return (
                <section className="reading-whole-passage" data-reading-section-id={section.id} key={section.id}>
                  <header className="reading-passage__identity">
                    <span>{passageLabel(section, sectionIndex)}</span>
                  </header>
                  {renderDocument(section)}
                  <QuestionGroups
                    entries={entries}
                    module={module}
                    questionSelection={{ kind: "passage", sectionId: section.id }}
                    selectionResult={sectionQuestions}
                    side={side}
                  />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
