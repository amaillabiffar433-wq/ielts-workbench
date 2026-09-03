import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import type { IELTSPack } from "../../domain/pack/schemas";
import { InMemoryLearningRepository } from "../../infrastructure/repositories/InMemoryLearningRepository";
import type { InstalledPackSummary } from "../../infrastructure/repositories/LearningRepository";
import { workbenchStore } from "../../stores/workbenchStore";
import type { DocumentSourceAdapter, PdfDocumentHandle } from "./documentSource";
import { PdfImportPage } from "./PdfImportPage";

const originalState = workbenchStore.getState();

const pageText: Record<number, string> = {
  1: "READING PASSAGE 1\nCommunity Seed Library\nResidents exchange locally adapted seeds.",
  2: "Questions 1-2\nTRUE / FALSE / NOT GIVEN\n1 Residents exchange seeds.\n2 The library sells every seed.",
  3: "1 TRUE\n2 NOT GIVEN",
};

function fakeDocument(): PdfDocumentHandle {
  return {
    fileName: "original-ui-sample.pdf",
    fileSize: 4096,
    pageCount: 3,
    sourceSha256: "c".repeat(64),
    extractPage: vi.fn(async (pageNumber) => ({ pageNumber, text: pageText[pageNumber] ?? "" })),
    renderPage: vi.fn(async () => ({ width: 500, height: 700 })),
    destroy: vi.fn(async () => undefined),
  };
}

describe("PdfImportPage", () => {
  beforeEach(() => {
    workbenchStore.setState({
      repository: new InMemoryLearningRepository(),
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
    workbenchStore.setState(originalState, true);
  });

  it("rejects non-PDF files before opening the document adapter", async () => {
    const adapter: DocumentSourceAdapter = { open: vi.fn() };
    const user = userEvent.setup({ applyAccept: false });
    render(<MemoryRouter><PdfImportPage adapter={adapter} /></MemoryRouter>);

    await user.upload(screen.getByLabelText("选择本地 PDF"), new File(["notes"], "notes.txt", { type: "text/plain" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请选择 PDF 文件");
    expect(adapter.open).not.toHaveBeenCalled();
  });

  it("moves from a local PDF through extraction and repository installation", async () => {
    const handle = fakeDocument();
    const adapter: DocumentSourceAdapter = { open: vi.fn(async () => handle) };
    const installed: InstalledPackSummary = {
      id: `pdf-reading-${"d".repeat(16)}`,
      title: "Original UI Sample",
      sourceLabel: "Local PDF assisted import",
      language: "en",
      modules: ["reading"],
      installedAt: "2026-09-03T05:00:00.000Z",
    };
    const installImportedPack = vi.fn(async (pack: IELTSPack) => {
      expect(pack.manifest.schemaVersion).toBe(1);
      return installed;
    });
    workbenchStore.setState({ installImportedPack });
    const user = userEvent.setup();
    render(<MemoryRouter><PdfImportPage adapter={adapter} /></MemoryRouter>);

    await user.upload(
      screen.getByLabelText("选择本地 PDF"),
      new File(["%PDF original fixture"], "original-ui-sample.pdf", { type: "application/pdf" }),
    );
    expect(await screen.findByText(/original-ui-sample\.pdf/)).toBeInTheDocument();
    expect(screen.getAllByText(/3 页/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /提取并整理/ }));
    expect(await screen.findByDisplayValue("Community Seed Library")).toBeInTheDocument();
    expect(screen.getByText("识别到 2 题")).toBeInTheDocument();

    await user.type(screen.getByLabelText("粘贴 Answer Key"), "1 TRUE\n2 NOT GIVEN");
    await user.click(screen.getByRole("button", { name: "按题号应用答案" }));
    await user.click(screen.getByRole("button", { name: /导入本地题库/ }));

    expect(await screen.findByText("Reading 题包已导入")).toBeInTheDocument();
    expect(installImportedPack).toHaveBeenCalledTimes(1);
    const pack = installImportedPack.mock.calls[0][0];
    expect(pack.manifest.importMetadata?.sourceFileName).toBe("original-ui-sample.pdf");
    expect(pack.modules[0].type).toBe("reading");
  });
});
