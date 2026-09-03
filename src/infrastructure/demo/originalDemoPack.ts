import manifest from "../../../samples/original-demo-pack/manifest.json";
import listening from "../../../samples/original-demo-pack/modules/listening.json";
import reading from "../../../samples/original-demo-pack/modules/reading.json";
import writing from "../../../samples/original-demo-pack/modules/writing.json";
import { parseIeltsPack } from "../../domain";

export const ORIGINAL_DEMO_PACK_FOLDER = "samples/original-demo-pack";
export const ORIGINAL_DEMO_AUDIO_PATH = "media/audio/original-demo-silence.wav";

export const originalDemoPack = parseIeltsPack({
  manifest,
  modules: [reading, listening, writing],
});

/** Mirrors samples/original-demo-pack/scripts/generate-silent-wav.mjs. */
export function createOriginalDemoSilentWav(): Uint8Array<ArrayBuffer> {
  const sampleRate = 8_000;
  const durationSeconds = 4;
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataLength = sampleRate * durationSeconds * channels * bytesPerSample;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  return bytes;
}
