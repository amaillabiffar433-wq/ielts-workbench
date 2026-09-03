import {
  sortRecentSessionSummaries,
  type PracticeSessionSummary,
} from "../../infrastructure/repositories/LearningRepository";

export type ModuleProgressStatus = "not-started" | "in-progress" | "completed";

function belongsToModule(
  summary: PracticeSessionSummary,
  packId: string,
  testId: string,
  moduleType: "reading" | "listening" | "writing",
): boolean {
  return (
    summary.packId === packId &&
    summary.testId === testId &&
    summary.moduleType === moduleType
  );
}

/**
 * Uses the newest durable, non-abandoned attempt for a module. A later new
 * attempt therefore moves a previously completed module back to in-progress.
 */
export function getModuleProgressStatus(
  summaries: readonly PracticeSessionSummary[],
  packId: string,
  testId: string,
  moduleType: "reading" | "listening" | "writing",
): ModuleProgressStatus {
  const latest = sortRecentSessionSummaries(summaries).find(
    (summary) =>
      summary.status !== "abandoned" &&
      belongsToModule(summary, packId, testId, moduleType),
  );
  if (!latest) return "not-started";
  return latest.status === "submitted" ? "completed" : "in-progress";
}

export function findRecentResumableSession(
  summaries: readonly PracticeSessionSummary[],
): PracticeSessionSummary | null {
  return (
    sortRecentSessionSummaries(summaries).find(
      (summary) =>
        summary.status === "in-progress" &&
        summary.mode !== "review" &&
        summary.packId !== undefined &&
        summary.testId !== undefined &&
        summary.moduleType !== undefined,
    ) ?? null
  );
}
