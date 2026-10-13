import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { IELTSPack, PackModule } from "../../domain";
import { answerIsPresent } from "../../domain/questionScoring";
import type { PracticeSessionSummary, SessionSnapshot } from "../../infrastructure/repositories/LearningRepository";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { buildPracticeRoute } from "../practice/practiceRoute";
import "./practiceStart.css";

export function PracticeStartDialog({ pack, module, recent, initialSectionId, onClose }: {
  pack: IELTSPack; module: PackModule; recent?: PracticeSessionSummary;
  initialSectionId?: string; onClose: () => void;
}) {
  const repository = useWorkbenchStore(state => state.repository);
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [sectionId, setSectionId] = useState(initialSectionId ?? "");
  const [lastSection, setLastSection] = useState("");
  const [mode, setMode] = useState<"study" | "exam">("study");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resumable = recent?.status === "in-progress" ? recent : undefined;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (!resumable) return;
    let active = true;
    void Promise.all([
      repository.loadSession(resumable.sessionId),
      repository.getSetting(`reading.viewState.v1.${resumable.sessionId}`),
      repository.getSetting(`listening.section.${resumable.sessionId}`),
    ]).then(([saved, reading, listening]) => {
      if (!active) return;
      setSnapshot(saved);
      let identity = listening;
      if (module.type === "reading" && reading) {
        const view: unknown = JSON.parse(reading);
        if (view && typeof view === "object" && "left" in view) {
          const left = view.left;
          if (left && typeof left === "object" && "passageId" in left && typeof left.passageId === "string") identity = left.passageId;
        }
      }
      setLastSection(module.sections.find(s => s.id === identity)?.title ?? module.sections[0]?.title ?? "");
    }).catch(() => { if (active) setError("The saved attempt could not be read. It has not been changed."); });
    return () => { active = false; };
  }, [module, repository, resumable]);
  const questions = module.type === "writing" ? [] : module.sections.flatMap(s => s.questionGroups.flatMap(g => g.questions));
  const total = questions.reduce((sum,q) => sum + (q.type === "multiple-choice" ? 1 + q.additionalNumbers.length : 1),0);
  const answered = questions.reduce((sum,q) => {
    const value = snapshot?.answers.find(a => a.questionId === q.id)?.value;
    if (!answerIsPresent(value)) return sum;
    return sum + (q.type === "multiple-choice" && Array.isArray(value) ? Math.min(value.length,1+q.additionalNumbers.length) : 1);
  },0);
  async function open(resume: boolean) {
    setBusy(true);setError("");
    try {
      const selectedMode = resume ? resumable?.mode === "exam" ? "exam" : "study" : mode;
      const session = resume && snapshot ? snapshot : await repository.createSession({packId:pack.manifest.id,testId:module.testId,moduleType:module.type,mode:selectedMode});
      await repository.setSetting(`activeSession.${pack.manifest.id}.${module.testId}.${module.type}.${selectedMode}`,session.sessionId);
      const start = !resume && module.type === "listening" && selectedMode === "study" ? module.sections.find(s=>s.id===sectionId)?.startMs : undefined;
      const route = buildPracticeRoute(module.type,{identity:{packId:pack.manifest.id,testId:module.testId},mode:selectedMode,audioStartMs:start});
      // A section opens at its actual stable identity; it never creates a new
      // question identity or discards answers elsewhere in the same test.
      navigate(route + (!resume && sectionId ? `&sourceSectionId=${encodeURIComponent(sectionId)}` : ""));
      onClose();
    } catch { setError("Unable to open practice. Your existing attempt is preserved.");setBusy(false); }
  }
  return <dialog className="practice-start-dialog" ref={dialog} onCancel={onClose} aria-labelledby="practice-start-title">
    <h2 id="practice-start-title">{resumable ? "Continue your practice" : "Start practice"}</h2>
    <p>{pack.manifest.title} · {module.type}</p>
    {resumable && <section><strong>{lastSection || "Saved test attempt"}</strong><p>{total ? `${answered} / ${total} questions answered · ` : "Saved writing draft · "}{Math.floor(resumable.elapsedSeconds/60)}m {resumable.elapsedSeconds%60}s</p><p>{new Date(resumable.updatedAt).toLocaleString()} · {resumable.mode}</p><button className="button button--primary" disabled={busy || !snapshot} type="button" onClick={() => void open(true)}>Continue saved attempt</button></section>}
    <label>Begin a new attempt<select aria-label="Practice starting point" disabled={mode==="exam"} value={sectionId} onChange={e => setSectionId(e.target.value)}><option value="">Full test · {module.type}</option>{module.sections.map((s,i) => <option key={s.id} value={s.id}>{module.type === "reading" ? "Passage" : "Section"} {i+1} · {s.title}</option>)}</select></label>
    <p className="practice-start-note">Choose a starting section or work through the full test. Answers remain together in this test attempt.</p>
    <label>Mode<select aria-label="Practice mode" value={mode} onChange={e => {setMode(e.target.value === "exam" ? "exam" : "study");if(e.target.value==="exam")setSectionId("");}}><option value="study">Study</option><option value="exam">Exam · full test</option></select></label>
    {error && <p role="alert" className="error-banner">{error}</p>}
    <footer><button className="button" disabled={busy} type="button" onClick={onClose}>Cancel</button><button className="button" disabled={busy} type="button" onClick={() => void open(false)}>{resumable ? "Start another attempt" : sectionId ? "Start from this section" : "Start full test"}</button></footer>
  </dialog>;
}
