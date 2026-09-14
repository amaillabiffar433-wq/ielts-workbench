import { describe, expect, it } from "vitest";
import { localOcrOptions } from "./localOcr";
describe("offline OCR resource routing", () => {
  it("pins every resource to the current desktop origin and disables CDN/cache fallbacks", () => {
    const options = localOcrOptions("http://tauri.localhost/");
    expect(options).toMatchObject({ workerBlobURL: false, gzip: false, cacheMethod: "none" });
    for (const path of [options.workerPath, options.corePath, options.langPath]) expect(new URL(path).origin).toBe("http://tauri.localhost");
    expect(options.workerPath).toBe("http://tauri.localhost/ocr/runtime/worker.min.js");
  });
});
