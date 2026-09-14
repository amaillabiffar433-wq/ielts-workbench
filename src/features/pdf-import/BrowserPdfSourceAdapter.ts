import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { mergePdfTextFragments, sha256Hex } from "./pdfImportModel";
import { analyzePdfLayout, pdfFragments } from "./pdfLayout";
import {
  type DocumentSourceAdapter,
  type PdfBinarySource,
  type PdfDocumentHandle,
} from "./documentSource";

function openError(error: unknown): Error {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "PasswordException") {
    return new Error("PDF 已加密或需要密码；本轮 MVP 不会尝试绕过密码保护。");
  }
  return new Error(`无法打开 PDF：${error instanceof Error ? error.message : String(error)}`);
}

export class BrowserPdfSourceAdapter implements DocumentSourceAdapter {
  async open(source: PdfBinarySource): Promise<PdfDocumentHandle> {
    const bytes = await source.readBytes();
    const sourceSha256 = await sha256Hex(bytes.slice(0));
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
      const document = await loadingTask.promise;
      return {
        fileName: source.name,
        fileSize: source.size,
        pageCount: document.numPages,
        sourceSha256,
        async extractPage(pageNumber) {
          if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > document.numPages) {
            throw new Error(`页码 ${pageNumber} 超出 1–${document.numPages}。`);
          }
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          const layout = analyzePdfLayout(pdfFragments(content.items), page.getViewport({ scale: 1 }).width);
          return { pageNumber, text: layout.text, layout: { kind: layout.kind, confidence: layout.confidence, message: layout.message } };
        },
        async extractRegion(pageNumber, crop) {
          const page = await document.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const fragments = pdfFragments(content.items).filter((fragment) => {
            const [x, y] = viewport.convertToViewportPoint(fragment.x + (fragment.width ?? 0) / 2, fragment.y + fragment.height / 2);
            return x / viewport.width >= crop.x && x / viewport.width <= crop.x + crop.width && y / viewport.height >= crop.y && y / viewport.height <= crop.y + crop.height;
          });
          return mergePdfTextFragments(fragments);
        },
        async renderPage(pageNumber, canvas, maxWidth) {
          if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > document.numPages) {
            throw new Error(`页码 ${pageNumber} 超出 1–${document.numPages}。`);
          }
          const page = await document.getPage(pageNumber);
          const initialViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(3, Math.sqrt(12_000_000 / (initialViewport.width * initialViewport.height)), 6000 / Math.max(initialViewport.width, initialViewport.height), Math.max(0.5, maxWidth / initialViewport.width));
          const viewport = page.getViewport({ scale });
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("当前环境无法创建 PDF 预览画布。");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = `${Math.ceil(viewport.width)}px`;
          canvas.style.height = `${Math.ceil(viewport.height)}px`;
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          return { width: viewport.width, height: viewport.height };
        },
        async destroy() {
          await loadingTask.destroy();
        },
      };
    } catch (error) {
      throw openError(error);
    }
  }
}
