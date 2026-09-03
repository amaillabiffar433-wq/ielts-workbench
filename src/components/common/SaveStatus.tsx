import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import "./common.css";

export type SaveState = "idle" | "saving" | "saved" | "error";

const labels: Record<SaveState, string> = {
  idle: "尚无更改",
  saving: "正在保存",
  saved: "已自动保存",
  error: "保存失败",
};

export function SaveStatus({ state, detail }: { state: SaveState; detail?: string }) {
  return (
    <span aria-live="polite" className={`save-status save-status--${state}`} role="status">
      {state === "saving" && <LoaderCircle aria-hidden="true" className="save-status__spinner" size={14} />}
      {state === "saved" && <Check aria-hidden="true" size={14} />}
      {state === "error" && <AlertCircle aria-hidden="true" size={14} />}
      <span>{detail ?? labels[state]}</span>
    </span>
  );
}
