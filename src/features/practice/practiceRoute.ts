import { PackIdSchema, StableIdSchema } from "../../domain";

export type PracticeModuleType = "reading" | "listening" | "writing";
export type PracticeMode = "study" | "exam";

export type PracticeRouteIdentity = {
  readonly packId: string;
  readonly testId: string;
};

export function parsePracticeRouteIdentity(
  packId: string | null | undefined,
  testId: string | null | undefined,
): PracticeRouteIdentity | null {
  const parsedPackId = PackIdSchema.safeParse(packId);
  const parsedTestId = StableIdSchema.safeParse(testId);
  if (!parsedPackId.success || !parsedTestId.success) return null;
  return { packId: parsedPackId.data, testId: parsedTestId.data };
}

export function buildPracticeRoute(
  moduleType: PracticeModuleType,
  options: {
    readonly identity?: PracticeRouteIdentity | null;
    readonly mode?: PracticeMode;
    readonly audioStartMs?: number;
    readonly sourceQuestionId?: string;
  } = {},
): string {
  const mode = options.mode ?? "study";
  const search = new URLSearchParams();
  if (options.identity) {
    search.set("packId", options.identity.packId);
    search.set("testId", options.identity.testId);
  }
  if (options.identity || mode === "exam") search.set("mode", mode);
  if (options.audioStartMs !== undefined && Number.isSafeInteger(options.audioStartMs) && options.audioStartMs >= 0) {
    search.set("tMs", String(options.audioStartMs));
  }
  const sourceQuestionId = StableIdSchema.safeParse(options.sourceQuestionId);
  if (sourceQuestionId.success) search.set("sourceQuestionId", sourceQuestionId.data);
  const query = search.toString();
  return `/practice/${moduleType}${query ? `?${query}` : ""}`;
}
