import type { QuestionContextBlock } from "../../domain/pack";

export function boundQuestionIdsFromContext(
  blocks: readonly QuestionContextBlock[],
): ReadonlySet<string> {
  return new Set(blocks.flatMap((block) => block.type === "table"
    ? block.rows.flatMap((row) => row.cells.flatMap((cell) => cell.questionId ? [cell.questionId] : []))
    : []));
}
