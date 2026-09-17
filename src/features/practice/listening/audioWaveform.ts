export const DEFAULT_WAVEFORM_BAR_COUNT = 96;

export async function decodeWaveform(
  bytes: Uint8Array<ArrayBuffer>,
  barCount = DEFAULT_WAVEFORM_BAR_COUNT,
): Promise<readonly number[]> {
  if (!Number.isSafeInteger(barCount) || barCount < 8 || barCount > 256) {
    throw new Error("Waveform bar count must be an integer between 8 and 256.");
  }

  const AudioContextConstructor = globalThis.AudioContext;
  if (!AudioContextConstructor) return [];

  const context = new AudioContextConstructor();
  try {
    const audioBuffer = await context.decodeAudioData(bytes.buffer.slice(0));
    if (audioBuffer.length === 0 || audioBuffer.numberOfChannels === 0) return [];

    const channel = audioBuffer.getChannelData(0);
    const bucketSize = Math.max(1, Math.floor(channel.length / barCount));
    const peaks = Array.from({ length: barCount }, (_, index) => {
      const start = index * bucketSize;
      const end = index === barCount - 1 ? channel.length : Math.min(channel.length, start + bucketSize);
      let sumSquares = 0;
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        const sample = channel[sampleIndex];
        sumSquares += sample * sample;
      }
      return end > start ? Math.sqrt(sumSquares / (end - start)) : 0;
    });
    const maximum = Math.max(...peaks, 0.0001);
    return peaks.map((peak) => Math.max(0.06, Math.min(1, peak / maximum)));
  } finally {
    await context.close();
  }
}
