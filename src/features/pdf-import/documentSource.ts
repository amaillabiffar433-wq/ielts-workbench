import { mergePdfTextFragments, type ExtractedPdfPage, type PdfTextFragment } from "./pdfImportModel";

export interface PdfBinarySource {
  readonly name: string;
  readonly size: number;
  readonly mimeType: string;
  readBytes(): Promise<ArrayBuffer>;
}

export interface PdfRenderResult {
  readonly width: number;
  readonly height: number;
}

export interface PdfDocumentHandle {
  readonly fileName: string;
  readonly fileSize: number;
  readonly pageCount: number;
  readonly sourceSha256: string;
  extractPage(pageNumber: number): Promise<ExtractedPdfPage>;
  renderPage(pageNumber: number, canvas: HTMLCanvasElement, maxWidth: number): Promise<PdfRenderResult>;
  destroy(): Promise<void>;
}

export interface DocumentSourceAdapter {
  open(source: PdfBinarySource): Promise<PdfDocumentHandle>;
}

export function browserFileSource(file: File): PdfBinarySource {
  return {
    name: file.name,
    size: file.size,
    mimeType: file.type,
    readBytes: () => file.arrayBuffer(),
  };
}

export function extractedTextFromPdfItems(items: readonly unknown[]): string {
  const fragments: PdfTextFragment[] = items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return [];
    const candidate = item as { str?: unknown; transform?: unknown; height?: unknown };
    if (typeof candidate.str !== "string" || !Array.isArray(candidate.transform)) return [];
    const x = Number(candidate.transform[4]);
    const y = Number(candidate.transform[5]);
    const height = Number(candidate.height ?? candidate.transform[3] ?? 0);
    if (![x, y, height].every(Number.isFinite)) return [];
    return [{ text: candidate.str, x, y, height: Math.abs(height) }];
  });
  return mergePdfTextFragments(fragments);
}
