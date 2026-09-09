import { ArrowDown, ArrowUp, List, Plus, Table2, Text, Trash2 } from "lucide-react";

import { QuestionGroupContext } from "../../components/QuestionGroupContext/QuestionGroupContext";
import {
  MAX_QUESTION_CONTEXT_BLOCKS,
  MAX_QUESTION_CONTEXT_LIST_ITEMS,
  MAX_QUESTION_CONTEXT_TABLE_COLUMNS,
  MAX_QUESTION_CONTEXT_TABLE_ROWS,
} from "../../domain";
import {
  boundStructuredQuestionIds,
  createStructuredContextList,
  createStructuredContextParagraph,
  createStructuredContextTable,
  moveArrayItem,
  resizeStructuredContextTable,
  type StructuredContextBlockDraft,
  type StructuredContextTableDraft,
  type StructuredGroupDraft,
} from "./structuredImportModel";
import "./StructuredContextEditor.css";

function blockBindingCount(block: StructuredContextBlockDraft): number {
  return block.type === "table"
    ? block.rows.reduce((sum, row) => sum + row.cells.filter((cell) => cell.questionId).length, 0)
    : 0;
}

function droppedBindings(
  table: StructuredContextTableDraft,
  rows: number,
  columns: number,
): string[] {
  return table.rows.flatMap((row, rowIndex) => row.cells.flatMap((cell, columnIndex) => (
    cell.questionId && (rowIndex >= rows || columnIndex >= columns) ? [cell.questionId] : []
  )));
}

