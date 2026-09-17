import type { TextAnchor } from "../../domain/annotation";

export type VocabularyTextSelection = {
  readonly term: string;
  readonly normalizedTerm: string;
  readonly sentence: string;
  readonly contextBefore: string;
  readonly contextAfter: string;
  readonly blockId: string;
  readonly anchor: TextAnchor;
};

export function vocabularySelectionFromAnchor(blockText: string, anchor: TextAnchor): VocabularyTextSelection {
  const term = anchor.quote.trim();
  const normalizedTerm = term.normalize("NFKC").replace(/\s+/gu, " ").toLocaleLowerCase();
  let sentenceStart = Math.max(
    blockText.lastIndexOf(".", Math.max(0, anchor.startOffset - 1)),
    blockText.lastIndexOf("!", Math.max(0, anchor.startOffset - 1)),
    blockText.lastIndexOf("?", Math.max(0, anchor.startOffset - 1)),
    blockText.lastIndexOf("\n", Math.max(0, anchor.startOffset - 1)),
  );
  sentenceStart = sentenceStart < 0 ? 0 : sentenceStart + 1;
  const followingStops = [".", "!", "?", "\n"]
    .map((character) => blockText.indexOf(character, anchor.endOffset))
    .filter((index) => index >= 0);
  const sentenceEnd = followingStops.length > 0 ? Math.min(...followingStops) + 1 : blockText.length;
  return {
    term,
    normalizedTerm,
    sentence: blockText.slice(sentenceStart, sentenceEnd).trim(),
    contextBefore: blockText.slice(Math.max(0, anchor.startOffset - 120), anchor.startOffset),
    contextAfter: blockText.slice(anchor.endOffset, Math.min(blockText.length, anchor.endOffset + 120)),
    blockId: anchor.blockId,
    anchor,
  };
}
