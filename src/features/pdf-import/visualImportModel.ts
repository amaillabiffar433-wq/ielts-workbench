import { PdfCropSchema, type VisualSource } from "../../domain/pack";
import type { ImportImage } from "../../infrastructure/repositories/LearningRepository";
import { createStructuredQuestion, touchStructuredDraft, type StructuredImportDraft, type SupportedImportQuestionType } from "./structuredImportModel";

export type PdfCrop = NonNullable<VisualSource["crop"]>;
export const fullPageCrop: PdfCrop = { x: 0, y: 0, width: 1, height: 1 };
export function cropFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): PdfCrop | null {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const x = Math.min(clamp(start.x), clamp(end.x)), y = Math.min(clamp(start.y), clamp(end.y));
  const width = Math.abs(clamp(start.x) - clamp(end.x)), height = Math.abs(clamp(start.y) - clamp(end.y));
  if (width < 0.005 || height < 0.005) return null;
  return PdfCropSchema.parse({ x, y, width, height });
}

export function appendVisual(draft: StructuredImportDraft, targetId: string, asset: ImportImage, visual: VisualSource): StructuredImportDraft {
  if (visual.assetId !== asset.id) throw new Error("图片标识不匹配。");
  const targetExists = draft.passages.some((passage) => passage.id === targetId || passage.questionGroups.some((group) => group.id === targetId));
  if (!targetExists) throw new Error("所选 Passage / 题组已不存在，请重新选择。");
  const id = `visual-block-${crypto.randomUUID()}`;
  return touchStructuredDraft(draft, {
    imageAssets: [...draft.imageAssets.filter((item) => item.id !== asset.id), asset],
    passages: draft.passages.map((passage) => ({ ...passage,
      contentBlocks: passage.id === targetId ? [...passage.contentBlocks, { id, text: visual.ocrText?.trim() || visual.altText, sourcePages: visual.sourcePage ? [visual.sourcePage] : [], visual }] : passage.contentBlocks,
      questionGroups: passage.questionGroups.map((group) => group.id === targetId ? { ...group, sourcePages: [...new Set([...group.sourcePages, ...(visual.sourcePage ? [visual.sourcePage] : [])])].sort((a, b) => a - b), contextBlocks: [...group.contextBlocks, { id, ...visual, linkedQuestionIds: group.questions.map((question) => question.id) }] } : group),
    })),
  });
}

/** An explicit quick-import action preserves all selected source text in the first passage. */
export function prepareQuickImport(draft: StructuredImportDraft): StructuredImportDraft {
  const passage = draft.passages[0];
  if (!passage) return draft;
  return touchStructuredDraft(draft, {
    passages: draft.passages.map((item) => item.id === passage.id ? { ...item,
      contentBlocks: [{ ...item.contentBlocks[0], text: draft.source.pages.map((page) => page.text).join("\n\n").trim(), sourcePages: draft.source.pages.map((page) => page.pageNumber) }],
    } : item),
    sourceSegments: draft.sourceSegments.map((segment) => ({ ...segment, disposition: { kind: "assigned", targetKind: "passage", targetId: passage.id } })),
  });
}

export function addQuickQuestions(draft: StructuredImportDraft, groupId: string, range: string, type: SupportedImportQuestionType): StructuredImportDraft {
  const match = /^\s*(\d+)(?:\s*[-–—]\s*(\d+))?\s*$/u.exec(range);
  const start = Number(match?.[1]), end = Number(match?.[2] ?? match?.[1]);
  if (!match || start < 1 || end < start || end > 100 || end - start >= 100) throw new Error("请输入有效题号（1–100），如 14–19。");
  const groups = draft.passages.flatMap((passage) => passage.questionGroups);
  if (!groups.some((group) => group.id === groupId)) throw new Error("请先选择目标题组。");
  const used = new Set(groups.flatMap((group) => group.questions.flatMap((question) => [question.number, ...question.additionalNumbers])));
  const numbers = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  if (numbers.some((number) => used.has(number))) throw new Error("题号已存在；未覆盖任何题目。");
  return touchStructuredDraft(draft, { passages: draft.passages.map((passage) => ({ ...passage,
    questionGroups: passage.questionGroups.map((group) => group.id === groupId ? { ...group,
      instructions: group.instructions.trim() || "Refer to the original question context. Follow the word limit and instructions shown in the PDF.",
      questions: [...group.questions, ...numbers.map((number) => createStructuredQuestion({ number, type,
        prompt: type === "fill-blank" ? `Question ${number}: {{blank}} (see original context)` : `Question ${number} — see original context above.`, needsReview: true,
      }))],
    } : group),
  })) });
}
