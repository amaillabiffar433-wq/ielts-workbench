import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const model = await readFile(new URL('public/ocr/eng.traineddata', root));
if (createHash('sha256').update(model).digest('hex') !== '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2') {
  throw new Error('Bundled English OCR model is missing or damaged. See public/ocr/NOTICE.md; no runtime download is used.');
}
const target = new URL('public/ocr/runtime/', root);
await mkdir(target, { recursive: true });
for (const name of ['tesseract-core.wasm.js', 'tesseract-core-simd.wasm.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'LICENSE']) {
  await copyFile(new URL(`node_modules/tesseract.js-core/${name}`, root), new URL(name === 'LICENSE' ? 'core-LICENSE.txt' : name, target));
}
await copyFile(new URL('node_modules/tesseract.js/dist/worker.min.js', root), new URL('worker.min.js', target));
await copyFile(new URL('node_modules/tesseract.js/LICENSE.md', root), new URL('worker-LICENSE.txt', target));
console.log('Offline English OCR assets prepared; model SHA-256 verified.');
