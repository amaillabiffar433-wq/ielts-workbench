import { describe, expect, it, vi } from "vitest";

import type { DocumentSourceAdapter, PdfDocumentHandle } from "./documentSource";
import { TauriPdfSourceAdapter } from "./TauriPdfSourceAdapter";

function parserMock(): DocumentSourceAdapter {
  return { open: vi.fn(async () => ({}) as PdfDocumentHandle) };
}

describe("TauriPdfSourceAdapter", () => {
  it("treats closing the native file dialog as cancellation", async () => {
    const invokeCommand = vi.fn(async () => null);
    const adapter = new TauriPdfSourceAdapter(invokeCommand, parserMock());

    await expect(adapter.selectSource()).resolves.toBeNull();
    expect(invokeCommand).toHaveBeenCalledWith("select_pdf_file");
  });

  it("decodes native bytes and delegates parsing to the shared PDF adapter", async () => {
    const parser = parserMock();
    const adapter = new TauriPdfSourceAdapter(async () => ({
      fileName: "original.pdf",
      mimeType: "application/pdf",
      byteLength: 8,
      base64: "JVBERi0xLjc=",
    }), parser);

    const source = await adapter.selectSource();
    expect(source).not.toBeNull();
    expect(source).toMatchObject({ name: "original.pdf", size: 8, mimeType: "application/pdf" });
    expect(new TextDecoder().decode(await source!.readBytes())).toBe("%PDF-1.7");

    await adapter.open(source!);
    expect(parser.open).toHaveBeenCalledWith(source);
  });

  it("rejects a native payload whose declared length does not match its bytes", async () => {
    const adapter = new TauriPdfSourceAdapter(async () => ({
      fileName: "broken.pdf",
      mimeType: "application/pdf",
      byteLength: 999,
      base64: "JVBERi0xLjc=",
    }), parserMock());

    await expect(adapter.selectSource()).rejects.toThrow("原生 PDF 长度不一致");
  });

  it("preserves a readable message from a rejected native command", async () => {
    const adapter = new TauriPdfSourceAdapter(async () => {
      throw { code: "IO_ERROR", message: "无法读取所选 PDF。" };
    }, parserMock());

    await expect(adapter.selectSource()).rejects.toThrow("无法读取所选 PDF");
  });
});
