import type { z } from "zod";

import { deepFreeze } from "../shared/immutability";

export type AiAction =
  | "lookup_word"
  | "explain_selection"
  | "review_question"
  | "review_listening_mistake"
  | "evaluate_writing"
  | "compare_drafts"
  | "overall_review";

export type ProviderHealth =
  | { readonly status: "ready"; readonly message: string }
  | { readonly status: "disabled"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

export interface AiProvider {
  readonly id: string;
  readonly displayName: string;
  testConnection(): Promise<ProviderHealth>;
  run<TInput, TOutput>(
    action: AiAction,
    input: TInput,
    outputSchema: z.ZodType<TOutput>,
    signal?: AbortSignal,
  ): Promise<TOutput>;
}

export type AiContextKind =
  | "instruction"
  | "source-text"
  | "selected-text"
  | "question"
  | "user-answer"
  | "writing-draft";

export interface AiContextItem {
  readonly id: string;
  readonly kind: AiContextKind;
  readonly label: string;
  readonly content: string;
  readonly sourceId?: string;
}

export interface AiContextPreview {
  readonly action: AiAction;
  readonly mode: "study" | "review";
  readonly items: readonly AiContextItem[];
  readonly characterCount: number;
  readonly includesUserWriting: boolean;
  readonly includesAnswerKey: boolean;
  readonly notice: string;
}

export interface BuildAiContextInput {
  readonly action: AiAction;
  readonly mode: "study" | "exam" | "review";
  readonly items: readonly AiContextItem[];
  readonly includesAnswerKey?: boolean;
}

export class AiUnavailableError extends Error {
  readonly code: "AI_DISABLED" | "AI_FORBIDDEN_IN_EXAM";

  constructor(code: "AI_DISABLED" | "AI_FORBIDDEN_IN_EXAM", message: string) {
    super(message);
    this.name = "AiUnavailableError";
    this.code = code;
  }
}

/** Creates the exact, user-visible payload preview before any future AI call. */
export function buildAiContextPreview(input: BuildAiContextInput): AiContextPreview {
  if (input.mode === "exam") {
    throw new AiUnavailableError("AI_FORBIDDEN_IN_EXAM", "AI is unavailable in exam mode");
  }

  const items = input.items.map((item) => deepFreeze({ ...item }));
  return deepFreeze({
    action: input.action,
    mode: input.mode,
    items,
    characterCount: items.reduce((total, item) => total + item.content.length, 0),
    includesUserWriting: items.some((item) => item.kind === "writing-draft"),
    includesAnswerKey: input.includesAnswerKey ?? false,
    notice: "AI is not configured. No content will be sent.",
  });
}

/** Offline placeholder. It never performs a fetch, invoke, or secret lookup. */
export class DisabledAiProvider implements AiProvider {
  readonly id = "disabled";
  readonly displayName = "AI not configured";

  async testConnection(): Promise<ProviderHealth> {
    return {
      status: "disabled",
      message: "AI is not configured. Core practice remains fully offline.",
    };
  }

  async run<TInput, TOutput>(
    _action: AiAction,
    _input: TInput,
    _outputSchema: z.ZodType<TOutput>,
    signal?: AbortSignal,
  ): Promise<TOutput> {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }
    throw new AiUnavailableError("AI_DISABLED", "AI is not configured");
  }
}
