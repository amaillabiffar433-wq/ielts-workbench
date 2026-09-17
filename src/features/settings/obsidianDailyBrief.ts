import type { LearningAnalytics } from "../progress/learningAnalytics";

const labels = { listening: "Listening", reading: "Reading", writing: "Writing" } as const;

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function localIsoDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function buildObsidianDailyBrief(analytics: LearningAnalytics, dueReviewCount: number, date = localIsoDate()): string {
  const accuracy = analytics.scorablePoints > 0
    ? `${Math.round((analytics.earnedPoints / analytics.scorablePoints) * 100)}% (${analytics.earnedPoints}/${analytics.scorablePoints})`
    : "No scored objective answers yet";
  const skills = analytics.byModule.map((item) => {
    const skillAccuracy = item.scorablePoints > 0 ? ` · ${Math.round((item.earnedPoints / item.scorablePoints) * 100)}% objective accuracy` : "";
    return `- ${labels[item.moduleType]}: ${item.completed} completed · ${duration(item.elapsedSeconds)}${skillAccuracy}`;
  });
  return [
    `date: ${date}`,
    "source: IELTS Workbench local workspace",
    "",
    "## IELTS Workbench",
    `- Focus today: ${duration(analytics.todaySeconds)}`,
    `- Completed sessions, all time: ${analytics.completed}`,
    `- Objective accuracy, all time: ${accuracy}`,
    `- Review due now: ${dueReviewCount}`,
    `- Objective mistakes recorded: ${analytics.mistakes}`,
    "",
    "### Skill record",
    ...skills,
    "",
    "> Generated only from persisted local sessions. Writing quality is not auto-scored.",
  ].join("\n");
}
