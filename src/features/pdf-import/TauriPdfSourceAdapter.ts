import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import { BrowserPdfSourceAdapter } from "./BrowserPdfSourceAdapter";
import type {
  DocumentSourceAdapter,
  PdfBinarySource,
  PdfDocumentHandle,
} from "./documentSource";

export type TauriPdfInvoke = (command: string) => Promise<unknown>;

const SelectedPdfPayloadSchema = z.object({
  fileName: z.string().trim().min(1),
  mimeType: z.literal("application/pdf"),
  byteLength: z.number().int().positive().safe(),
  base64: z.string().min(1),
});

function nativeError(error: unknown): Error {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return new Error(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * The native command owns both the file dialog and the one-time read. The
 * renderer receives only the selected file's bytes and metadata, never an
 * arbitrary path-reading primitive. PDF.js remains the shared parser/renderer.
 */
export class TauriPdfSourceAdapter implements DocumentSourceAdapter {
  constructor(
    private readonly invokeCommand: TauriPdfInvoke = invoke,
    private readonly parser: DocumentSourceAdapter = new BrowserPdfSourceAdapter(),
  ) {}

  async selectSource(): Promise<PdfBinarySource | null> {
    let raw: unknown;
    try {
      raw = await this.invokeCommand("select_pdf_file");
    } catch (error) {
      throw nativeError(error);
    }
    if (raw === null) return null;

    const payload = SelectedPdfPayloadSchema.parse(raw);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = decodeBase64(payload.base64);
    } catch {
      throw new Error("原生 PDF 响应包含无效的 Base64 字节。");
    }
    if (bytes.byteLength !== payload.byteLength) {
      throw new Error(
        `原生 PDF 长度不一致：预期 ${payload.byteLength} 字节，实际 ${bytes.byteLength} 字节。`,
      );
    }

    return {
      name: payload.fileName,
      size: payload.byteLength,
      mimeType: payload.mimeType,
      readBytes: async () => bytes.slice().buffer,
    };
  }

  async open(source: PdfBinarySource): Promise<PdfDocumentHandle> {
    return this.parser.open(source);
  }
}
