import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Focus, Maximize, Type, X } from "lucide-react";
import { SegmentedControl } from "../../../components/common/SegmentedControl";
import { toggleWindowFullscreen } from "../../../infrastructure/window/windowPresentation";
import { useWorkbenchStore } from "../../../stores/workbenchStore";
import type { PaneSide } from "./readingPaneIdentity";

/** Pure presentation shell. Canonical Pane selections and practice data stay in ReadingWorkbench. */
export function ReadingWorkspace({ toolbar, panes, navigator, visiblePane, onVisiblePaneChange, answered, total, passageTabs }: {
  toolbar: ReactNode;
  panes: ReactNode;
  navigator: ReactNode;
  visiblePane: PaneSide | null;
  onVisiblePaneChange: (side: PaneSide | null) => void;
  answered: number;
  total: number;
  passageTabs?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [fontSize, setFontSize] = useState(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-size-reading")) || 18);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const annotations = useWorkbenchStore((state) => state.annotations);
  const sessionId = useWorkbenchStore((state) => state.session?.sessionId);
  const saveSetting = useWorkbenchStore((state) => state.saveSetting);
  const notes = annotations.filter((annotation) => annotation.sessionId === sessionId && annotation.note?.trim());

  return (
    <div className={`reading-workbench${focused ? " reading-workbench--focus" : ""}`}>
      {toolbar}
      {passageTabs}
      <div className="reading-display-toolbar" aria-label="Reading display tools">
        <SegmentedControl label="Pane layout" value={visiblePane ? "single" : "dual"}
          options={[{ value: "single", label: "Single pane" }, { value: "dual", label: "Dual pane" }]}
          onChange={(value) => onVisiblePaneChange(value === "single" ? "left" : null)} />
        {visiblePane && <SegmentedControl label="Visible pane" value={visiblePane}
          options={[{ value: "left", label: "Pane A" }, { value: "right", label: "Pane B" }]}
          onChange={onVisiblePaneChange} />}
        <span className="reading-display-toolbar__hint">{visiblePane ? "The hidden pane keeps its selection and data" : "Independent selection and scrolling · drag the divider to resize"}</span>
        <div className="practice-toolbar__spacer" />
        <Link className="button button--ghost" to="/vocabulary">Vocabulary</Link>
        <label className="reading-progress"><span>{answered} / {total}</span><progress aria-label="Answer progress" max={Math.max(1, total)} value={answered} /></label>
        <button className="button button--ghost" aria-pressed={focused} onClick={() => setFocused(!focused)} type="button"><Focus aria-hidden="true" size={15} />{focused ? "Exit focus" : "Focus"}</button>
        <div className="reading-font-control">
          <button aria-expanded={fontOpen} className="button button--ghost" onClick={() => {
            if (!fontOpen) setFontSize(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--font-size-reading")) || 18);
            setFontOpen(!fontOpen);
          }} type="button"><Type aria-hidden="true" size={15} />Type</button>
          {fontOpen && <div className="reading-font-popover" role="group" aria-label="Reading typography settings">
            <label htmlFor="reading-font-size">Reading size · {fontSize}px</label>
            <input id="reading-font-size" type="range" min="15" max="21" step="1" value={fontSize} onChange={(event) => {
              const value = Number(event.target.value);
              setFontSize(value);
              document.documentElement.style.setProperty("--font-size-reading", `${value}px`);
              void saveSetting("appearance.readingFontSize", String(value)).catch(() => { /* Store exposes persistence errors. */ });
            }} />
            <button aria-label="Close typography settings" className="icon-button" onClick={() => setFontOpen(false)} type="button"><X aria-hidden="true" size={14} /></button>
          </div>}
        </div>
        <button className="button button--ghost" onClick={() => {
          setPresentationError(null);
          void toggleWindowFullscreen().catch((error: unknown) => setPresentationError(`Unable to toggle fullscreen: ${error instanceof Error ? error.message : String(error)}`));
        }} type="button"><Maximize aria-hidden="true" size={15} />Fullscreen</button>
      </div>
      {presentationError && <div className="error-banner" role="alert">{presentationError}</div>}
      <div className="reading-workbench__panes">{panes}</div>
      <div className="reading-workbench__bottom">
        <section className="reading-notes" aria-label="My notes">
          <header><strong>My notes</strong><span>{notes.length} annotation note{notes.length === 1 ? "" : "s"}</span></header>
          <div className="reading-notes__body">
            {notes.length ? notes.map((note) => <p key={note.id}>{note.note}</p>) : <p className="reading-notes__empty">Select text, add an optional note in the annotation toolbar, and save the annotation.</p>}
          </div>
        </section>
        {navigator}
      </div>
    </div>
  );
}
