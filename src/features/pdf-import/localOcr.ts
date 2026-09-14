import { createWorker, type Worker } from "tesseract.js";

export function localOcrOptions(baseUrl: string) {
  const local = new URL("ocr/", baseUrl);
  return {
    workerPath: new URL("runtime/worker.min.js", local).href,
    corePath: new URL("runtime/", local).href,
    langPath: local.href,
    workerBlobURL: false,
    gzip: false,
    cacheMethod: "none" as const,
  };
}

/** One bounded, cancellable local worker per explicit user action. No CDN defaults. */
export async function recognizeLocalEnglish(canvas: HTMLCanvasElement, signal: AbortSignal, onProgress: (message: string) => void) {
  if (canvas.width * canvas.height > 12_000_000) throw new Error("OCR 区域过大，请缩小框选范围。");
  let worker: Worker | undefined;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const cancellation = new Promise<never>((_, reject) => {
    cancel = () => { cancelled = true; reject(new Error("OCR 已取消；仍可保存原版区域。")); };
    signal.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => { cancelled = true; reject(new Error("OCR 超过 90 秒，请改用较小区域或直接保存原图。")); }, 90_000);
    if (signal.aborted) cancel();
  });
  const task = (async () => {
    if (cancelled) throw new Error("OCR 已取消。");
    worker = await createWorker("eng", 1, { ...localOcrOptions(new URL(import.meta.env.BASE_URL, location.href).href),
      logger: (status) => { if (!cancelled) onProgress(`本地 OCR：${status.status} ${Math.round(status.progress * 100)}%`); },
    });
    if (cancelled) { await worker.terminate(); throw new Error("OCR 已取消。"); }
    const result = await worker.recognize(canvas);
    return { text: result.data.text.trim(), confidence: result.data.confidence };
  })();
  try { return await Promise.race([task, cancellation]); }
  finally {
    cancelled = true;
    if (timer) clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    if (worker) await worker.terminate();
  }
}
