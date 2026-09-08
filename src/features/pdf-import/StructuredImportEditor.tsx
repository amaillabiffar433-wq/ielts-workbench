import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, FileCheck2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import type { SaveState } from "../../components/common/SaveStatus";
import { SaveStatus } from "../../components/common/SaveStatus";
import {
  applyStructuredAnswerKey,
  assignSourceSegments,
  createStructuredGroup,
  createStructuredPassage,
  createStructuredQuestion,
  ignoreSourceSegments,
  moveArrayItem,
  moveGroupBetweenPassages,
  moveQuestionBetweenGroups,
  replaceDraftOptions,
  suggestStructuredImportDraft,
  touchStructuredDraft,
  validateStructuredImportDraft,
  type StructuredGroupDraft,
  type StructuredImportDraft,
  type StructuredPassageDraft,
  type StructuredQuestionDraft,
} from "./structuredImportModel";

const supportedQuestionTypes = [
  ["single-choice", "Multiple Choice"],
  ["true-false-not-given", "TRUE / FALSE / NOT GIVEN"],
  ["short-answer", "Short Answer"],
  ["fill-blank", "Sentence Completion"],
] as const;

function impactDescription(passage: StructuredPassageDraft): string {
  const groupCount = passage.questionGroups.length;
  const questionCount = passage.questionGroups.reduce((total, group) => total + group.questions.length, 0);
  return `${groupCount} 个题组、${questionCount} 道题`;
}

function updatePassage(
  draft: StructuredImportDraft,
  passageId: string,
  update: (passage: StructuredPassageDraft) => StructuredPassageDraft,
): StructuredImportDraft {
  return touchStructuredDraft(draft, {
    passages: draft.passages.map((passage) => passage.id === passageId ? update(passage) : passage),
  });
}

function updateGroup(
  draft: StructuredImportDraft,
  groupId: string,
  update: (group: StructuredGroupDraft) => StructuredGroupDraft,
): StructuredImportDraft {
  return touchStructuredDraft(draft, {
    passages: draft.passages.map((passage) => ({
      ...passage,
      questionGroups: passage.questionGroups.map((group) => group.id === groupId ? update(group) : group),
    })),
  });
}

function updateQuestion(
  draft: StructuredImportDraft,
  questionId: string,
  update: (question: StructuredQuestionDraft) => StructuredQuestionDraft,
): StructuredImportDraft {
  return touchStructuredDraft(draft, {
    passages: draft.passages.map((passage) => ({
      ...passage,
      questionGroups: passage.questionGroups.map((group) => ({
        ...group,
        questions: group.questions.map((question) => question.id === questionId ? update(question) : question),
      })),
    })),
  });
}

export interface StructuredImportEditorProps {
  readonly draft: StructuredImportDraft;
  readonly sourceConnected: boolean;
  readonly saveState: SaveState;
  readonly busy: boolean;
  readonly onChange: (draft: StructuredImportDraft) => void;
  readonly onReselectSource: () => void;
  readonly onKeepDraftAndExit: () => void;
  readonly onDiscard: () => void;
  readonly onInstall: () => void;
}

