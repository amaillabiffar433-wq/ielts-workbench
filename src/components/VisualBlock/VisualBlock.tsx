import { useContext, useEffect, useState } from "react";
import type { VisualSource } from "../../domain/pack";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import "./VisualBlock.css";

import { DraftImageContext } from "./DraftImageContext";

/** Asset IDs are persistent; object URLs exist only for the lifetime of this view. */
export function VisualBlock({ visual }: { readonly visual: VisualSource }) {
  const draftId = useContext(DraftImageContext);
  const repository = useWorkbenchStore((state) => state.repository);
  const pack = useWorkbenchStore((state) => state.activePack);
  const [result, setResult] = useState<{ id: string; url?: string; error?: string } | null>(null);
  const [scale, setScale] = useState(100);
  const owner = draftId ?? pack?.manifest.id ?? "";
  const key = `${owner}:${visual.assetId}`;
  useEffect(() => {
    let alive = true;
    let url: string | undefined;
    const read = async () => {
      const asset = pack?.manifest.mediaAssets.find((candidate) => candidate.id === visual.assetId && candidate.type === "image");
      if (!draftId && !asset) throw new Error("The pack image reference is missing.");
      const bytes = draftId ? await repository.readImportImage(draftId, visual.assetId)
        : await repository.readPackMedia(owner, asset!.relativePath);
      if (!alive) return;
      url = URL.createObjectURL(new Blob([bytes], { type: asset?.mimeType ?? "image/png" }));
      setResult({ id: key, url });
    };
    void read().catch(() => { if (alive) setResult({ id: key, error: "Unable to read this workspace image. Check the installed pack." }); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [draftId, key, owner, pack, repository, visual.assetId]);
  const current = result?.id === key ? result : null;
  return <figure className="visual-block" data-visual-asset-id={visual.assetId}>
    <figcaption>
      <span>{visual.altText}{visual.sourcePage ? ` · PDF p.${visual.sourcePage}` : ""}</span>
      <button type="button" aria-label="Zoom out" disabled={scale <= 100} onClick={() => setScale((value) => Math.max(100, value - 50))}>−</button>
      <output>{scale}%</output>
      <button type="button" aria-label="Zoom in" disabled={scale >= 300} onClick={() => setScale((value) => Math.min(300, value + 50))}>＋</button>
      <button type="button" onClick={() => setScale(100)}>Fit width</button>
    </figcaption>
    {current?.error ? <p role="alert">{current.error}</p> : current?.url ?
      <div className="visual-block__viewport" tabIndex={0} aria-label="Original image scroll region">
        <img alt={visual.altText} src={current.url} style={{ width: `${scale}%` }} />
      </div> : <p role="status">Loading local image…</p>}
  </figure>;
}
