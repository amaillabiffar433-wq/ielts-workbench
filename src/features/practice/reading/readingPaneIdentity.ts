import type { ReadingPaneView } from "./readingViewState";

export type PaneSide = "left" | "right";

export function paneShowsQuestions(view: ReadingPaneView): boolean {
  return view === "questions" || view === "whole";
}

export function paneInstanceId(side: PaneSide): string {
  return `${side}-pane`;
}
