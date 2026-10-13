import { displayQuestionAnswer, displayQuestionCorrectAnswer, questionNumberLabel, scoreQuestion } from "../../domain";
import type { LearningRepository } from "../../infrastructure/repositories/LearningRepository";
import { localIsoDate } from "./obsidianDailyBrief";
import { speakingRepository } from "../../infrastructure/repositories/SpeakingRepository";

const pendingKey = "integration.obsidianPendingDates";
const clean = (text: string) => text.replace(/[\r\n]+/g, " ").replaceAll("<!--", "&lt;!--");
const seconds = (value: number) => `${Math.floor(value / 60)} min ${value % 60} sec`;

export async function syncObsidianSessions(repository: LearningRepository, date?: string): Promise<string> {
  const vault = await repository.getSetting("integration.obsidianVault");
  if (!vault) return "Choose a vault in Settings to enable practice summaries.";
  let pending: string[] = [];
  try { pending = JSON.parse(await repository.getSetting(pendingKey) ?? "[]") as string[]; } catch { /* Repair an invalid queue without changing notes. */ }
  if (date && !pending.includes(date)) pending.push(date);
  await repository.setSetting(pendingKey, JSON.stringify(pending));
  const sessions = await repository.listRecentSessions();
  const vocabulary = await repository.listVocabularyItems();
  const speaking = await speakingRepository.sessions();
  const speakingTopics = await speakingRepository.topics();
  let lastPath = "";
  for (const day of [...pending]) {
    const lines = [`date: ${day}`, "source: Luma local workspace", "", "## Luma practice", ""];
    const completed = sessions.filter(s => s.status === "submitted" && localIsoDate(new Date(s.submittedAt ?? s.updatedAt)) === day);
    for (const summary of completed) {
      const snapshot = await repository.loadSession(summary.sessionId);
      const pack = summary.packId ? await repository.loadPack(summary.packId) : null;
      if (!snapshot || !pack) throw new Error("A submitted session or its source pack is unavailable; sync remains queued.");
      const module = pack.modules.find(m => m.testId === summary.testId && m.type === summary.moduleType);
      if (!module) throw new Error("The submitted module is unavailable; sync remains queued.");
      const title = `${clean(pack.manifest.title)} · ${module.type} · ${summary.mode}`;
      lines.push(`### ${title}`, `- Session: \`${summary.sessionId}\``, `- Recorded session time: ${seconds(summary.elapsedSeconds)}`);
      if (module.type === "writing") lines.push("- Writing: self-assessment; no automatic score.");
      else {
        const answers = new Map(snapshot.answers.map(a => [a.questionId, a.value]));
        const results = module.sections.flatMap(s => s.questionGroups.flatMap(g => g.questions.map(q => ({q, score:scoreQuestion(q,answers.get(q.id))}))));
        lines.push(`- Raw score: ${results.reduce((n,r)=>n+r.score.earnedPoints,0)}/${results.reduce((n,r)=>n+r.score.scorablePoints,0)}`);
        for (const {q,score} of results.filter(r => r.score.scorablePoints > r.score.earnedPoints)) {
          lines.push(`- Q${questionNumberLabel(q)}: ${clean(displayQuestionAnswer(q,answers.get(q.id)))} → ${clean(displayQuestionCorrectAnswer(q))} (${score.status})`);
        }
      }
      lines.push(`- Source: ${clean(pack.manifest.title)} / ${summary.testId}`, `- Return in Luma: Library → ${clean(pack.manifest.title)} → ${module.type}; Results session ${summary.sessionId}`, "");
      const words = vocabulary.filter(v => v.sourcePackId === summary.packId && v.sourceTestId === summary.testId && Date.parse(v.createdAt)>=Date.parse(summary.startedAt) && Date.parse(v.createdAt)<=Date.parse(summary.submittedAt ?? summary.updatedAt));
      for (const word of words) lines.push(`- Vocabulary: **${clean(word.term)}** — ${clean(word.sentence)}${word.note ? ` — ${clean(word.note)}` : ""}`);
      lines.push("");
    }
    const completedSpeaking=speaking.filter(s=>s.status==="completed"&&localIsoDate(new Date(s.completedAt??s.updatedAt))===day);
    for(const attempt of completedSpeaking){const topic=speakingTopics.find(t=>t.id===attempt.topicId);lines.push(`### Speaking · ${clean(topic?.title??attempt.topicId)}`,`- Session: \`${attempt.id}\``,`- Recorded session time: ${seconds(attempt.elapsedSeconds)}`,"- Self practice; no automatic score.",`- Source: ${clean(topic?.sourceTitle??"Source unavailable")}${topic?.sourcePage?` / page ${topic.sourcePage}`:""}`,`- Return in Luma: Library → Speaking topics → ${clean(topic?.title??attempt.topicId)}`,attempt.notes?`- Practice notes: ${clean(attempt.notes)}`:"","");}
    if (completed.length === 0&&completedSpeaking.length===0) lines.push("No completed practice recorded for this date.");
    const result = await repository.exportObsidianDailyBrief(vault,day,lines.join("\n"));
    lastPath=result.path;
    pending=pending.filter(value => value!==day);
    await repository.setSetting(pendingKey,JSON.stringify(pending));
  }
  const message = lastPath ? `Synced: ${lastPath}` : "No summaries waiting to sync.";
  await repository.setSetting("integration.obsidianLastStatus",message);
  return message;
}

export async function queueCompletedSessionSync(repository: LearningRepository, date: string): Promise<void> {
  try { await syncObsidianSessions(repository,date); }
  catch { await repository.setSetting("integration.obsidianLastStatus","Sync pending. Retry in Settings; your practice is saved.").catch(()=>undefined); }
}
