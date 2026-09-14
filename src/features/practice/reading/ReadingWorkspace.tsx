import { useState, type ReactNode } from "react";
import { Focus, Maximize, Type, X } from "lucide-react";
import { SegmentedControl } from "../../../components/common/SegmentedControl";
import { toggleWindowFullscreen } from "../../../infrastructure/window/windowPresentation";
import { useWorkbenchStore } from "../../../stores/workbenchStore";
import type { PaneSide } from "./readingPaneIdentity";

/** Pure presentation shell. Canonical Pane selections and practice data stay in ReadingWorkbench. */
export function ReadingWorkspace({ toolbar, panes, navigator, visiblePane, onVisiblePaneChange, answered, total }: {
  toolbar: ReactNode;
  panes: ReactNode;
  navigator: ReactNode;
  visiblePane: PaneSide | null;
  onVisiblePaneChange: (side: PaneSide | null) => void;
  answered: number;
  total: number;
}) {
  const [focused, setFocused] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [fontSize, setFontSize] = useState(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-size-reading")) || 17);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const sessionId = useWorkbenchStore((state) => state.session?.sessionId);
  const saveSetting = useWorkbenchStore((state) => state.saveSetting);
  const notes = annotations.filter((annotation) => annotation.sessionId === sessionId && annotation.note?.trim());

  return (
    <div className={`reading-workbench${focused ? " reading-workbench--focus" : ""}`}>
      {toolbar}
      <div className="reading-display-toolbar" aria-label="阅读显示工具">
        <SegmentedControl label="窗格布局" value={visiblePane ? "single" : "dual"}
          options={[{ value: "single", label: "单 Pane" }, { value: "dual", label: "双 Pane" }]}
          onChange={(value) => onVisiblePaneChange(value === "single" ? "left" : null)} />
        {visiblePane && <SegmentedControl label="当前单窗格" value={visiblePane}
          options={[{ value: "left", label: "Pane A" }, { value: "right", label: "Pane B" }]}
          onChange={onVisiblePaneChange} />}
        <span className="reading-display-toolbar__hint">{visiblePane ? "另一窗格的选择与数据保持不变" : "独立选择与滚动 · 拖动中线调整宽度"}</span>
        <div className="practice-toolbar__spacer" />
        <label className="reading-progress"><span>{answered} / {total}</span><progress aria-label="作答进度" max={Math.max(1, total)} value={answered} /></label>
        <button className="button button--ghost" aria-pressed={focused} onClick={() => setFocused(!focused)} type="button"><Focus aria-hidden="true" size={15} />{focused ? "退出专注" : "专注"}</button>
        <div className="reading-font-control">
          <button aria-expanded={fontOpen} className="button button--ghost" onClick={() => {
            if (!fontOpen) setFontSize(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-size-reading")) || 17);
            setFontOpen(!fontOpen);
          }} type="button"><Type aria-hidden="true" size={15} />字体</button>
          {fontOpen && <div className="reading-font-popover" role="group" aria-label="阅读字体设置">
            <label htmlFor="reading-font-size">正文字号 · {fontSize}px</label>
            <input id="reading-font-size" type="range" min="15" max="21" step="1" value={fontSize} onChange={(event) => {
              const value = Number(event.target.value);
              setFontSize(value);
              document.documentElement.style.setProperty("--font-size-reading", `${value}px`);
              void saveSetting("appearance.readingFontSize", String(value)).catch(() => { /* Store exposes persistence errors. */ });
            }} />
            <button aria-label="关闭字体设置" className="icon-button" onClick={() => setFontOpen(false)} type="button"><X aria-hidden="true" size={14} /></button>
          </div>}
        </div>
        <button className="button button--ghost" onClick={() => {
          setPresentationError(null);
          void toggleWindowFullscreen().catch((error: unknown) => setPresentationError(`无法切换全屏：${error instanceof Error ? error.message : String(error)}`));
        }} type="button"><Maximize aria-hidden="true" size={15} />全屏</button>
      </div>
      {presentationError && <div className="error-banner" role="alert">{presentationError}</div>}
      <div className="reading-workbench__panes">{panes}</div>
      <div className="reading-workbench__bottom">
        <section className="reading-notes" aria-label="我的笔记">
          <header><strong>我的笔记</strong><span>{notes.length} 条标记笔记</span></header>
          <div className="reading-notes__body">
            {notes.length ? notes.map((note) => <p key={note.id}>{note.note}</p>) : <p className="reading-notes__empty">选中文字，填写高亮工具栏中的笔记后创建标记。</p>}
          </div>
        </section>
        {navigator}
      </div>
    </div>
  );
}
