import type { IELTSPack, PackModule, Question } from "../../domain";
import { scoreQuestion } from "../../domain/questionScoring";
import type { PracticeSessionSummary, SessionSnapshot } from "../../infrastructure/repositories/LearningRepository";

export type AnalyticsModule = "reading" | "listening" | "writing";

export interface ModuleAnalytics {
  readonly moduleType: AnalyticsModule;
  readonly sessions: number;
  readonly completed: number;
  readonly elapsedSeconds: number;
  readonly earnedPoints: number;
  readonly scorablePoints: number;
}

export interface DailyActivity {
  readonly key: string;
  readonly label: string;
  readonly elapsedSeconds: number;
  readonly sessions: number;
  readonly earnedPoints: number;
  readonly scorablePoints: number;
}

export interface QuestionTypeAnalytics {
  readonly questionType: Question["type"];
  readonly attempts: number;
  readonly earnedPoints: number;
  readonly scorablePoints: number;
}

export interface LearningAnalytics {
  readonly sessions: number;
  readonly completed: number;
  readonly elapsedSeconds: number;
  readonly todaySeconds: number;
  readonly earnedPoints: number;
  readonly scorablePoints: number;
  readonly mistakes: number;
  readonly activeDays: number;
  readonly streakDays: number;
  readonly byModule: readonly ModuleAnalytics[];
  readonly recentDays: readonly DailyActivity[];
  readonly byQuestionType: readonly QuestionTypeAnalytics[];
}

function moduleQuestions(module: PackModule): readonly Question[] {
  return module.type === "writing"
    ? []
    : module.sections.flatMap((section) => section.questionGroups.flatMap((group) => group.questions));
}

function sessionModule(packById: ReadonlyMap<string, IELTSPack>, summary: PracticeSessionSummary): PackModule | undefined {
  const pack = summary.packId ? packById.get(summary.packId) : undefined;
  return pack?.modules.find((module) => module.testId === summary.testId && module.type === summary.moduleType);
}

function localDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildLearningAnalytics(
  packs: readonly IELTSPack[],
  summaries: readonly PracticeSessionSummary[],
  snapshots: ReadonlyMap<string, SessionSnapshot>,
  now = new Date(),
): LearningAnalytics {
  const packById = new Map(packs.map((pack) => [pack.manifest.id, pack]));
  const modules: AnalyticsModule[] = ["listening", "reading", "writing"];
  const moduleTotals = new Map<AnalyticsModule, { sessions: number; completed: number; elapsedSeconds: number; earnedPoints: number; scorablePoints: number }>(
    modules.map((moduleType) => [moduleType, { sessions: 0, completed: 0, elapsedSeconds: 0, earnedPoints: 0, scorablePoints: 0 }]),
  );
  const dayKeys = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - offset));
    return localDateKey(date);
  });
  const daily = new Map(dayKeys.map((key) => [key, { elapsedSeconds: 0, sessions: 0, earnedPoints: 0, scorablePoints: 0 }]));
  const questionTypes = new Map<Question["type"], { attempts: number; earnedPoints: number; scorablePoints: number }>();
  let earnedPoints = 0;
  let scorablePoints = 0;
  let mistakes = 0;

  summaries.forEach((summary) => {
    const moduleType = summary.moduleType;
    if (moduleType) {
      const total = moduleTotals.get(moduleType)!;
      total.sessions += 1;
      total.elapsedSeconds += summary.elapsedSeconds;
      if (summary.status === "submitted") total.completed += 1;
    }
    const day = daily.get(localDateKey(summary.updatedAt));
    if (day) {
      day.elapsedSeconds += summary.elapsedSeconds;
      day.sessions += 1;
    }
    if (summary.status !== "submitted") return;
    const snapshot = snapshots.get(summary.sessionId);
    const module = sessionModule(packById, summary);
    if (!snapshot || !module || module.type === "writing") return;
    const answers = new Map(snapshot.answers.map((answer) => [answer.questionId, answer.value]));
    moduleQuestions(module).forEach((question) => {
      const score = scoreQuestion(question, answers.get(question.id));
      earnedPoints += score.earnedPoints;
      scorablePoints += score.scorablePoints;
      if (score.scorablePoints > 0 && score.earnedPoints < score.scorablePoints) mistakes += 1;
      const total = moduleTotals.get(module.type)!;
      total.earnedPoints += score.earnedPoints;
      total.scorablePoints += score.scorablePoints;
      if (score.scorablePoints > 0) {
        const type = questionTypes.get(question.type) ?? { attempts: 0, earnedPoints: 0, scorablePoints: 0 };
        type.attempts += 1;
        type.earnedPoints += score.earnedPoints;
        type.scorablePoints += score.scorablePoints;
        questionTypes.set(question.type, type);
        const dayScore = daily.get(localDateKey(summary.updatedAt));
        if (dayScore) {
          dayScore.earnedPoints += score.earnedPoints;
          dayScore.scorablePoints += score.scorablePoints;
        }
      }
    });
  });

  const activeDateKeys = new Set(summaries.filter((summary) => summary.elapsedSeconds > 0).map((summary) => localDateKey(summary.updatedAt)));
  const todayKey = localDateKey(now);
  let streakDays = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  while (activeDateKeys.has(localDateKey(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    sessions: summaries.length,
    completed: summaries.filter((summary) => summary.status === "submitted").length,
    elapsedSeconds: summaries.reduce((total, summary) => total + summary.elapsedSeconds, 0),
    todaySeconds: summaries.filter((summary) => localDateKey(summary.updatedAt) === todayKey).reduce((total, summary) => total + summary.elapsedSeconds, 0),
    earnedPoints,
    scorablePoints,
    mistakes,
    activeDays: activeDateKeys.size,
    streakDays,
    byModule: modules.map((moduleType) => ({ moduleType, ...moduleTotals.get(moduleType)! })),
    recentDays: dayKeys.map((key) => ({
      key,
      label: new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }),
      ...daily.get(key)!,
    })),
    byQuestionType: [...questionTypes.entries()]
      .map(([questionType, totals]) => ({ questionType, ...totals }))
      .sort((left, right) => right.attempts - left.attempts || left.questionType.localeCompare(right.questionType)),
  };
}

export function formatStudyDuration(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? "<1 min" : "0 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
