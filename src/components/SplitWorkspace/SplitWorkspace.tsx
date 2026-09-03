import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { Group, Panel, Separator, type Layout } from "react-resizable-panels";
import "./SplitWorkspace.css";

export type SplitLayout = { left: number; right: number };

export function SplitWorkspace({
  left,
  right,
  defaultLayout = { left: 52, right: 48 },
  onLayoutChanged,
}: {
  left: ReactNode;
  right: ReactNode;
  defaultLayout?: SplitLayout;
  onLayoutChanged?: (layout: SplitLayout) => void;
}) {
  const handleLayoutChanged = (layout: Layout) => {
    const leftSize = layout.left;
    const rightSize = layout.right;
    if (typeof leftSize === "number" && typeof rightSize === "number") {
      onLayoutChanged?.({ left: leftSize, right: rightSize });
    }
  };

  return (
    <Group
      className="split-workspace"
      defaultLayout={defaultLayout}
      id="reading-split-workspace"
      onLayoutChanged={handleLayoutChanged}
      orientation="horizontal"
    >
      <Panel className="split-panel" id="left" minSize="28%">
        {left}
      </Panel>
      <Separator aria-label="调整左右窗格宽度" className="split-separator" id="reading-split-handle">
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
