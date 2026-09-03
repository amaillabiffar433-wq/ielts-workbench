import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PackIdSchema, StableIdSchema, type IELTSPack } from "../../domain";
import { useWorkbenchStore } from "../../stores/workbenchStore";

type PackTest = IELTSPack["manifest"]["tests"][number];

export type PracticeRoutePackState = {
  readonly status: "loading" | "error" | "ready";
  readonly pack: IELTSPack | null;
  readonly test: PackTest | null;
  readonly error: string | null;
};

type RouteLoadAttempt = {
  readonly key: string;
  readonly pack: IELTSPack | null;
  readonly error: string | null;
};

export function usePracticeRoutePack(): PracticeRoutePackState {
  const [searchParams] = useSearchParams();
  const activePack = useWorkbenchStore((state) => state.activePack);
  const loadPack = useWorkbenchStore((state) => state.loadPack);
  const requestedPackId = searchParams.get("packId");
  const requestedTestId = searchParams.get("testId");
  const routeKey = `${requestedPackId ?? "<missing>"}\u0000${requestedTestId ?? "<missing>"}`;
  const hasCompleteRouteIdentity = requestedPackId !== null && requestedTestId !== null;
  const hasNoRouteIdentity = requestedPackId === null && requestedTestId === null;
  const routeIdsAreValid = hasCompleteRouteIdentity
    && PackIdSchema.safeParse(requestedPackId).success
    && StableIdSchema.safeParse(requestedTestId).success;
  const [attempt, setAttempt] = useState<RouteLoadAttempt | null>(null);

  const attemptedPack = attempt?.key === routeKey ? attempt.pack : null;
  const attemptedError = attempt?.key === routeKey ? attempt.error : null;
  const matchingActivePack = routeIdsAreValid && activePack?.manifest.id === requestedPackId
    ? activePack
    : null;

  useEffect(() => {
    if (!routeIdsAreValid || matchingActivePack || attemptedPack || attemptedError) return;
    let current = true;
    void loadPack(requestedPackId).then((pack) => {
      if (!current) return;
      setAttempt({
        key: routeKey,
        pack,
        error: pack ? null : `无法读取链接指定的题包 ${requestedPackId}。`,
      });
    });
    return () => {
      current = false;
    };
  }, [attemptedError, attemptedPack, loadPack, matchingActivePack, requestedPackId, routeIdsAreValid, routeKey]);

  return useMemo(() => {
    if (hasNoRouteIdentity) {
      if (!activePack) return { status: "ready", pack: null, test: null, error: null };
      const test = activePack.manifest.tests[0] ?? null;
      return test
        ? { status: "ready", pack: activePack, test, error: null }
        : { status: "error", pack: null, test: null, error: "当前题包不包含可用 Test。" };
    }

    if (!hasCompleteRouteIdentity) {
      return { status: "error", pack: null, test: null, error: "练习链接必须同时包含 packId 和 testId。" };
    }
    if (!routeIdsAreValid) {
      return { status: "error", pack: null, test: null, error: "练习链接中的 packId 或 testId 无效。" };
    }

    const pack = matchingActivePack ?? attemptedPack;
    if (!pack) {
      if (attemptedError) return { status: "error", pack: null, test: null, error: attemptedError };
      return { status: "loading", pack: null, test: null, error: null };
    }
    const test = pack.manifest.tests.find((candidate) => candidate.id === requestedTestId) ?? null;
    if (!test) {
      return {
        status: "error",
        pack: null,
        test: null,
        error: `题包 ${pack.manifest.id} 不包含链接指定的 Test ${requestedTestId}。`,
      };
    }
    return { status: "ready", pack, test, error: null };
  }, [activePack, attemptedError, attemptedPack, hasCompleteRouteIdentity, hasNoRouteIdentity, matchingActivePack, requestedTestId, routeIdsAreValid]);
}
