import manifest from "../../../samples/original-demo-pack/manifest.json";
import listening from "../../../samples/original-demo-pack/modules/listening.json";
import reading from "../../../samples/original-demo-pack/modules/reading.json";
import writing from "../../../samples/original-demo-pack/modules/writing.json";
import originalWorkshopChartDataUrl from "../../../samples/original-demo-pack/media/images/original-workshop-attendance.png?inline";
import { parseIeltsPack } from "../../domain";

export const ORIGINAL_DEMO_PACK_FOLDER = "samples/original-demo-pack";
export const ORIGINAL_DEMO_AUDIO_PATH = "media/audio/original-demo-tones.wav";
export const ORIGINAL_DEMO_SILENT_AUDIO_PATH = "media/audio/original-demo-silence.wav";
export const ORIGINAL_DEMO_WRITING_CHART_PATH = "media/images/original-workshop-attendance.png";

export const originalDemoPack = parseIeltsPack({
  manifest,
  modules: [reading, listening, writing],
});

function decodeInlineAsset(dataUrl: string): Uint8Array<ArrayBuffer> {
  const separator = dataUrl.indexOf(",");
  if (separator < 0 || !dataUrl.slice(0, separator).endsWith(";base64")) {
    throw new Error("Original demo media was not bundled as a Base64 data URL.");
  }
  const binary = globalThis.atob(dataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function createOriginalDemoToneWav(): Uint8Array<ArrayBuffer> {
  const sampleRate = 16_000;
  const durationSeconds = 4;
  const dataLength = sampleRate * durationSeconds * 2;
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
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  const notes = [440, 554.37, 659.25, 880];
  for (let sample = 0; sample < sampleRate * durationSeconds; sample += 1) {
    const second = sample / sampleRate;
    const slot = Math.floor(second);
    const amplitude = second - slot < 0.62 ? 0.28 : 0;
    const value = Math.round(
      32_767 * amplitude * Math.sin(2 * Math.PI * notes[Math.min(slot, notes.length - 1)] * second),
    );
    view.setInt16(44 + sample * 2, value, true);
  }
  return bytes;
}

export function createOriginalDemoWritingChartPng(): Uint8Array<ArrayBuffer> {
  return decodeInlineAsset(originalWorkshopChartDataUrl);
}

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
