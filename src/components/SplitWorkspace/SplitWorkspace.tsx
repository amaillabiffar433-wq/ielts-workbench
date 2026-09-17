import { useRef, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { Group, Panel, Separator, type GroupImperativeHandle, type Layout } from "react-resizable-panels";
import "./SplitWorkspace.css";

export type SplitLayout = { left: number; right: number };

export function SplitWorkspace({
  left,
  right,
  defaultLayout = { left: 54, right: 46 },
  resetLayout = { left: 54, right: 46 },
  onLayoutChanged,
  visiblePane = null,
}: {
  left: ReactNode;
  right: ReactNode;
  defaultLayout?: SplitLayout;
  resetLayout?: SplitLayout;
  onLayoutChanged?: (layout: SplitLayout) => void;
  /** Presentation only. Both Pane instances stay mounted with their stable identities. */
  visiblePane?: "left" | "right" | null;
}) {
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  const handleLayoutChanged = (layout: Layout) => {
    const leftSize = layout.left;
    const rightSize = layout.right;
    if (typeof leftSize === "number" && typeof rightSize === "number") {
      if (!visiblePane) onLayoutChanged?.({ left: leftSize, right: rightSize });
    }
  };
  const reset = () => {
    if (visiblePane) return;
    const applied = groupRef.current?.setLayout(resetLayout) ?? resetLayout;
    handleLayoutChanged(applied);
  };

  return (
    <Group
      className="split-workspace"
      data-visible-pane={visiblePane ?? "both"}
      defaultLayout={defaultLayout}
      groupRef={groupRef}
      id="reading-split-workspace"
      onLayoutChanged={handleLayoutChanged}
      orientation="horizontal"
    >
      <Panel className="split-panel" id="left" minSize="28%">
        {left}
      </Panel>
      <Separator aria-label="Resize reading panes" className="split-separator" id="reading-split-handle" onDoubleClick={reset} title="Drag to resize · Double-click to reset to 54 / 46">
        <span className="split-separator__grip" aria-hidden="true">
          <GripVertical size={14} />
        </span>
      </Separator>
      <Panel className="split-panel" id="right" minSize="28%">
        {right}
      </Panel>
    </Group>
  );
}
