import { describe, expect, it } from "vitest";

import { createTextAnchor } from "../../domain";
import { vocabularySelectionFromAnchor } from "./vocabularySelection";

describe("Reading vocabulary selection", () => {
  it("preserves the exact term, sentence, nearby context, and stable block identity", () => {
    const text = "The first sentence is short. Researchers found a striking discrepancy in the records. A final sentence follows.";
    const start = text.indexOf("striking discrepancy");
    const anchor = createTextAnchor("reading-block-one", text, start, start + "striking discrepancy".length);

    expect(vocabularySelectionFromAnchor(text, anchor)).toMatchObject({
      term: "striking discrepancy",
      normalizedTerm: "striking discrepancy",
      sentence: "Researchers found a striking discrepancy in the records.",
      blockId: "reading-block-one",
      contextBefore: expect.stringContaining("Researchers found a "),
      contextAfter: expect.stringContaining(" in the records"),
    });
  });
});
