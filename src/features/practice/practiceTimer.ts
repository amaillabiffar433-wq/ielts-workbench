export interface PracticeElapsedResult {
  readonly elapsedSeconds: number;
  readonly warning: string | null;
}

export function derivePracticeElapsed(
  mode: "study" | "exam",
  persistedSeconds: number,
  startedAt: string | undefined,
  mountedAtMs: number,
  nowMs: number,
): PracticeElapsedResult {
  const safePersisted = Number.isSafeInteger(persistedSeconds) && persistedSeconds >= 0 ? persistedSeconds : 0;
  if (mode === "study") {
    const activeSeconds = Math.max(0, Math.floor((nowMs - mountedAtMs) / 1_000));
    return { elapsedSeconds: safePersisted + activeSeconds, warning: null };
  }
  const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  if (!Number.isFinite(startedMs)) {
    return { elapsedSeconds: safePersisted, warning: "考试开始时间无效；已保留上次可靠用时。" };
  }
  if (startedMs > nowMs + 60_000) {
    return { elapsedSeconds: safePersisted, warning: "系统时间早于考试开始时间；已保留上次可靠用时。" };
  }
  return {
    elapsedSeconds: Math.max(safePersisted, Math.max(0, Math.floor((nowMs - startedMs) / 1_000))),
    warning: null,
  };
}

export function formatPracticeTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.trunc(totalSeconds));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60).toString().padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}
