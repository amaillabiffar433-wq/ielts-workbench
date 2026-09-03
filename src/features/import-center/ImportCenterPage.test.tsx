import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { originalDemoPack } from "../../infrastructure/demo";
import type { InstalledPackSummary } from "../../infrastructure/repositories/LearningRepository";
import { workbenchStore } from "../../stores/workbenchStore";
import { ImportCenterPage } from "./ImportCenterPage";

const originalState = workbenchStore.getState();

const demoSummary: InstalledPackSummary = {
  id: originalDemoPack.manifest.id,
  title: originalDemoPack.manifest.title,
  sourceLabel: originalDemoPack.manifest.sourceLabel,
  edition: originalDemoPack.manifest.edition,
  language: "en",
  modules: [...originalDemoPack.manifest.modules],
  installedAt: originalDemoPack.manifest.createdAt,
  attribution: originalDemoPack.manifest.attribution,
};

describe("ImportCenterPage", () => {
  beforeEach(() => {
    workbenchStore.setState({
      installedPacks: [],
      error: null,
      clearError: vi.fn(),
      installPack: vi.fn(async () => demoSummary),
    });
  });

  afterEach(() => {
    cleanup();
    workbenchStore.setState(originalState, true);
  });

  it("shows invalid manifest issues and never offers installation", async () => {
    workbenchStore.setState({
      validatePack: vi.fn(async () => ({
        valid: false,
        errors: [{ path: "manifest.json.schemaVersion", code: "INVALID_SCHEMA", message: "只支持 schemaVersion 1" }],
        warnings: [],
      })),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ImportCenterPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "验证内置原创 demo" }));

    expect(await screen.findByText("只支持 schemaVersion 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认安装到工作区" })).not.toBeInTheDocument();
  });

  it("blocks duplicate pack IDs after a valid preview", async () => {
    workbenchStore.setState({
      installedPacks: [demoSummary],
      validatePack: vi.fn(async () => ({
        valid: true,
        errors: [],
        warnings: [],
        pack: demoSummary,
      })),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ImportCenterPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "验证内置原创 demo" }));

    expect(await screen.findByText(/Pack ID 已安装：original-demo-pack/)).toBeInTheDocument();
    expect(screen.getByText(/拒绝覆盖、合并或自动重命名/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认安装到工作区" })).not.toBeInTheDocument();
  });

  it("requires explicit confirmation before installing a valid new pack", async () => {
    const installPack = vi.fn(async () => demoSummary);
    workbenchStore.setState({
      installedPacks: [],
      validatePack: vi.fn(async () => ({
        valid: true,
        errors: [],
        warnings: [{ path: "manifest.json.attribution", code: "REVIEW_ATTRIBUTION", message: "请人工核对署名" }],
        pack: demoSummary,
      })),
      installPack,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ImportCenterPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "验证内置原创 demo" }));
    expect(await screen.findByText("请人工核对署名")).toBeInTheDocument();

    const installButton = screen.getByRole("button", { name: "确认安装到工作区" });
    expect(installButton).toBeDisabled();
    expect(installPack).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: /我已核对题包 ID、来源与模块/ }));
    expect(installButton).toBeEnabled();
    await user.click(installButton);

    expect(installPack).toHaveBeenCalledWith("samples/original-demo-pack");
    expect(await screen.findByText("Alderwick Skills Sampler 已安装")).toBeInTheDocument();
  });
});
