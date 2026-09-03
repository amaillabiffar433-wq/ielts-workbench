import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IELTSPack } from "../../domain";
import { originalDemoPack } from "../../infrastructure/demo";
import { workbenchStore } from "../../stores/workbenchStore";
import { usePracticeRoutePack } from "./usePracticeRoutePack";

const originalState = workbenchStore.getState();

function packWithIdentity(packId: string, testId: string): IELTSPack {
  return {
    ...originalDemoPack,
    manifest: {
      ...originalDemoPack.manifest,
      id: packId,
      title: `Pack ${packId}`,
      tests: [{
        ...originalDemoPack.manifest.tests[0],
        id: testId,
      }],
    },
    modules: originalDemoPack.modules.map((module) => ({ ...module, testId })),
  };
}

function Probe() {
  const routePack = usePracticeRoutePack();
  const navigate = useNavigate();
  return (
    <div>
      <output aria-label="route state">
        {routePack.status}:{routePack.pack?.manifest.id ?? "none"}:{routePack.test?.id ?? "none"}:{routePack.error ?? "none"}
      </output>
      <button onClick={() => navigate("/practice/reading?packId=third-pack&testId=third-test&mode=study")} type="button">
        open third
      </button>
    </div>
  );
}

function renderProbe(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Probe /></MemoryRouter>);
}

describe("usePracticeRoutePack", () => {
  afterEach(() => {
    cleanup();
    workbenchStore.setState({
      activePack: originalState.activePack,
      loadPack: originalState.loadPack,
    });
    vi.restoreAllMocks();
  });

  it("falls back to the active pack only when both route IDs are absent", () => {
    workbenchStore.setState({ activePack: originalDemoPack, loadPack: vi.fn() });
    renderProbe("/practice/reading?mode=study");

    expect(screen.getByLabelText("route state")).toHaveTextContent(
      "ready:original-demo-pack:demo-test-01:none",
    );
  });

  it("rejects incomplete or invalid route identity without loading a pack", () => {
    const loadPack = vi.fn();
    workbenchStore.setState({ activePack: originalDemoPack, loadPack });
    renderProbe("/practice/reading?packId=second-pack&mode=study");

    expect(screen.getByLabelText("route state")).toHaveTextContent("error:none:none:练习链接必须同时包含");
    expect(loadPack).not.toHaveBeenCalled();
  });

  it("never exposes the old active pack while the explicit target is loading", async () => {
    const secondPack = packWithIdentity("second-pack", "second-test");
    let resolveSecond: ((pack: IELTSPack | null) => void) | undefined;
    const loadPack = vi.fn(() => new Promise<IELTSPack | null>((resolve) => { resolveSecond = resolve; }));
    workbenchStore.setState({ activePack: originalDemoPack, loadPack });
    renderProbe("/practice/reading?packId=second-pack&testId=second-test&mode=study");

    expect(screen.getByLabelText("route state")).toHaveTextContent("loading:none:none:none");
    expect(screen.getByLabelText("route state")).not.toHaveTextContent("original-demo-pack");
    await act(async () => resolveSecond?.(secondPack));

    expect(screen.getByLabelText("route state")).toHaveTextContent("ready:second-pack:second-test:none");
  });

  it("ignores an older load result after the route changes", async () => {
    const secondPack = packWithIdentity("second-pack", "second-test");
    const thirdPack = packWithIdentity("third-pack", "third-test");
    const resolvers = new Map<string, (pack: IELTSPack | null) => void>();
    const loadPack = vi.fn((packId: string) => new Promise<IELTSPack | null>((resolve) => {
      resolvers.set(packId, resolve);
    }));
    workbenchStore.setState({ activePack: originalDemoPack, loadPack });
    const user = userEvent.setup();
    renderProbe("/practice/reading?packId=second-pack&testId=second-test&mode=study");
    await user.click(screen.getByRole("button", { name: "open third" }));

    await act(async () => resolvers.get("second-pack")?.(secondPack));
    expect(screen.getByLabelText("route state")).toHaveTextContent("loading:none:none:none");
    expect(screen.getByLabelText("route state")).not.toHaveTextContent("second-pack");

    await act(async () => resolvers.get("third-pack")?.(thirdPack));
    expect(screen.getByLabelText("route state")).toHaveTextContent("ready:third-pack:third-test:none");
  });
});
