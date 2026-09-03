import { z } from "zod";

import { deepFreeze } from "../shared/immutability";
import { StableIdSchema } from "../pack";

export const TextAnchorSchema = z
  .object({
    blockId: StableIdSchema,
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    quote: z.string().min(1),
    prefix: z.string(),
    suffix: z.string(),
  })
  .strict()
  .superRefine((anchor, context) => {
    if (anchor.endOffset <= anchor.startOffset) {
      context.addIssue({
        code: "custom",
        path: ["endOffset"],
        message: "endOffset must be greater than startOffset",
      });
    }
    if (anchor.endOffset - anchor.startOffset !== anchor.quote.length) {
      context.addIssue({
        code: "custom",
        path: ["quote"],
        message: "quote length must match the anchor offset range",
      });
    }
  });

export const AnnotationStyleSchema = z.enum([
  "highlight-yellow",
  "highlight-green",
  "highlight-blue",
  "highlight-pink",
  "underline",
]);

export type TextAnchor = Readonly<z.infer<typeof TextAnchorSchema>>;
export type AnnotationStyle = z.infer<typeof AnnotationStyleSchema>;

export type AnchorErrorCode =
  | "EMPTY_SELECTION"
  | "INVALID_CONTEXT_LENGTH"
  | "INVALID_OFFSET"
  | "OUT_OF_BOUNDS";

export class AnchorError extends Error {
  readonly code: AnchorErrorCode;

  constructor(code: AnchorErrorCode, message: string) {
    super(message);
    this.name = "AnchorError";
    this.code = code;
  }
}

export interface AnchorRecovery {
  readonly anchor: TextAnchor;
  readonly strategy: "offset" | "quote-context";
  /** A deterministic value in the inclusive range 0..1. */
  readonly confidence: number;
  /** True when multiple quote occurrences had the same best context score. */
  readonly ambiguous: boolean;
}

export interface AnchorRenderInput {
  readonly id: string;
  readonly anchor: TextAnchor;
}

export interface TextRenderSegment {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly text: string;
  readonly annotationIds: readonly string[];
}

export interface TextSegmentationResult {
  readonly segments: readonly TextRenderSegment[];
  readonly unresolvedAnnotationIds: readonly string[];
}

export function createTextAnchor(
  blockId: string,
  blockText: string,
  startOffset: number,
  endOffset: number,
  contextLength = 32,
): TextAnchor {
  StableIdSchema.parse(blockId);

  if (!Number.isInteger(contextLength) || contextLength < 0) {
    throw new AnchorError("INVALID_CONTEXT_LENGTH", "contextLength must be a non-negative integer");
  }
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0) {
    throw new AnchorError("INVALID_OFFSET", "Selection offsets must be non-negative integers");
  }
  if (endOffset > blockText.length) {
    throw new AnchorError("OUT_OF_BOUNDS", "Selection extends beyond the content block");
  }
  if (endOffset <= startOffset) {
    throw new AnchorError("EMPTY_SELECTION", "Selection must contain text from exactly one content block");
  }

  return deepFreeze(
    TextAnchorSchema.parse({
      blockId,
      startOffset,
      endOffset,
      quote: blockText.slice(startOffset, endOffset),
      prefix: blockText.slice(Math.max(0, startOffset - contextLength), startOffset),
      suffix: blockText.slice(endOffset, Math.min(blockText.length, endOffset + contextLength)),
    }),
  );
}

function commonSuffixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[left.length - 1 - length] === right[right.length - 1 - length]) {
    length += 1;
  }
  return length;
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let length = 0;
  while (length < limit && left[length] === right[length]) {
    length += 1;
  }
  return length;
}

function findQuoteOccurrences(text: string, quote: string): number[] {
  const offsets: number[] = [];
  let fromIndex = 0;
  while (fromIndex <= text.length - quote.length) {
    const index = text.indexOf(quote, fromIndex);
    if (index < 0) {
      break;
    }
    offsets.push(index);
    fromIndex = index + 1;
  }
  return offsets;
}

