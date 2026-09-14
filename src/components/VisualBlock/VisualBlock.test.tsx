import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workbenchStore } from "../../stores/workbenchStore";
import { InMemoryLearningRepository } from "../../infrastructure/repositories/InMemoryLearningRepository";
import { createOriginalDemoWritingChartPng } from "../../infrastructure/demo";
import { DraftImageContext } from "./DraftImageContext";
import { VisualBlock } from "./VisualBlock";

const initial = workbenchStore.getState();
afterEach(() => { cleanup(); workbenchStore.setState(initial, true); vi.restoreAllMocks(); });
describe("visual content in independent panes", () => {
  it("reads a stable draft asset twice, zooms independently, and never creates duplicate DOM IDs", async () => {
    const repository = new InMemoryLearningRepository();
    const asset = await repository.saveImportImage("test-draft", createOriginalDemoWritingChartPng());
    workbenchStore.setState({ repository });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:ephemeral-image");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const visual = { type: "snapshot" as const, assetId: asset.id, altText: "Original context", sourcePage: 2 };
    const { unmount } = render(<DraftImageContext.Provider value="test-draft"><div data-testid="left"><VisualBlock visual={visual} /></div><div data-testid="right"><VisualBlock visual={visual} /></div></DraftImageContext.Provider>);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    await userEvent.click(within(screen.getByTestId("left")).getByRole("button", { name: "放大原图" }));
    expect(within(screen.getByTestId("left")).getByRole("img")).toHaveStyle({ width: "150%" });
    expect(within(screen.getByTestId("right")).getByRole("img")).toHaveStyle({ width: "100%" });
    expect(document.querySelectorAll("[id]")).toHaveLength(0);
    unmount();
    expect(revoke).toHaveBeenCalledTimes(2);
  });
  it("reports missing files rather than silently hiding a broken visual context", async () => {
    workbenchStore.setState({ repository: new InMemoryLearningRepository() });
    render(<DraftImageContext.Provider value="test-draft"><VisualBlock visual={{ type: "figure", assetId: "missing-image", altText: "Map" }} /></DraftImageContext.Provider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("图片读取失败");
  });
});
