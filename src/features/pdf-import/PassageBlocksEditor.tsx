import { VisualBlock } from "../../components/VisualBlock/VisualBlock";
import { moveArrayItem, type StructuredPassageDraft } from "./structuredImportModel";

export function PassageBlocksEditor({ passage, onChange }: { readonly passage: StructuredPassageDraft; readonly onChange: (passage: StructuredPassageDraft) => void }) {
  return <div>{passage.contentBlocks.map((block, index) => <section key={block.id}>
    {block.visual && <VisualBlock visual={block.visual} />}
    <label>{index === 0 ? "正文" : `正文块 ${index + 1}`}<textarea rows={block.visual ? 2 : 7} value={block.text} onChange={(event) => onChange({ ...passage, contentBlocks: passage.contentBlocks.map((item) => item.id === block.id ? { ...item, text: event.target.value } : item) })} /></label>
    <div className="pdf-actions">
      <button type="button" disabled={index === 0} onClick={() => onChange({ ...passage, contentBlocks: moveArrayItem(passage.contentBlocks, index, index - 1) })}>上移正文块</button>
      <button type="button" disabled={index === passage.contentBlocks.length - 1} onClick={() => onChange({ ...passage, contentBlocks: moveArrayItem(passage.contentBlocks, index, index + 1) })}>下移正文块</button>
      <button type="button" disabled={passage.contentBlocks.length === 1} onClick={() => { if (window.confirm("删除此草稿正文块？不删除原 PDF、图片文件或已安装题包。")) onChange({ ...passage, contentBlocks: passage.contentBlocks.filter((item) => item.id !== block.id) }); }}>删除正文块</button>
      <button type="button" disabled={Boolean(block.visual) || !/\n\s*\n/u.test(block.text)} onClick={() => onChange({ ...passage, contentBlocks: passage.contentBlocks.flatMap((item) => item.id !== block.id ? [item] : item.text.split(/\n\s*\n/u).filter((text) => text.trim()).map((text, part) => ({ ...item, id: part === 0 ? item.id : `content-${crypto.randomUUID()}`, text }))) })}>按空行拆分</button>
      <button type="button" disabled={Boolean(block.visual) || index === 0 || Boolean(passage.contentBlocks[index - 1]?.visual)} onClick={() => onChange({ ...passage, contentBlocks: passage.contentBlocks.flatMap((item, position) => position === index ? [] : position === index - 1 ? [{ ...item, text: `${item.text}\n\n${block.text}`, sourcePages: [...new Set([...item.sourcePages, ...block.sourcePages])] }] : [item]) })}>合并到上一块</button>
    </div>
  </section>)}</div>;
}