export function recoverTextAnchor(blockText: string, anchorInput: TextAnchor): AnchorRecovery | null {
  const anchor = TextAnchorSchema.parse(anchorInput);
  if (blockText.slice(anchor.startOffset, anchor.endOffset) === anchor.quote) {
    return deepFreeze({
      anchor,
      strategy: "offset" as const,
      confidence: 1,
      ambiguous: false,
    });
  }

  const occurrences = findQuoteOccurrences(blockText, anchor.quote);
  if (occurrences.length === 0) {
    return null;
  }

  const candidates = occurrences.map((startOffset) => {
    const endOffset = startOffset + anchor.quote.length;
    const actualPrefix = blockText.slice(Math.max(0, startOffset - anchor.prefix.length), startOffset);
    const actualSuffix = blockText.slice(endOffset, Math.min(blockText.length, endOffset + anchor.suffix.length));
    const contextScore =
      commonSuffixLength(anchor.prefix, actualPrefix) + commonPrefixLength(anchor.suffix, actualSuffix);
    return {
      startOffset,
      endOffset,
      contextScore,
      distance: Math.abs(startOffset - anchor.startOffset),
    };
  });

  candidates.sort(
    (left, right) =>
      right.contextScore - left.contextScore || left.distance - right.distance || left.startOffset - right.startOffset,
  );
  const best = candidates[0];
  if (occurrences.length > 1 && best.contextScore === 0) {
    // Repeated text with no surviving context is unsafe to recover automatically.
    return null;
  }

  const ambiguous = candidates.filter((candidate) => candidate.contextScore === best.contextScore).length > 1;
  const maxContextScore = anchor.prefix.length + anchor.suffix.length;
  const confidence = maxContextScore === 0 ? 1 : best.contextScore / maxContextScore;
  const contextLength = Math.max(anchor.prefix.length, anchor.suffix.length);

  return deepFreeze({
    anchor: createTextAnchor(
      anchor.blockId,
      blockText,
      best.startOffset,
      best.endOffset,
      contextLength,
    ),
    strategy: "quote-context" as const,
    confidence,
    ambiguous,
  });
}

/**
 * Splits a block at every recovered annotation boundary. Overlaps are encoded
 * as multiple IDs on a segment, so text order and text content never change.
 */
export function segmentTextWithAnnotations(
  blockText: string,
  annotations: readonly AnchorRenderInput[],
  blockId?: string,
): TextSegmentationResult {
  const recovered: Array<{ id: string; startOffset: number; endOffset: number }> = [];
  const unresolvedAnnotationIds: string[] = [];

  for (const annotation of annotations) {
    if (blockId !== undefined && annotation.anchor.blockId !== blockId) {
      unresolvedAnnotationIds.push(annotation.id);
      continue;
    }
    const result = recoverTextAnchor(blockText, annotation.anchor);
    if (!result) {
      unresolvedAnnotationIds.push(annotation.id);
      continue;
    }
    recovered.push({
      id: annotation.id,
      startOffset: result.anchor.startOffset,
      endOffset: result.anchor.endOffset,
    });
  }

  const boundaries = new Set<number>([0, blockText.length]);
  recovered.forEach(({ startOffset, endOffset }) => {
    boundaries.add(startOffset);
    boundaries.add(endOffset);
  });
  const orderedBoundaries = [...boundaries].sort((left, right) => left - right);
  const segments: TextRenderSegment[] = [];

  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const startOffset = orderedBoundaries[index];
    const endOffset = orderedBoundaries[index + 1];
    if (endOffset <= startOffset) {
      continue;
    }
    const annotationIds = recovered
      .filter((annotation) => annotation.startOffset < endOffset && annotation.endOffset > startOffset)
      .map((annotation) => annotation.id)
      .sort();
    segments.push(
      deepFreeze({
        startOffset,
        endOffset,
        text: blockText.slice(startOffset, endOffset),
        annotationIds,
      }),
    );
  }

  return deepFreeze({
    segments,
    unresolvedAnnotationIds: [...new Set(unresolvedAnnotationIds)].sort(),
  });
}
