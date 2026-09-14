import { mergePdfTextFragments, type PdfTextFragment } from "./pdfImportModel";

export interface LayoutResult { readonly kind: "single-column" | "two-column" | "complex" | "scan"; readonly confidence: number; readonly text: string; readonly message: string }
export function pdfFragments(items: readonly unknown[]): PdfTextFragment[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return [];
    const candidate = item as { str?: unknown; transform?: unknown; height?: unknown; width?: unknown };
    if (typeof candidate.str !== "string" || !candidate.str.trim() || !Array.isArray(candidate.transform)) return [];
    const x = Number(candidate.transform[4]), y = Number(candidate.transform[5]);
    const height = Math.abs(Number(candidate.height ?? candidate.transform[3] ?? 0));
    const width = Math.abs(Number(candidate.width ?? 0));
    return [x, y, width, height].every(Number.isFinite) ? [{ text: candidate.str, x, y, width, height }] : [];
  });
}

function columnSplit(fragments: readonly PdfTextFragment[], start: number, width: number) {
  let best: { left: PdfTextFragment[]; right: PdfTextFragment[]; score: number } | null = null;
  for (let ratio = 0.28; ratio <= 0.72; ratio += 0.02) {
    const cut = start + width * ratio;
    const left = fragments.filter((item) => item.x + (item.width ?? 0) <= cut - 7);
    const right = fragments.filter((item) => item.x >= cut + 7);
    if (left.length < 3 || right.length < 3 || left.length + right.length !== fragments.length) continue;
    const leftRows = new Set(left.map((item) => Math.round(item.y / 6))).size;
    const rightRows = new Set(right.map((item) => Math.round(item.y / 6))).size;
    if (leftRows < 3 || rightRows < 3) continue;
    const score = Math.min(left.length, right.length) / Math.max(left.length, right.length);
    if (!best || score > best.score) best = { left, right, score };
  }
  return best;
}

/** Conservative geometric heuristic, not a statistical OCR confidence score. */
export function analyzePdfLayout(fragments: readonly PdfTextFragment[], pageWidth: number): LayoutResult {
  const fallback = mergePdfTextFragments(fragments);
  if (fallback.replace(/\s/gu, "").length < 40) return { kind: "scan", confidence: 0, text: fallback, message: "此页可能为扫描页面，可 OCR 或保留原版区域。" };
  if (pageWidth <= 0 || fragments.some((item) => !item.width)) return { kind: "complex", confidence: 0.3, text: fallback, message: "缺少可靠 bounding box；请复核顺序或保留原版区域。" };
  const spanning = fragments.filter((item) => item.width! >= pageWidth * 0.48);
  const body = fragments.filter((item) => item.width! < pageWidth * 0.48);
  const split = columnSplit(body, 0, pageWidth);
  if (split) {
    const bottom = Math.min(...body.map((item) => item.y));
    const top = Math.min(Math.max(...split.left.map((item) => item.y)), Math.max(...split.right.map((item) => item.y)));
    const crossing = spanning.some((item) => item.y > bottom && item.y < top);
    const further = [split.left, split.right].some((column) => {
      const left = Math.min(...column.map((item) => item.x));
      const right = Math.max(...column.map((item) => item.x + item.width!));
      return Boolean(columnSplit(column, left, right - left));
    });
    if (crossing || further || split.score < 0.2) return { kind: "complex", confidence: 0.35, text: fallback, message: "检测到复杂版面；请选择栏区域或保留原版，不保证自动顺序。" };
    return { kind: "two-column", confidence: 0.85, text: [fragments.filter((item) => item.y > top + 2), split.left.filter((item) => item.y <= top + 2), split.right.filter((item) => item.y <= top + 2), spanning.filter((item) => item.y <= bottom)].map((part) => mergePdfTextFragments(part)).filter(Boolean).join("\n\n"), message: "基础双栏：左栏从上至下，再右栏。启发式置信度 85%，请复核标题及跨栏内容。" };
  }
  const separatedStarts = new Set(body.map((item) => Math.round(item.x / 50))).size;
  return separatedStarts >= 4 && spanning.length < fragments.length / 2
    ? { kind: "complex", confidence: 0.4, text: fallback, message: "检测到复杂版面；可手动选择左右栏，或保留原版。" }
    : { kind: "single-column", confidence: 0.8, text: fallback, message: "按单栏行序提取；请核对页眉、页脚和断行。" };
}
