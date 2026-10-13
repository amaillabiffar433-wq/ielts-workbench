import { describe, expect, it } from "vitest";
import { parseVocabularyText } from "./vocabularyImport";

describe("parseVocabularyText", () => {
  it("reads common CET JSON word records and preserves definitions", () => {
    const entries = parseVocabularyText(JSON.stringify([
      { word: "allocate", definition: "分配", example: "The team allocates time carefully.", pos: "verb" },
      { term: "carry out", meaning: "执行" },
    ]), "cet6.json");
    expect(entries).toEqual([
      { term: "allocate", normalizedTerm: "allocate", entryKind: "word", sentence: "The team allocates time carefully.", note: "分配\nPart of speech: verb" },
      { term: "carry out", normalizedTerm: "carry out", entryKind: "phrase", sentence: "", note: "执行" },
    ]);
  });

  it("reads CSV headers and simple word lists", () => {
    expect(parseVocabularyText("word,meaning,example\nrobust,稳健的,The method is robust.", "cet6.csv")[0].note).toBe("稳健的");
    expect(parseVocabularyText("allocate\ncarry out\n# comment", "words.txt").map((entry) => entry.term)).toEqual(["allocate", "carry out"]);
  });
});

