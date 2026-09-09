import type { QuestionContextBlock } from "../../domain/pack";

export function boundQuestionIdsFromContext(
  blocks: readonly QuestionContextBlock[],
): ReadonlySet<string> {
  return new Set(blocks.flatMap((block) => {
    if (block.type === "table") {
      return block.rows.flatMap((row) => row.cells.flatMap((cell) => cell.questionId ? [cell.questionId] : []));
    }
    if (block.type === "completion") {
      return block.parts.flatMap((part) => part.kind === "answer" ? [part.questionId] : []);
    }
    return [];
  }));
}
