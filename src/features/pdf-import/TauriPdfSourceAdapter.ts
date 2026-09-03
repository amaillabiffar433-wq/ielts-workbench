import type { DocumentSourceAdapter, PdfDocumentHandle } from "./documentSource";

/**
 * Native path access stays behind this adapter. The current Windows machine
 * cannot build the Rust command yet, so callers intentionally receive a clear
 * capability error instead of falling back to an unsafe renderer path read.
 */
export class TauriPdfSourceAdapter implements DocumentSourceAdapter {
  async open(): Promise<PdfDocumentHandle> {
    throw new Error("Tauri PDF 文件读取适配器尚未启用；请先完成 Rust/MSVC 环境验证。当前可使用 Web/Vite 文件选择。 ");
  }
}
