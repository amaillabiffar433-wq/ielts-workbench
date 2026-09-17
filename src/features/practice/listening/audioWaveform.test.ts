import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeWaveform } from "./audioWaveform";

const OriginalAudioContext = globalThis.AudioContext;

afterEach(() => {
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: OriginalAudioContext });
  vi.restoreAllMocks();
});

describe("decodeWaveform", () => {
  it("returns no decorative data when decoding is unavailable", async () => {
    Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: undefined });
    await expect(decodeWaveform(new Uint8Array([1, 2, 3]).slice() as Uint8Array<ArrayBuffer>)).resolves.toEqual([]);
  });

  it("derives normalized RMS bars from decoded local audio", async () => {
    const close = vi.fn(async () => undefined);
    class FakeAudioContext {
      close = close;
      async decodeAudioData() {
        return {
          length: 8,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array([0, 0, 0.5, -0.5, 1, -1, 0.25, -0.25]),
        } as unknown as AudioBuffer;
      }
    }
    Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeAudioContext });

    const bars = await decodeWaveform(new Uint8Array([1, 2, 3]).slice() as Uint8Array<ArrayBuffer>, 8);
    expect(bars).toHaveLength(8);
    expect(Math.max(...bars)).toBe(1);
    expect(Math.min(...bars)).toBeGreaterThan(0);
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects unsafe rendering sizes", async () => {
    await expect(decodeWaveform(new Uint8Array().slice() as Uint8Array<ArrayBuffer>, 4)).rejects.toThrow(/between 8 and 256/);
  });
});
