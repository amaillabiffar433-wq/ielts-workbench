import { useLayoutEffect, useMemo, useRef, type UIEvent } from "react";

import { QuestionRenderer } from "../../../components/QuestionRenderer/QuestionRenderer";
import { QuestionGroupContext } from "../../../components/QuestionGroupContext/QuestionGroupContext";
import { boundQuestionIdsFromContext } from "../../../components/QuestionGroupContext/questionGroupContextModel";
import { TextDocument, type CreateAnnotationInput } from "../../../components/TextDocument/TextDocument";
import type { VocabularyTextSelection } from "../../../components/TextDocument/vocabularySelection";
import type { ReadingModule } from "../../../domain";
import { answerKey, useWorkbenchStore } from "../../../stores/workbenchStore";
import {
  buildReadingQuestionGroupOptions,
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
import { paneInstanceId, paneShowsQuestions, type PaneSide } from "./readingPaneIdentity";

const paneOptions = [
  { value: "passage" as const, label: "Passage" },
  { value: "questions" as const, label: "Questions" },
  { value: "whole" as const, label: "Whole test" },
];

const questionScopeOptions: ReadonlyArray<{ value: ReadingQuestionScope; label: string }> = [
  { value: "all", label: "All" },
  { value: "passage", label: "By passage" },
  { value: "group", label: "Question group" },
  { value: "range", label: "Question range" },
  { value: "single", label: "Single question" },
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
  const annotations = useWorkbenchStore((state) => state.annotations);
  const answerQuestion = useWorkbenchStore((state) => state.answerQuestion);
  const addAnnotation = useWorkbenchStore((state) => state.addAnnotation);
  const removeAnnotation = useWorkbenchStore((state) => state.removeAnnotation);
  const questionFlags = useWorkbenchStore((state) => state.questionFlags);
  const toggleQuestionFlag = useWorkbenchStore((state) => state.toggleQuestionFlag);
  const selection = selectionResult.error ? null : selectionResult.entries;
  const groups = useMemo(
    () => groupSelectedReadingQuestions(selection ?? []),
    [selection],
  );

  return (
    <div className="reading-questions">
      <div className="reading-questions__intro">
        <span>{questionSelectionLabel(questionSelection, entries, module)}</span>
        <p>Group instructions and shared answer context stay with the selected questions; filtering never deletes other answers.</p>
      </div>
      {selectionResult.error ? (
        <div className="reading-selection-error" role="alert">{selectionResult.error}</div>
      ) : groups.length === 0 ? (
        <div className="empty-state reading-questions__empty">No questions are available in this range.</div>
      ) : groups.map((selectedGroup, groupIndex) => {
        const contextBlocks = selectedGroup.group.contextBlocks ?? [];
        const boundQuestionIds = boundQuestionIdsFromContext(contextBlocks);
        const editableQuestionIds = new Set(selectedGroup.entries.map((entry) => entry.question.id));
        const completeGroupEntries = entries.filter((entry) => entry.group.id === selectedGroup.group.id);
        const renderQuestion = (entry: ReadingQuestionEntry, inline = false) => {
          const value = session ? answers[answerKey(session.sessionId, entry.question.id)]?.value : "";
          const disabledOptionIds = new Set<string>();
          if (session && entry.question.type === "matching" && !entry.question.allowOptionReuse) {
            const selectedLabels = new Set(completeGroupEntries.flatMap((peer) => {
              if (peer.question.id === entry.question.id || peer.question.type !== "matching") return [];
              const peerValue = answers[answerKey(session.sessionId, peer.question.id)]?.value;
              const selectedId = Array.isArray(peerValue) ? peerValue[0] : peerValue;
              const label = peer.question.options.find((option) => option.id === selectedId)?.label;
              return label ? [label.toLocaleUpperCase()] : [];
            }));
            entry.question.options.forEach((option) => {
              if (selectedLabels.has(option.label.toLocaleUpperCase())) disabledOptionIds.add(option.id);
            });
          }
          return (
            <QuestionRenderer
              answer={value}
              disabledOptionIds={disabledOptionIds}
              displayNumber={entry.displayNumber}
              inline={inline}
              instanceId={paneInstanceId(side)}
              key={entry.question.id}
              flagged={questionFlags.has(entry.question.id)}
              onAnswer={(questionId, answer) => {
                if (session) void answerQuestion(session.sessionId, questionId, answer);
              }}
              onToggleFlag={session ? () => void toggleQuestionFlag(session.sessionId, entry.question.id) : undefined}
              question={entry.question}
            />
          );
        };
        return (
          <section
            className="reading-question-group"
            data-question-group-id={selectedGroup.group.id}
            key={`${selectedGroup.section.id}:${selectedGroup.group.id}`}
          >
            <header className="reading-question-group__header">
              {(groupIndex === 0 || groups[groupIndex - 1].section.id !== selectedGroup.section.id) && (
                <span>{passageLabel(selectedGroup.section, selectedGroup.sectionIndex)}</span>
              )}
              {selectedGroup.group.title && <h3>{selectedGroup.group.title}</h3>}
              <p>{selectedGroup.group.instructions}</p>
            </header>
            <QuestionGroupContext
              annotations={annotations}
              blocks={contextBlocks}
              editableQuestionIds={editableQuestionIds}
              instanceId={`${paneInstanceId(side)}-${selectedGroup.group.id}`}
              onCreateAnnotation={(input) => {
                if (session) void addAnnotation({ sessionId: session.sessionId, ...input });
              }}
              onDeleteAnnotation={(id) => void removeAnnotation(id)}
              questions={completeGroupEntries.map((entry) => ({
                id: entry.question.id,
                displayNumber: entry.displayNumber,
                prompt: entry.question.prompt,
              }))}
              renderAnswerSlot={(question, editable) => {
                const entry = completeGroupEntries.find((candidate) => candidate.question.id === question.id);
                if (!entry) return null;
                return editable
                  ? renderQuestion(entry, true)
                  : <span className="question-context__answer-placeholder">Question {question.displayNumber} · read-only in this filter</span>;
              }}
            />
            {selectedGroup.entries
              .filter((entry) => !boundQuestionIds.has(entry.question.id))
              .map((entry) => renderQuestion(entry))}
          </section>
        );
      })}
    </div>
  );
}

export type ReadingVocabularySource = {
  readonly packId: string;
  readonly testId: string;
  readonly bookTitle: string;
  readonly testTitle: string;
  readonly currentQuestion?: { readonly id: string; readonly number: number };
};

export function ReadingPane({
  side,
  paneState,
  onPaneStateChange,
  onScrollPositionChange,
  module,
  entries,
  vocabularySource,
  onActiveQuestionChange,
}: {
  readonly side: PaneSide;
  readonly paneState: ReadingPaneState;
  readonly onPaneStateChange: (next: ReadingPaneState) => void;
  readonly onScrollPositionChange: (contentKey: string, scrollTop: number) => void;
  readonly module: ReadingModule;
  readonly entries: readonly ReadingQuestionEntry[];
  readonly vocabularySource: ReadingVocabularySource;
  readonly onActiveQuestionChange?: (questionId: string) => void;
}) {
  const session = useWorkbenchStore((state) => state.session);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const addAnnotation = useWorkbenchStore((state) => state.addAnnotation);
  const removeAnnotation = useWorkbenchStore((state) => state.removeAnnotation);
  const repository = useWorkbenchStore((state) => state.repository);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentKey = readingPaneContentKey(paneState);
  const restoredScrollTop = paneState.scrollPositions[contentKey] ?? 0;
  const selectedSectionIndex = module.sections.findIndex((section) => section.id === paneState.passageId);
  const selectedSection = module.sections[selectedSectionIndex] ?? module.sections[0];
  const questionGroupOptions = useMemo(() => buildReadingQuestionGroupOptions(entries), [entries]);
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
      onSaveVocabulary={(selection: VocabularyTextSelection) => repository.saveVocabularyItem({
        term: selection.term,
        normalizedTerm: selection.normalizedTerm,
        entryKind: selection.term.trim().includes(" ") ? "phrase" : "word",
        sentence: selection.sentence,
        contextBefore: selection.contextBefore,
        contextAfter: selection.contextAfter,
        sourcePackId: vocabularySource.packId,
        sourceTestId: vocabularySource.testId,
        sourceModule: "reading",
        sourceBlockId: selection.blockId,
        sourceBookTitle: vocabularySource.bookTitle,
        sourceTestTitle: vocabularySource.testTitle,
        sourceSectionId: section.id,
        sourceSectionTitle: section.title,
        ...(vocabularySource.currentQuestion ? {
          sourceQuestionId: vocabularySource.currentQuestion.id,
          sourceQuestionNumber: vocabularySource.currentQuestion.number,
        } : {}),
        note: "",
        learningState: "new",
      }).then(() => undefined)}
    />
  );

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    onScrollPositionChange(contentKey, event.currentTarget.scrollTop);
    if (!paneShowsQuestions(paneState.view) || !onActiveQuestionChange) return;
    const containerRect = event.currentTarget.getBoundingClientRect();
    const candidates = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-question-id]")];
    const active = candidates
      .map((element) => ({
        id: element.dataset.questionId,
        distance: Math.abs(element.getBoundingClientRect().top - containerRect.top - 72),
      }))
      .filter((candidate): candidate is { id: string; distance: number } => Boolean(candidate.id))
      .sort((left, right) => left.distance - right.distance)[0];
    if (active) onActiveQuestionChange(active.id);
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
              {paneState.questionScope === "group" && (
                <label>
                  <span className="sr-only">{side === "left" ? "左" : "右"}窗格题组</span>
                  <select
                    aria-label={`${side === "left" ? "左" : "右"}窗格题组`}
                    className="select reading-pane__group-selector"
                    onChange={(event) => updatePane({ questionGroupId: event.target.value })}
                    value={paneState.questionGroupId}
                  >
                    {questionGroupOptions.map((option) => (
                      <option key={option.questionGroupId} value={option.questionGroupId}>{option.label}</option>
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
