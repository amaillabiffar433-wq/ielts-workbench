import type { VocabularyItem } from "../../infrastructure/repositories/LearningRepository";

export type VocabularyExportFormat = "markdown" | "json" | "csv";

function sourceLabel(item: VocabularyItem): string {
  return [item.sourceBookTitle, item.sourceTestTitle, item.sourceSectionTitle]
    .filter(Boolean)
    .join(" / ") || "未分类来源";
}

export function formatVocabularyExport(items: readonly VocabularyItem[], format: VocabularyExportFormat): string {
  if (format === "json") return `${JSON.stringify(items, null, 2)}\n`;
  if (format === "csv") {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const header = ["word", "normalized", "sentence", "context_before", "context_after", "source", "question", "status", "note", "created_at"];
    const rows = items.map((item) => [
      item.term, item.normalizedTerm, item.sentence, item.contextBefore, item.contextAfter,
      sourceLabel(item), item.sourceQuestionNumber ?? "", item.learningState, item.note, item.createdAt,
    ].map(escape).join(","));
    return `\uFEFF${header.map(escape).join(",")}\n${rows.join("\n")}\n`;
  }
  const groups = new Map<string, VocabularyItem[]>();
  for (const item of items) groups.set(sourceLabel(item), [...(groups.get(sourceLabel(item)) ?? []), item]);
  const lines = ["# IELTS Vocabulary", ""];
  for (const [source, group] of groups) {
    lines.push(`## ${source}`, "");
    for (const item of group) {
      lines.push(`### ${item.term}`, "", `Sentence: ${item.sentence || "(not available)"}`, "", `Source: ${source}`,
        ...(item.sourceQuestionNumber ? ["", `Question: ${item.sourceQuestionNumber}`] : []),
        "", `Status: ${item.learningState}`, ...(item.note ? ["", `Note: ${item.note}`] : []), "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

type WritableFileHandle = {
  createWritable(): Promise<{ write(content: string): Promise<void>; close(): Promise<void> }>;
};

type FilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<WritableFileHandle>;
};

export async function saveVocabularyExport(items: readonly VocabularyItem[], format: VocabularyExportFormat): Promise<void> {
  const extension = format === "markdown" ? "md" : format;
  const mime = format === "markdown" ? "text/markdown" : format === "json" ? "application/json" : "text/csv";
  const content = formatVocabularyExport(items, format);
  const picker = (window as FilePickerWindow).showSaveFilePicker;
  if (picker) {
    const handle = await picker({
      suggestedName: `ielts-vocabulary.${extension}`,
      types: [{ description: `IELTS Vocabulary ${format.toUpperCase()}`, accept: { [mime]: [`.${extension}`] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ielts-vocabulary.${extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