export function StructuredContextEditor({
  group,
  onChange,
}: {
  readonly group: StructuredGroupDraft;
  readonly onChange: (group: StructuredGroupDraft) => void;
}) {
  const boundQuestionIds = boundStructuredQuestionIds(group);
  const updateBlock = (blockId: string, update: (block: StructuredContextBlockDraft) => StructuredContextBlockDraft) => {
    onChange({
      ...group,
      contextBlocks: group.contextBlocks.map((block) => block.id === blockId ? update(block) : block),
    });
  };
  const removeBlock = (block: StructuredContextBlockDraft) => {
    const bindings = blockBindingCount(block);
    if (bindings > 0 && !window.confirm(`删除此上下文块会解除 ${bindings} 个表格作答位置，但不会删除题目或已有答案。确定继续吗？`)) return;
    onChange({ ...group, contextBlocks: group.contextBlocks.filter((candidate) => candidate.id !== block.id) });
  };
  const resizeTable = (table: StructuredContextTableDraft, rows: number, columns: number) => {
    const dropped = droppedBindings(table, rows, columns);
    if (dropped.length > 0 && !window.confirm(`缩小表格会解除 ${dropped.length} 个题目绑定，但不会删除题目或答案。确定继续吗？`)) return;
    updateBlock(table.id, () => resizeStructuredContextTable(table, rows, columns));
  };

  const addBlock = (block: StructuredContextBlockDraft) => {
    if (group.contextBlocks.length >= MAX_QUESTION_CONTEXT_BLOCKS) return;
    onChange({ ...group, contextBlocks: [...group.contextBlocks, block] });
  };

  return (
    <section className="structured-context-editor" onClick={(event) => event.stopPropagation()}>
      <header>
        <div><h4>题组结构化上下文</h4><p>人工添加段落、单层列表或规则表格；稳定 ID 在编辑和恢复时保持不变。</p></div>
        <div className="structured-context-editor__add">
          <button className="button button--ghost" disabled={group.contextBlocks.length >= MAX_QUESTION_CONTEXT_BLOCKS} onClick={() => addBlock(createStructuredContextParagraph())} type="button"><Text size={14} />段落</button>
          <button className="button button--ghost" disabled={group.contextBlocks.length >= MAX_QUESTION_CONTEXT_BLOCKS} onClick={() => addBlock(createStructuredContextList())} type="button"><List size={14} />列表</button>
          <button className="button button--ghost" disabled={group.contextBlocks.length >= MAX_QUESTION_CONTEXT_BLOCKS} onClick={() => addBlock(createStructuredContextTable())} type="button"><Table2 size={14} />表格</button>
        </div>
      </header>

      {group.contextBlocks.length === 0 && <p className="structured-context-editor__empty">没有结构化上下文；该题组仍按旧版题组说明与普通题目方式显示。</p>}

      {group.contextBlocks.map((block, blockIndex) => (
        <article className="structured-context-block" key={block.id}>
          <header>
            <strong>{block.type === "paragraph" ? "段落" : block.type === "list" ? "列表" : "规则表格"}</strong>
            <code>{block.id}</code>
            <div>
              <button aria-label="上移上下文块" className="button button--ghost" disabled={blockIndex === 0} onClick={() => onChange({ ...group, contextBlocks: moveArrayItem(group.contextBlocks, blockIndex, blockIndex - 1) })} type="button"><ArrowUp size={13} /></button>
              <button aria-label="下移上下文块" className="button button--ghost" disabled={blockIndex === group.contextBlocks.length - 1} onClick={() => onChange({ ...group, contextBlocks: moveArrayItem(group.contextBlocks, blockIndex, blockIndex + 1) })} type="button"><ArrowDown size={13} /></button>
              <button aria-label="删除上下文块" className="button button--ghost" onClick={() => removeBlock(block)} type="button"><Trash2 size={13} /></button>
            </div>
          </header>

          {block.type === "paragraph" && (
            <label>段落文字<textarea maxLength={4_000} onChange={(event) => updateBlock(block.id, () => ({ ...block, text: event.target.value }))} rows={3} value={block.text} /></label>
          )}

          {block.type === "list" && (
            <div className="structured-context-list-editor">
              <label>列表样式<select onChange={(event) => updateBlock(block.id, () => ({ ...block, style: event.target.value as "ordered" | "unordered" }))} value={block.style}><option value="ordered">有序列表</option><option value="unordered">无序列表</option></select></label>
              {block.items.map((item, itemIndex) => (
                <div className="structured-context-list-item" key={item.id}>
                  <span>{block.style === "ordered" ? `${itemIndex + 1}.` : "•"}</span>
                  <textarea aria-label={`列表项 ${itemIndex + 1}`} maxLength={4_000} onChange={(event) => updateBlock(block.id, () => ({ ...block, items: block.items.map((candidate) => candidate.id === item.id ? { ...candidate, text: event.target.value } : candidate) }))} rows={2} value={item.text} />
                  <button aria-label={`上移列表项 ${itemIndex + 1}`} className="button button--ghost" disabled={itemIndex === 0} onClick={() => updateBlock(block.id, () => ({ ...block, items: moveArrayItem(block.items, itemIndex, itemIndex - 1) }))} type="button"><ArrowUp size={13} /></button>
                  <button aria-label={`下移列表项 ${itemIndex + 1}`} className="button button--ghost" disabled={itemIndex === block.items.length - 1} onClick={() => updateBlock(block.id, () => ({ ...block, items: moveArrayItem(block.items, itemIndex, itemIndex + 1) }))} type="button"><ArrowDown size={13} /></button>
                  <button aria-label={`删除列表项 ${itemIndex + 1}`} className="button button--ghost" disabled={block.items.length === 1} onClick={() => updateBlock(block.id, () => ({ ...block, items: block.items.filter((candidate) => candidate.id !== item.id) }))} type="button"><Trash2 size={13} /></button>
                </div>
              ))}
              <button className="button button--ghost" disabled={block.items.length >= MAX_QUESTION_CONTEXT_LIST_ITEMS} onClick={() => {
                const item = createStructuredContextList(block.style).items[0];
                updateBlock(block.id, () => ({ ...block, items: [...block.items, item] }));
              }} type="button"><Plus size={13} />新增列表项</button>
            </div>
          )}

          {block.type === "table" && (
            <div className="structured-context-table-editor">
              <div className="structured-context-table-editor__controls">
                <label>行数<input max={MAX_QUESTION_CONTEXT_TABLE_ROWS} min={1} onChange={(event) => resizeTable(block, Number(event.target.value), block.rows[0].cells.length)} type="number" value={block.rows.length} /></label>
                <label>列数<input max={MAX_QUESTION_CONTEXT_TABLE_COLUMNS} min={1} onChange={(event) => resizeTable(block, block.rows.length, Number(event.target.value))} type="number" value={block.rows[0].cells.length} /></label>
                <div aria-label="表格行列操作" className="structured-context-table-editor__resize-actions" role="group">
                  <button aria-label="新增表格行" className="button button--ghost" disabled={block.rows.length >= MAX_QUESTION_CONTEXT_TABLE_ROWS} onClick={() => resizeTable(block, block.rows.length + 1, block.rows[0].cells.length)} type="button"><Plus size={13} />行</button>
                  <button aria-label="删除最后一行" className="button button--ghost" disabled={block.rows.length <= 1} onClick={() => resizeTable(block, block.rows.length - 1, block.rows[0].cells.length)} type="button"><Trash2 size={13} />行</button>
                  <button aria-label="新增表格列" className="button button--ghost" disabled={block.rows[0].cells.length >= MAX_QUESTION_CONTEXT_TABLE_COLUMNS} onClick={() => resizeTable(block, block.rows.length, block.rows[0].cells.length + 1)} type="button"><Plus size={13} />列</button>
                  <button aria-label="删除最后一列" className="button button--ghost" disabled={block.rows[0].cells.length <= 1} onClick={() => resizeTable(block, block.rows.length, block.rows[0].cells.length - 1)} type="button"><Trash2 size={13} />列</button>
                </div>
                <label><input checked={block.hasHeaderRow} onChange={(event) => updateBlock(block.id, () => ({ ...block, hasHeaderRow: event.target.checked }))} type="checkbox" />首行为表头</label>
                <label><input checked={block.hasRowHeaders} onChange={(event) => updateBlock(block.id, () => ({ ...block, hasRowHeaders: event.target.checked }))} type="checkbox" />首列为行标题</label>
              </div>
              <div className="structured-context-table-editor__scroll">
                <table>
                  <tbody>{block.rows.map((row, rowIndex) => (
                    <tr key={row.id}>{row.cells.map((cell, cellIndex) => {
                      const availableQuestions = group.questions.filter((question) => (
                        (question.type === "short-answer" || question.type === "fill-blank")
                        && (!boundQuestionIds.has(question.id) || question.id === cell.questionId)
                      ));
                      return (
                        <td key={cell.id}>
                          <textarea aria-label={`表格第 ${rowIndex + 1} 行第 ${cellIndex + 1} 列文字`} maxLength={4_000} onChange={(event) => updateBlock(block.id, () => ({ ...block, rows: block.rows.map((candidateRow) => candidateRow.id === row.id ? { ...candidateRow, cells: candidateRow.cells.map((candidateCell) => candidateCell.id === cell.id ? { ...candidateCell, text: event.target.value } : candidateCell) } : candidateRow) }))} rows={2} value={cell.text} />
                          <label>作答位置<select aria-label={`表格第 ${rowIndex + 1} 行第 ${cellIndex + 1} 列题目绑定`} onChange={(event) => updateBlock(block.id, () => ({ ...block, rows: block.rows.map((candidateRow) => candidateRow.id === row.id ? { ...candidateRow, cells: candidateRow.cells.map((candidateCell) => candidateCell.id === cell.id ? { ...candidateCell, ...(event.target.value ? { questionId: event.target.value } : { questionId: undefined }) } : candidateCell) } : candidateRow) }))} value={cell.questionId ?? ""}><option value="">不绑定</option>{availableQuestions.map((question) => <option key={question.id} value={question.id}>Q{question.number} · {question.prompt.slice(0, 44)}</option>)}</select></label>
                          <code>{cell.id}</code>
                        </td>
                      );
                    })}</tr>
                  ))}</tbody>
                </table>
              </div>
              <p>改变行列数会保留仍位于范围内的行、单元格 ID 与 questionId 绑定；删除含绑定的位置前会确认。</p>
            </div>
          )}
        </article>
      ))}

      {group.contextBlocks.length > 0 && (
        <section className="structured-context-preview">
          <h4>接近练习效果的预览</h4>
          <QuestionGroupContext
            blocks={group.contextBlocks}
            editableQuestionIds={new Set(group.questions.map((question) => question.id))}
            instanceId={`import-preview-${group.id}`}
            questions={group.questions.map((question) => ({ id: question.id, displayNumber: question.number, prompt: question.prompt }))}
            readOnly
            renderAnswerSlot={(question) => (
              <label className="structured-context-preview__answer">Question {question.displayNumber}<input aria-label={`Question ${question.displayNumber} 预览答案`} disabled placeholder="练习时在此作答" /></label>
            )}
          />
        </section>
      )}
    </section>
  );
}