export function StructuredImportEditor({
  draft,
  sourceConnected,
  saveState,
  busy,
  onChange,
  onReselectSource,
  onKeepDraftAndExit,
  onDiscard,
  onInstall,
}: StructuredImportEditorProps) {
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<readonly string[]>(draft.editorState.selectedSourceSegmentIds);
  const [activePassageId, setActivePassageId] = useState(draft.editorState.activePassageId ?? draft.passages[0]?.id ?? "");
  const [activeGroupId, setActiveGroupId] = useState(draft.editorState.activeGroupId ?? draft.passages[0]?.questionGroups[0]?.id ?? "");
  const [activeQuestionId, setActiveQuestionId] = useState(draft.editorState.activeQuestionId ?? draft.passages[0]?.questionGroups[0]?.questions[0]?.id ?? "");
  const [answerErrors, setAnswerErrors] = useState<readonly string[]>([]);
  const [invalidAnswerLines, setInvalidAnswerLines] = useState<readonly string[]>([]);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const validation = useMemo(() => validateStructuredImportDraft(draft), [draft]);
  const unassignedSegments = draft.sourceSegments.filter((segment) => segment.disposition.kind === "unassigned");
  const groups = draft.passages.flatMap((passage) => passage.questionGroups.map((group) => ({ passage, group })));

  const setStage = (currentStage: StructuredImportDraft["currentStage"]) => {
    onChange(touchStructuredDraft(draft, { currentStage }));
  };

  const activate = (activePassageId: string | null, activeGroupId: string | null = null, activeQuestionId: string | null = null) => {
    setActivePassageId(activePassageId ?? "");
    setActiveGroupId(activeGroupId ?? "");
    setActiveQuestionId(activeQuestionId ?? "");
    onChange(touchStructuredDraft(draft, {
      editorState: { ...draft.editorState, activePassageId, activeGroupId, activeQuestionId },
    }));
  };

  const selectSegments = (ids: readonly string[]) => {
    setSelectedSegmentIds(ids);
    onChange(touchStructuredDraft(draft, {
      editorState: { ...draft.editorState, selectedSourceSegmentIds: [...ids] },
    }));
  };

  const assign = (kind: "passage" | "group" | "question", id: string) => {
    if (!id || selectedSegmentIds.length === 0) return;
    const assigned = assignSourceSegments(draft, selectedSegmentIds, { kind, id });
    onChange(touchStructuredDraft(assigned, {
      editorState: { ...assigned.editorState, selectedSourceSegmentIds: [] },
    }));
    setSelectedSegmentIds([]);
  };

  const addPassage = () => {
    const passage = createStructuredPassage(draft.passages.length + 1);
    onChange(touchStructuredDraft(draft, {
      passages: [...draft.passages, passage],
      editorState: {
        ...draft.editorState,
        activePassageId: passage.id,
        activeGroupId: passage.questionGroups[0].id,
        activeQuestionId: null,
      },
    }));
    setActivePassageId(passage.id);
    setActiveGroupId(passage.questionGroups[0].id);
    setActiveQuestionId("");
  };

  const removePassage = (passage: StructuredPassageDraft) => {
    const hasContent = passage.contentBlocks.some((block) => block.text.trim())
      || passage.questionGroups.some((group) => group.questions.length > 0);
    if (hasContent && !window.confirm(`删除“${passage.title}”会同时移除 ${impactDescription(passage)}。来源快照不会删除，相关片段会在校验中要求重新分配。确定继续吗？`)) return;
    onChange(touchStructuredDraft(draft, {
      passages: draft.passages.filter((item) => item.id !== passage.id),
      editorState: { ...draft.editorState, activePassageId: null, activeGroupId: null, activeQuestionId: null },
    }));
    setActivePassageId("");
    setActiveGroupId("");
    setActiveQuestionId("");
  };

  const removeGroup = (passageId: string, group: StructuredGroupDraft) => {
    if (group.questions.length > 0 && !window.confirm(`删除题组“${group.title || group.id}”会同时移除 ${group.questions.length} 道题。确定继续吗？`)) return;
    const updated = updatePassage(draft, passageId, (passage) => ({
      ...passage,
      questionGroups: passage.questionGroups.filter((item) => item.id !== group.id),
    }));
    onChange(touchStructuredDraft(updated, {
      editorState: { ...updated.editorState, activeGroupId: null, activeQuestionId: null },
    }));
    setActiveGroupId("");
    setActiveQuestionId("");
  };

  const applyAnswers = () => {
    const result = applyStructuredAnswerKey(draft, draft.answerKeyText);
    setAnswerErrors(result.errors);
    setInvalidAnswerLines(result.invalidLines);
    if (result.errors.length === 0 && result.invalidLines.length === 0) onChange(result.draft);
  };

  return (
    <section className="pdf-review-panel pdf-structured-editor">
      <header className="pdf-structured-editor__header">
        <div>
          <h2>人工确认式结构化草稿</h2>
          <p>{draft.source.fileName} · {draft.source.pageCount} 页 · SHA-256 {draft.source.sourceSha256.slice(0, 12)}…</p>
        </div>
        <div className="pdf-actions">
          <SaveStatus state={saveState} />
          <button className="button button--ghost" disabled={busy} onClick={onReselectSource} type="button"><RotateCcw size={15} />{sourceConnected ? "重新核验来源" : "重选并核验来源"}</button>
        </div>
      </header>

      {!sourceConnected && <div className="notice-banner" role="status"><AlertTriangle size={17} />原 PDF 当前未连接；文本快照和编辑内容已保留。继续编辑不依赖源文件，重新选择时会核对 SHA-256。</div>}

      <nav aria-label="结构化导入阶段" className="pdf-structured-tabs">
        <button aria-current={draft.currentStage === "structure" ? "step" : undefined} onClick={() => setStage("structure")} type="button">1 来源与结构</button>
        <button aria-current={draft.currentStage === "answers" ? "step" : undefined} onClick={() => setStage("answers")} type="button">2 答案映射</button>
        <button aria-current={draft.currentStage === "preview" ? "step" : undefined} onClick={() => setStage("preview")} type="button">3 校验与预览</button>
      </nav>

      <div className="pdf-metadata-grid">
        <label>Book title<input onChange={(event) => onChange(touchStructuredDraft(draft, { bookTitle: event.target.value }))} value={draft.bookTitle} /></label>
        <label>Test number<input onChange={(event) => onChange(touchStructuredDraft(draft, { testNumber: event.target.value }))} value={draft.testNumber} /></label>
        <label>Pack ID（稳定，只读）<input readOnly value={draft.packId} /></label>
      </div>

      {draft.currentStage === "structure" && (
        <div className="pdf-structure-layout">
          <aside className="pdf-source-fragments">
            <header><h3>来源文本快照</h3><span>{unassignedSegments.length} 个未处理片段</span></header>
            <p>勾选一行或多行，可跨页分配；同一页的不同片段也可进入不同 Passage。</p>
            <div className="pdf-source-fragments__list">
              {draft.sourceSegments.map((segment) => (
                <label className={`pdf-source-fragment is-${segment.disposition.kind}`} key={segment.id}>
                  <input
                    checked={selectedSegmentIds.includes(segment.id)}
                    onChange={(event) => selectSegments(event.target.checked
                      ? [...selectedSegmentIds, segment.id]
                      : selectedSegmentIds.filter((id) => id !== segment.id))}
                    type="checkbox"
                  />
                  <span><strong>p.{segment.pageNumber}</strong> {segment.text}</span>
                  <small>{segment.disposition.kind === "unassigned" ? "未分配" : segment.disposition.kind === "ignored" ? "已明确忽略" : `已分配到 ${segment.disposition.targetKind}`}</small>
                </label>
              ))}
            </div>
            <div className="pdf-source-actions">
              <button className="button" disabled={!activePassageId || selectedSegmentIds.length === 0} onClick={() => assign("passage", activePassageId)} type="button">追加到当前 Passage 正文</button>
              <button className="button" disabled={!activeGroupId || selectedSegmentIds.length === 0} onClick={() => assign("group", activeGroupId)} type="button">追加到当前题组说明</button>
              <button className="button" disabled={!activeQuestionId || selectedSegmentIds.length === 0} onClick={() => assign("question", activeQuestionId)} type="button">追加到当前题干</button>
              <button className="button button--ghost" disabled={selectedSegmentIds.length === 0} onClick={() => {
                const ignored = ignoreSourceSegments(draft, selectedSegmentIds);
                onChange(touchStructuredDraft(ignored, { editorState: { ...ignored.editorState, selectedSourceSegmentIds: [] } }));
                setSelectedSegmentIds([]);
              }} type="button">明确忽略所选</button>
              <button className="button button--ghost" disabled={unassignedSegments.length === 0} onClick={() => onChange(ignoreSourceSegments(draft, unassignedSegments.map((segment) => segment.id)))} type="button">明确忽略全部未分配</button>
            </div>
          </aside>

          <div className="pdf-structure-tree">
            <header><div><h3>Reading 结构</h3><p>当前 {draft.passages.length} 个 Passage；顺序可调整，稳定 ID 不变。</p></div><div className="pdf-actions"><button className="button button--ghost" disabled={draft.initialSuggestionAppliedAt !== null} onClick={() => {
              try {
                const suggested = suggestStructuredImportDraft(draft);
                setSuggestionError(null);
                setActivePassageId(suggested.editorState.activePassageId ?? "");
                setActiveGroupId(suggested.editorState.activeGroupId ?? "");
                setActiveQuestionId(suggested.editorState.activeQuestionId ?? "");
                setSelectedSegmentIds([]);
                onChange(suggested);
              } catch (error) {
                setSuggestionError(error instanceof Error ? error.message : String(error));
              }
            }} type="button">{draft.initialSuggestionAppliedAt ? "初始建议已锁定" : "按标准标题生成建议"}</button><button className="button" onClick={addPassage} type="button"><Plus size={15} />新增 Passage</button></div></header>
            {suggestionError && <div className="error-banner" role="alert">{suggestionError}</div>}
            {draft.passages.map((passage, passageIndex) => (
              <article className={`pdf-passage-card${activePassageId === passage.id ? " is-active" : ""}`} key={passage.id} onClick={() => activate(passage.id)}>
                <header>
                  <strong>Passage {passageIndex + 1}</strong><code>{passage.id}</code>
                  <div className="pdf-actions">
                    <button aria-label={`上移 ${passage.title}`} className="button button--ghost" disabled={passageIndex === 0} onClick={(event) => { event.stopPropagation(); onChange(touchStructuredDraft(draft, { passages: moveArrayItem(draft.passages, passageIndex, passageIndex - 1) })); }} type="button"><ArrowUp size={14} /></button>
                    <button aria-label={`下移 ${passage.title}`} className="button button--ghost" disabled={passageIndex === draft.passages.length - 1} onClick={(event) => { event.stopPropagation(); onChange(touchStructuredDraft(draft, { passages: moveArrayItem(draft.passages, passageIndex, passageIndex + 1) })); }} type="button"><ArrowDown size={14} /></button>
                    <button aria-label={`删除 ${passage.title}`} className="button button--ghost" onClick={(event) => { event.stopPropagation(); removePassage(passage); }} type="button"><Trash2 size={14} /></button>
                  </div>
                </header>
                <label>Passage title<input onFocus={() => setActivePassageId(passage.id)} onChange={(event) => onChange(updatePassage(draft, passage.id, (item) => ({ ...item, title: event.target.value })))} value={passage.title} /></label>
                <label>正文<textarea onFocus={() => setActivePassageId(passage.id)} onChange={(event) => onChange(updatePassage(draft, passage.id, (item) => ({ ...item, contentBlocks: [{ ...item.contentBlocks[0], text: event.target.value }, ...item.contentBlocks.slice(1)] })))} rows={7} value={passage.contentBlocks[0].text} /></label>
                <p className="pdf-source-reference">来源页：{passage.contentBlocks.flatMap((block) => block.sourcePages).join(", ") || "人工输入 / 尚未分配"}</p>

                {passage.questionGroups.map((group, groupIndex) => (
                  <section className={`pdf-group-card${activeGroupId === group.id ? " is-active" : ""}`} key={group.id} onClick={(event) => { event.stopPropagation(); activate(passage.id, group.id); }}>
                    <header>
                      <strong>题组 {groupIndex + 1}</strong><code>{group.id}</code>
                      <div className="pdf-actions">
                        <button aria-label={`上移题组 ${groupIndex + 1}`} className="button button--ghost" disabled={groupIndex === 0} onClick={(event) => { event.stopPropagation(); onChange(updatePassage(draft, passage.id, (item) => ({ ...item, questionGroups: moveArrayItem(item.questionGroups, groupIndex, groupIndex - 1) }))); }} type="button"><ArrowUp size={14} /></button>
                        <button aria-label={`下移题组 ${groupIndex + 1}`} className="button button--ghost" disabled={groupIndex === passage.questionGroups.length - 1} onClick={(event) => { event.stopPropagation(); onChange(updatePassage(draft, passage.id, (item) => ({ ...item, questionGroups: moveArrayItem(item.questionGroups, groupIndex, groupIndex + 1) }))); }} type="button"><ArrowDown size={14} /></button>
                        <button aria-label={`删除题组 ${groupIndex + 1}`} className="button button--ghost" onClick={(event) => { event.stopPropagation(); removeGroup(passage.id, group); }} type="button"><Trash2 size={14} /></button>
                      </div>
                    </header>
                    <label>题组名称<input onFocus={() => setActiveGroupId(group.id)} onChange={(event) => onChange(updateGroup(draft, group.id, (item) => ({ ...item, title: event.target.value })))} value={group.title} /></label>
                    <label>题组说明 / 必要上下文<textarea onFocus={() => setActiveGroupId(group.id)} onChange={(event) => onChange(updateGroup(draft, group.id, (item) => ({ ...item, instructions: event.target.value })))} rows={3} value={group.instructions} /></label>
                    <p className="pdf-source-reference">题组来源页：{group.sourcePages.join(", ") || "人工输入 / 尚未分配"}。当前 IELTSPack v1 没有独立表格对象；表格或列表上下文须保留在题组说明/共享选项中，不能标成自动结构化表格。</p>
                    <div className="pdf-group-fields">
                      <label>题组题型<select onChange={(event) => onChange(updateGroup(draft, group.id, (item) => {
                        const questionType = event.target.value as StructuredGroupDraft["questionType"];
                        return { ...item, questionType, questions: questionType === "mixed" ? item.questions : item.questions.map((question) => ({ ...question, type: questionType, needsReview: true })) };
                      }))} value={group.questionType}><option value="mixed">Mixed / 各题单独设置</option>{supportedQuestionTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <label>所属 Passage<select aria-label={`题组 ${groupIndex + 1} 所属 Passage`} onChange={(event) => onChange(moveGroupBetweenPassages(draft, group.id, event.target.value))} value={passage.id}>{draft.passages.map((candidate, index) => <option key={candidate.id} value={candidate.id}>Passage {index + 1}: {candidate.title}</option>)}</select></label>
                      <label>统一字数限制<input min={1} onChange={(event) => onChange(updateGroup(draft, group.id, (item) => ({ ...item, maxWords: event.target.value ? Number(event.target.value) : null })))} placeholder="可选" type="number" value={group.maxWords ?? ""} /></label>
                      <label>共享选项（每行如 A Heading）<textarea onChange={(event) => onChange(updateGroup(draft, group.id, (item) => ({ ...item, sharedOptions: replaceDraftOptions(item.sharedOptions, event.target.value) })))} rows={3} value={group.sharedOptions.map((option) => `${option.label} ${option.text}`).join("\n")} /></label>
                    </div>

                    {group.questions.map((question, questionIndex) => (
                      <article className={`pdf-structured-question${activeQuestionId === question.id ? " is-active" : ""}`} key={question.id} onClick={(event) => { event.stopPropagation(); activate(passage.id, group.id, question.id); }}>
                        <header><strong>Question {question.number}</strong><code>{question.id}</code><div className="pdf-actions"><button aria-label={`上移 Question ${question.number}`} className="button button--ghost" disabled={questionIndex === 0} onClick={(event) => { event.stopPropagation(); onChange(updateGroup(draft, group.id, (item) => ({ ...item, questions: moveArrayItem(item.questions, questionIndex, questionIndex - 1) }))); }} type="button"><ArrowUp size={14} /></button><button aria-label={`下移 Question ${question.number}`} className="button button--ghost" disabled={questionIndex === group.questions.length - 1} onClick={(event) => { event.stopPropagation(); onChange(updateGroup(draft, group.id, (item) => ({ ...item, questions: moveArrayItem(item.questions, questionIndex, questionIndex + 1) }))); }} type="button"><ArrowDown size={14} /></button><button aria-label={`删除 Question ${question.number}`} className="button button--ghost" onClick={(event) => { event.stopPropagation(); onChange(updateGroup(draft, group.id, (item) => ({ ...item, questions: item.questions.filter((candidate) => candidate.id !== question.id) }))); }} type="button"><Trash2 size={14} /></button></div></header>
                        <div className="pdf-question-editor__head">
                          <label>题号<input min={1} onChange={(event) => onChange(updateQuestion(draft, question.id, (item) => ({ ...item, number: Number(event.target.value) })))} type="number" value={question.number} /></label>
                          <label>题型<select onChange={(event) => onChange(updateQuestion(draft, question.id, (item) => ({ ...item, type: event.target.value as StructuredQuestionDraft["type"], needsReview: true })))} value={question.type}>
                            {supportedQuestionTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            {(question.type === "matching-headings" || question.type === "unsupported") && <option value={question.type}>{question.type}（需改为支持题型）</option>}
                          </select></label>
                          <label>移动到题组<select aria-label={`Question ${question.number} 所属题组`} onChange={(event) => onChange(moveQuestionBetweenGroups(draft, question.id, event.target.value))} value={group.id}>{groups.map((entry) => <option key={entry.group.id} value={entry.group.id}>{entry.passage.title} / {entry.group.title}</option>)}</select></label>
                        </div>
                        <label>题干<textarea onChange={(event) => onChange(updateQuestion(draft, question.id, (item) => ({ ...item, prompt: event.target.value })))} rows={2} value={question.prompt} /></label>
                        <label>题目自有选项（留空时使用题组共享选项）<textarea onChange={(event) => onChange(updateQuestion(draft, question.id, (item) => ({ ...item, options: replaceDraftOptions(item.options, event.target.value) })))} rows={3} value={question.options.map((option) => `${option.label} ${option.text}`).join("\n")} /></label>
                        <label className="pdf-review-toggle"><input checked={!question.needsReview} onChange={(event) => onChange(updateQuestion(draft, question.id, (item) => ({ ...item, needsReview: !event.target.checked })))} type="checkbox" />题号、题型、题干与上下文已人工复核</label>
                        <p className="pdf-source-reference">来源页：{question.sourcePages.join(", ") || "人工输入"}</p>
                      </article>
                    ))}
                    <button className="button button--ghost" onClick={(event) => {
                      event.stopPropagation();
                      const nextNumber = Math.max(0, ...draft.passages.flatMap((item) => item.questionGroups.flatMap((candidate) => candidate.questions.map((question) => question.number)))) + 1;
                      const nextQuestion = createStructuredQuestion({ number: nextNumber, type: group.questionType === "mixed" ? "short-answer" : group.questionType });
                      const updated = updateGroup(draft, group.id, (item) => ({ ...item, questions: [...item.questions, nextQuestion] }));
                      onChange(touchStructuredDraft(updated, { editorState: { ...updated.editorState, activePassageId: passage.id, activeGroupId: group.id, activeQuestionId: nextQuestion.id } }));
                      setActiveQuestionId(nextQuestion.id);
                    }} type="button"><Plus size={14} />新增题目</button>
                  </section>
                ))}
                <button className="button button--ghost" onClick={(event) => {
                  event.stopPropagation();
                  const group = createStructuredGroup();
                  const updated = updatePassage(draft, passage.id, (item) => ({ ...item, questionGroups: [...item.questionGroups, group] }));
                  onChange(touchStructuredDraft(updated, { editorState: { ...updated.editorState, activePassageId: passage.id, activeGroupId: group.id, activeQuestionId: null } }));
                  setActiveGroupId(group.id);
                }} type="button"><Plus size={14} />新增题组</button>
              </article>
            ))}
          </div>
        </div>
      )}

      {draft.currentStage === "answers" && (
        <div className="pdf-answers-stage">
          <section className="pdf-answer-editor">
            <label>粘贴 Answer Key<textarea onChange={(event) => onChange(touchStructuredDraft(draft, { answerKeyText: event.target.value }))} placeholder={'1 FALSE\n2 TRUE\n18 B'} rows={7} value={draft.answerKeyText} /></label>
            <button className="button" onClick={applyAnswers} type="button">按无歧义题号映射到 questionId</button>
            {(answerErrors.length > 0 || invalidAnswerLines.length > 0) && <div className="error-banner" role="alert">{[...answerErrors, ...invalidAnswerLines.map((line) => `未识别：${line}`)].join(" ｜ ")}</div>}
          </section>
          {draft.passages.map((passage) => <section className="pdf-answer-map" key={passage.id}><h3>{passage.title}</h3>{passage.questionGroups.map((group) => <div key={group.id}><h4>{group.title || group.id}</h4>{group.questions.map((question) => <label key={question.id}><span>Question {question.number} · {question.prompt || "（缺少题干）"}</span><input onChange={(event) => onChange(updateQuestion(draft, question.id, (item) => ({ ...item, answer: event.target.value })))} placeholder="留空 = 未提供 / 不评分" value={question.answer} /></label>)}</div>)}</section>)}
        </div>
      )}

      {draft.currentStage === "preview" && (
        <div className="pdf-validation-stage">
          <header><FileCheck2 size={22} /><div><h3>{validation.valid ? "结构校验通过" : `${validation.errors.length} 个阻塞错误`}</h3><p>{validation.warnings.length} 个警告；警告不会阻止安装，但会在题包中保留待复核状态。</p></div></header>
          {validation.errors.length > 0 && <section className="pdf-validation-list is-error"><h4>阻塞错误</h4>{validation.errors.map((item, index) => <p key={`${item.code}-${index}`}><strong>{item.code}</strong> · {item.message}</p>)}</section>}
          {validation.warnings.length > 0 && <section className="pdf-validation-list"><h4>警告</h4>{validation.warnings.map((item, index) => <p key={`${item.code}-${index}`}><strong>{item.code}</strong> · {item.message}</p>)}</section>}
          <section className="pdf-structure-preview"><h3>安装预览</h3>{draft.passages.map((passage, passageIndex) => <article key={passage.id}><h4>Passage {passageIndex + 1}: {passage.title}</h4><p>{passage.contentBlocks.map((block) => block.text).join(" ").slice(0, 220)}{passage.contentBlocks.some((block) => block.text.length > 220) ? "…" : ""}</p>{passage.questionGroups.map((group) => <div key={group.id}><strong>{group.title || group.id}</strong><span>{group.instructions}</span><ol>{group.questions.map((question) => <li key={question.id}>Question {question.number}: {question.prompt}</li>)}</ol></div>)}</article>)}</section>
          <button className="button button--primary" disabled={!validation.valid || busy} onClick={onInstall} type="button"><CheckCircle2 size={16} />{busy ? "正在安装…" : "确认结构并安装题包"}</button>
        </div>
      )}

      <footer className="pdf-structured-footer">
        <button className="button" disabled={busy} onClick={onKeepDraftAndExit} type="button"><Save size={15} />保存草稿并退出向导</button>
        <button className="button button--ghost" disabled={busy} onClick={onDiscard} type="button"><Trash2 size={15} />明确丢弃此草稿</button>
        <span>草稿与正式题包分开保存；取消选择 PDF 或退出不会自动删除草稿。</span>
      </footer>
    </section>
  );
}
