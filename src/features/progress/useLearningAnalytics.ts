import { useEffect, useMemo, useState } from "react";
import type { IELTSPack } from "../../domain";
import type { PracticeSessionSummary, SessionSnapshot } from "../../infrastructure/repositories/LearningRepository";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { buildLearningAnalytics } from "./learningAnalytics";

export function useLearningAnalytics() {
  const installedPacks = useWorkbenchStore((state) => state.installedPacks);
  const repository = useWorkbenchStore((state) => state.repository);
  const [packs, setPacks] = useState<readonly IELTSPack[]>([]);
  const [sessions, setSessions] = useState<readonly PracticeSessionSummary[]>([]);
  const [snapshots, setSnapshots] = useState<ReadonlyMap<string, SessionSnapshot>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      Promise.all(installedPacks.map((pack) => repository.loadPack(pack.id))),
      repository.listRecentSessions(),
    ]).then(async ([loadedPacks, recentSessions]) => {
      const loadedSnapshots = await Promise.all(recentSessions.map((summary) => repository.loadSession(summary.sessionId)));
      if (!active) return;
      setPacks(loadedPacks.filter((pack): pack is IELTSPack => pack !== null));
      setSessions(recentSessions);
      setSnapshots(new Map(loadedSnapshots.filter((snapshot): snapshot is SessionSnapshot => snapshot !== null).map((snapshot) => [snapshot.sessionId, snapshot])));
      setLoading(false);
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : String(reason));
      setLoading(false);
    });
    return () => { active = false; };
  }, [installedPacks, repository]);

  return {
    analytics: useMemo(() => buildLearningAnalytics(packs, sessions, snapshots), [packs, sessions, snapshots]),
    packs,
    sessions,
    snapshots,
    loading,
    error,
  };
}
