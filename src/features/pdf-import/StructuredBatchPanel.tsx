import { useMemo, useState } from "react";
import { CheckCircle2, ListChecks, ScanSearch } from "lucide-react";

import {
  applyGroupDefaults,
  applyPreviewedAnswers,
  applyQuestionRangeAssignment,
  confirmBatchQuestions,
  generateStructuredRuleCandidates,
  previewBatchAnswers,
  previewBatchQuestions,
  previewQuestionRangeAssignment,
  revalidateBatchQuestionPreview,
  type BatchAnswerPreview,
  type BatchQuestionPreview,
} from "./structuredBatchModel";
import { touchStructuredDraft, type StructuredImportDraft } from "./structuredImportModel";

const typeOptions = [
  ["mixed", "Mixed / 各题单独设置"],
  ["single-choice", "单选"],
  ["multiple-choice", "多选"],
  ["true-false-not-given", "TRUE / FALSE / NOT GIVEN"],
  ["yes-no-not-given", "YES / NO / NOT GIVEN"],
  ["matching", "匹配"],
  ["short-answer", "简答"],
  ["fill-blank", "句子填空"],
] as const;

function optionsFromText(text: string): Array<{ label: string; text: string }> {
  return text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const match = /^([A-H])(?:[.)])?\s+(.+)$/u.exec(line);
    return { label: match?.[1] ?? String.fromCharCode(65 + index), text: match?.[2] ?? line };
  });
}

