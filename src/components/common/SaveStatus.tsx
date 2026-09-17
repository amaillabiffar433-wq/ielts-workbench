import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import "./common.css";

export type SaveState = "idle" | "saving" | "saved" | "error";

const labels: Record<SaveState, string> = {
  idle: "No changes",
  saving: "Saving",
  saved: "Autosaved",
  error: "Save failed",
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
