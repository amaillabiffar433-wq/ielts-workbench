import { ImportImageSchema, type ImportImage } from "./LearningRepository";

export async function describeImportPng(bytes: Uint8Array<ArrayBuffer>): Promise<ImportImage> {
  if (bytes.length < 33 || bytes.length > 8 * 1024 * 1024 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    throw new Error("截图必须是有效 PNG，且不超过 8 MiB。");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (width * height > 12_000_000) throw new Error("截图不能超过 1200 万像素。");
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const id = `visual-${sha256}`;
  return ImportImageSchema.parse({ id, relativePath: `media/images/${id}.png`, sha256, width, height, byteLength: bytes.length });
}