function BatchQuestions({ draft, onChange }: { readonly draft: StructuredImportDraft; readonly onChange: (draft: StructuredImportDraft) => void }) {
  const groups = draft.passages.flatMap((passage) => passage.questionGroups.map((group) => ({ passage, group })));
  const [targetGroupId, setTargetGroupId] = useState(draft.editorState.activeGroupId ?? groups[0]?.group.id ?? "");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<BatchQuestionPreview | null>(null);
  const [accepted, setAccepted] = useState<readonly string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [rangePreview, setRangePreview] = useState<ReturnType<typeof previewQuestionRangeAssignment> | null>(null);
  const targetGroup = groups.find((entry) => entry.group.id === targetGroupId)?.group;
  const [defaults, setDefaults] = useState({ questionType: "mixed" as (typeof typeOptions)[number][0], instructions: "", maxWords: "", sharedOptionsText: "" });
  const ruleCandidates = useMemo(() => generateStructuredRuleCandidates(draft), [draft]);
  const [dismissedRules, setDismissedRules] = useState<readonly string[]>([]);

  const updatePreviewItem = (previewId: string, update: Partial<{ number: number; prompt: string; options: Array<{ label: string; text: string }> }>) => {
    if (!preview) return;
    const items = preview.items.map((item) => {
      const editable = {
        previewId: item.previewId,
        number: item.number,
        prompt: item.prompt,
        options: item.options,
        sourceLines: item.sourceLines,
      };
      return item.previewId === previewId ? { ...editable, ...update } : editable;
    });
    setPreview(revalidateBatchQuestionPreview(draft, items, preview.unparsedLines));
  };

  return (
    <section className="pdf-batch-panel">
      <header><ListChecks size={19} /><div><h3>批量题目与题组设置</h3><p>所有写入先形成预览；确认时才创建稳定 questionId，不覆盖已有题号。</p></div></header>
      <label>目标题组<select onChange={(event) => { setTargetGroupId(event.target.value); setPreview(null); setRangePreview(null); }} value={targetGroupId}>{groups.map(({ passage, group }) => <option key={group.id} value={group.id}>{passage.title} / {group.title || group.id}</option>)}</select></label>
      <label>粘贴多题文本<textarea onChange={(event) => { setText(event.target.value); setPreview(null); setMessage(null); }} placeholder={'14. First question\nA Option A\nB Option B\n15. Next question'} rows={7} value={text} /></label>
      <button className="button" disabled={!text.trim() || !targetGroupId} onClick={() => {
        const next = previewBatchQuestions(text, draft);
        setPreview(next);
        setAccepted(next.items.filter((item) => item.issues.length === 0).map((item) => item.previewId));
      }} type="button">生成可编辑预览</button>
      {preview && (
        <div className="pdf-batch-preview">
          <strong>将影响 {accepted.length} 道新题；当前题组已有 {targetGroup?.questions.length ?? 0} 道题。</strong>
          {preview.unparsedLines.map((line) => <p className="error-banner" key={line.lineNumber}>第 {line.lineNumber} 行未识别：{line.text}</p>)}
          {preview.items.map((item) => (
            <article key={item.previewId}>
              <label><input checked={accepted.includes(item.previewId)} disabled={item.issues.length > 0} onChange={(event) => setAccepted(event.target.checked ? [...accepted, item.previewId] : accepted.filter((id) => id !== item.previewId))} type="checkbox" />确认此题</label>
              <label>题号<input min={1} onChange={(event) => updatePreviewItem(item.previewId, { number: Number(event.target.value) })} type="number" value={item.number} /></label>
              <label>题干<textarea onChange={(event) => updatePreviewItem(item.previewId, { prompt: event.target.value })} rows={2} value={item.prompt} /></label>
              <label>选项<textarea onChange={(event) => updatePreviewItem(item.previewId, { options: optionsFromText(event.target.value) })} rows={3} value={item.options.map((option) => `${option.label} ${option.text}`).join("\n")} /></label>
              {item.issues.length > 0 && <p className="error-banner">阻塞：{item.issues.join("、")}</p>}
            </article>
          ))}
          <button className="button button--primary" disabled={accepted.length === 0 || accepted.some((id) => preview.items.find((item) => item.previewId === id)?.issues.length)} onClick={() => {
            const result = confirmBatchQuestions(draft, targetGroupId, preview, accepted);
            if (result.errors.length > 0) setMessage(result.errors.join(" ｜ "));
            else {
              onChange(result.draft);
              setMessage(`已确认写入 ${result.addedQuestionIds.length} 道题；请逐题复核题型和上下文。`);
              setText("");
              setPreview(null);
            }
          }} type="button"><CheckCircle2 size={15} />确认所选无歧义题目</button>
        </div>
      )}

      <details>
        <summary>按题号范围分配到题组</summary>
        <div className="pdf-batch-inline"><label>起始题号<input min={1} onChange={(event) => { setRangeStart(Number(event.target.value)); setRangePreview(null); }} type="number" value={rangeStart} /></label><label>结束题号<input min={1} onChange={(event) => { setRangeEnd(Number(event.target.value)); setRangePreview(null); }} type="number" value={rangeEnd} /></label><button className="button" onClick={() => setRangePreview(previewQuestionRangeAssignment(draft, rangeStart, rangeEnd, targetGroupId))} type="button">预览影响</button></div>
        {rangePreview && <div><p>{rangePreview.errors.length > 0 ? rangePreview.errors.join(" ｜ ") : `将按稳定 ID 移动 ${rangePreview.questionIds.length} 道题；题号和 questionId 均不改变。`}</p><button className="button" disabled={rangePreview.errors.length > 0 || rangePreview.questionIds.length === 0} onClick={() => { onChange(applyQuestionRangeAssignment(draft, rangePreview, targetGroupId)); setRangePreview(null); }} type="button">确认分配</button></div>}
      </details>

      <details>
        <summary>统一设置当前题组</summary>
        <p>预览影响：{targetGroup?.questions.length ?? 0} 道题会标记为待人工复核；稳定 ID、题号和答案不变。</p>
        <div className="pdf-group-fields"><label>题型<select onChange={(event) => setDefaults({ ...defaults, questionType: event.target.value as typeof defaults.questionType })} value={defaults.questionType}>{typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>说明<textarea onChange={(event) => setDefaults({ ...defaults, instructions: event.target.value })} rows={2} value={defaults.instructions} /></label><label>字数限制<input min={1} onChange={(event) => setDefaults({ ...defaults, maxWords: event.target.value })} type="number" value={defaults.maxWords} /></label><label>共享选项<textarea onChange={(event) => setDefaults({ ...defaults, sharedOptionsText: event.target.value })} rows={3} value={defaults.sharedOptionsText} /></label></div>
        <button className="button" disabled={!targetGroupId} onClick={() => onChange(applyGroupDefaults(draft, targetGroupId, { questionType: defaults.questionType, instructions: defaults.instructions, maxWords: defaults.maxWords ? Number(defaults.maxWords) : null, sharedOptionsText: defaults.sharedOptionsText }))} type="button">确认统一设置</button>
      </details>

      <details>
        <summary><ScanSearch size={14} />可解释规则候选（不会自动写入）</summary>
        <p>规则仅识别明确 Passage、Questions 区间、题号和 A-H 选项格式；重新查看不会重建草稿。</p>
        {ruleCandidates.filter((candidate) => !dismissedRules.includes(candidate.candidateId)).map((candidate) => <article className="pdf-rule-candidate" key={candidate.candidateId}><strong>p.{candidate.pageNumber} · {candidate.kind}</strong><span>{candidate.text}</span><small>{candidate.reason}{candidate.suggestedTargetId ? ` 建议目标：${candidate.suggestedTargetId}` : " 请人工选择目标。"}</small><button className="button button--ghost" onClick={() => setDismissedRules([...dismissedRules, candidate.candidateId])} type="button">拒绝候选</button></article>)}
        {ruleCandidates.length === 0 && <p>当前来源没有命中明确规则。</p>}
      </details>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function BatchAnswers({ draft, onChange }: { readonly draft: StructuredImportDraft; readonly onChange: (draft: StructuredImportDraft) => void }) {
  const [preview, setPreview] = useState<BatchAnswerPreview | null>(null);
  return (
    <section className="pdf-batch-panel">
      <header><ListChecks size={19} /><div><h3>批量答案预览</h3><p>先按题号逐条匹配；缺失、重复或歧义时整批拒绝，避免后续答案错位。</p></div></header>
      <label>粘贴 Answer Key<textarea onChange={(event) => { onChange(touchStructuredDraft(draft, { answerKeyText: event.target.value })); setPreview(null); }} placeholder={'1 FALSE\n2 TRUE\n18 B'} rows={7} value={draft.answerKeyText} /></label>
      <button className="button" disabled={!draft.answerKeyText.trim()} onClick={() => setPreview(previewBatchAnswers(draft.answerKeyText, draft))} type="button">预览答案匹配</button>
      {preview && <div className="pdf-batch-preview"><strong>{preview.items.filter((item) => item.status === "matched").length} 条唯一匹配</strong>{preview.items.map((item) => <p key={`${item.number}-${item.answer}`}>Question {item.number} → {item.answer} · {item.status}{item.questionId ? ` · ${item.questionId}` : ""}</p>)}{preview.invalidLines.map((line) => <p className="error-banner" key={line}>未识别：{line}</p>)}<button className="button button--primary" disabled={!preview.canConfirm} onClick={() => { onChange(applyPreviewedAnswers(draft, preview)); setPreview(null); }} type="button"><CheckCircle2 size={15} />确认写入全部唯一匹配</button></div>}
    </section>
  );
}

export function StructuredBatchPanel({ stage, draft, onChange }: { readonly stage: "structure" | "answers"; readonly draft: StructuredImportDraft; readonly onChange: (draft: StructuredImportDraft) => void }) {
  return stage === "structure" ? <BatchQuestions draft={draft} onChange={onChange} /> : <BatchAnswers draft={draft} onChange={onChange} />;
}
