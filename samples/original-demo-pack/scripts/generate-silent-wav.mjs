import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sampleRate = 8_000;
const durationSeconds = 4;
const channelCount = 1;
const bitsPerSample = 16;
const bytesPerSample = bitsPerSample / 8;
const dataLength = sampleRate * durationSeconds * channelCount * bytesPerSample;
const wav = Buffer.alloc(44 + dataLength, 0);

wav.write("RIFF", 0, "ascii");
wav.writeUInt32LE(36 + dataLength, 4);
wav.write("WAVE", 8, "ascii");
wav.write("fmt ", 12, "ascii");
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(channelCount, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
wav.writeUInt16LE(channelCount * bytesPerSample, 32);
wav.writeUInt16LE(bitsPerSample, 34);
wav.write("data", 36, "ascii");
wav.writeUInt32LE(dataLength, 40);

const outputUrl = new URL("../media/audio/original-demo-silence.wav", import.meta.url);
mkdirSync(new URL("../media/audio/", import.meta.url), { recursive: true });
writeFileSync(outputUrl, wav);

const digest = createHash("sha256").update(wav).digest("hex");
console.log(
  JSON.stringify(
    {
      output: fileURLToPath(outputUrl),
      durationMs: durationSeconds * 1_000,
      sampleRate,
      bytes: wav.length,
      sha256: digest,
    },
    null,
    2,
  ),
);
