import { describe, expect, it } from "vitest";

import {
  AnchorError,
  createTextAnchor,
  recoverTextAnchor,
  segmentTextWithAnnotations,
} from "./textAnchor";

describe("TextAnchor", () => {
  it("creates offsets, quote, prefix, and suffix from one stable block", () => {
    const text = "A quiet lamp stood beside the cabinet.";
    const start = text.indexOf("lamp");
    const anchor = createTextAnchor("reading-block-01", text, start, start + 4, 7);

    expect(anchor).toEqual({
      blockId: "reading-block-01",
      startOffset: 8,
      endOffset: 12,
      quote: "lamp",
      prefix: " quiet ",
      suffix: " stood ",
    });
  });

  it("rejects empty and out-of-bounds selections", () => {
    expect(() => createTextAnchor("block-01", "text", 2, 2)).toThrowError(AnchorError);
    expect(() => createTextAnchor("block-01", "text", 1, 8)).toThrowError(
      expect.objectContaining({ code: "OUT_OF_BOUNDS" }),
    );
  });

  it("uses original offsets when the quote still matches", () => {
    const text = "one two three";
    const anchor = createTextAnchor("block-01", text, 4, 7);

    expect(recoverTextAnchor(text, anchor)).toMatchObject({
      strategy: "offset",
      confidence: 1,
      ambiguous: false,
      anchor: { startOffset: 4, endOffset: 7, quote: "two" },
    });
  });

  it("recovers shifted text using quote plus surrounding context", () => {
    const original = "Volunteers checked the inventory twice a week.";
    const start = original.indexOf("inventory");
    const anchor = createTextAnchor("block-01", original, start, start + "inventory".length, 12);
    const revised = `In spring, ${original}`;

    expect(recoverTextAnchor(revised, anchor)).toMatchObject({
      strategy: "quote-context",
      ambiguous: false,
      anchor: {
        startOffset: revised.indexOf("inventory"),
        quote: "inventory",
      },
    });
  });

  it("uses context to distinguish repeated quotes", () => {
    const original = "red tool, blue tool, green tool";
    const selectedStart = original.indexOf("tool", 12);
    const anchor = createTextAnchor("block-01", original, selectedStart, selectedStart + 4, 7);
    const revised = `new tool, ${original}`;

    const recovery = recoverTextAnchor(revised, anchor);
    expect(recovery?.anchor.startOffset).toBe(revised.indexOf("tool", revised.indexOf("blue")));
    expect(recovery?.strategy).toBe("quote-context");
  });
});

describe("segmentTextWithAnnotations", () => {
  it("preserves text order and carries every active annotation through overlaps", () => {
    const text = "abcdefghij";
    const first = createTextAnchor("block-01", text, 2, 7);
    const second = createTextAnchor("block-01", text, 5, 9);

    const result = segmentTextWithAnnotations(
      text,
      [
        { id: "annotation-a", anchor: first },
        { id: "annotation-b", anchor: second },
      ],
      "block-01",
    );

    expect(result.segments.map((segment) => segment.text).join("")).toBe(text);
    expect(result.segments).toEqual([
      { startOffset: 0, endOffset: 2, text: "ab", annotationIds: [] },
      { startOffset: 2, endOffset: 5, text: "cde", annotationIds: ["annotation-a"] },
      {
        startOffset: 5,
        endOffset: 7,
        text: "fg",
        annotationIds: ["annotation-a", "annotation-b"],
      },
      { startOffset: 7, endOffset: 9, text: "hi", annotationIds: ["annotation-b"] },
      { startOffset: 9, endOffset: 10, text: "j", annotationIds: [] },
    ]);
    expect(result.unresolvedAnnotationIds).toEqual([]);
  });

  it("reports annotations from a different block instead of applying them", () => {
    const text = "stable text";
    const anchor = createTextAnchor("other-block", text, 0, 6);

    const result = segmentTextWithAnnotations(
      text,
      [{ id: "wrong-block", anchor }],
      "current-block",
    );

    expect(result.unresolvedAnnotationIds).toEqual(["wrong-block"]);
    expect(result.segments).toEqual([
      { startOffset: 0, endOffset: text.length, text, annotationIds: [] },
    ]);
  });
});
