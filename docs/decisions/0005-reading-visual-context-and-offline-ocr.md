# ADR 0005 — Structured + Visual Fidelity, offline English OCR

Date: 2026-09-12. Status: implemented, native acceptance tracked in BUILD_STATUS.md.

## Decision

Keep the existing Reading renderer, answer types, Session and SQLite schema. Extend its content union with snapshot/image/figure, separate from answer controls. Complex layout is displayed as original PNG regions rather than guessed DOM structure. Existing paragraph/list/table/completion contexts can be interleaved with images.

The pack envelope stays IELTSPack v1. Only Reading modules containing visual references use schemaVersion 4. Plain structured modules continue emitting 1/2/3 as appropriate. New readers accept all four; older executables correctly reject unsupported new content rather than silently losing figures. This is a data-version gate, not a parallel Reading page or database.

Draft versions 1/2/3 migrate deterministically to 4 by adding optional visual fields/image metadata with defaults. Existing IDs, answers, context order and editor choices are preserved. No SQL migration, deletion or re-numbering is needed.

## Ownership and safety

- Native Rust writes validated PNGs under `workspace/imports/visual-{draftId}/visual-{sha256}.png` (8 MiB, 12 megapixels, 6000 px edge, 100 files/draft limits).
- Draft settings contain metadata, never base64 pixels. Installation copies only explicitly referenced checked files into `workspace/packs/{packId}/media/images/` before normal pack validation and installation. Pack content remains immutable.
- Only stable draft/asset IDs cross the image IPC boundary. Hash mismatch, missing/wrong-kind media, invalid crops and cross-group links block installation. No arbitrary renderer path reads are introduced.
- Original PDF, older captures, installed packs and databases are not removed when editing a draft. Deleting a block removes its reference only; unused captures remain recoverable.
- Runtime object URLs are view-local and revoked at unmount; they are never persisted. Pane zoom/DOM stay independent, while question/block identity is canonical.
- A normal close waits for an in-flight snapshot save and then the existing draft queue, with a bounded 10-second failure path and explicit feedback.

## OCR and layout

Tesseract.js 6.0.1 plus a hash-pinned Apache-2.0 English tessdata_fast model are bundled. `prebuild` prepares locked worker/core assets locally; no network request is needed during use. Page/region OCR is explicit, cancellable and bounded to 90 seconds. OCR text must be manually reviewed and explicitly appended/saved to the draft. It is never treated as an answer key.

CSP adds only `wasm-unsafe-eval` for WebAssembly and same-origin workers; no `unsafe-eval`, remote connect target or relaxed native filesystem capability. Third-party licenses are shipped with assets.

Column detection uses text x/y/width/height and a conservative whitespace split. Reported confidence is heuristic, not a measured probability. Header/body-spanning or further-column ambiguity warns and offers manual region extraction/snapshots. There is no claim of arbitrary PDF semantic reconstruction, OCR correctness, image hotspot mapping or automatic answers.
