# Visual Fidelity PDF / local OCR acceptance — 2026-09-12

Status: BUILD NOT COMPLETE until the user's lawful Cambridge sample meets the requested timed acceptance. Original fixtures are not Cambridge material.

## Implementation and operation

Open Import → Reading PDF (or scan PDF) → select a file in the Windows dialog → choose Passage pages → **快速导入**. Reliable text enters the existing editor; low-text pages warn but still open. In **使用原版区域** select a Passage/group, page and region (drag, whole page, left/right column), then **作为原版区域**. A saved region can be replaced without changing its block ID, reordered or removed from the draft without deleting its file. Existing structured paragraph/list/table/completion blocks can be mixed with snapshots/images/figures.

For scans choose **OCR 此页** or **OCR 所选区域**. Expand editable extracted text and proofread it; explicitly append it or check **将校对文字附在截图中** and save the region. OCR never creates an answer key. Region text that has not been appended/saved is explicitly labelled as temporary editor text.

Choose group → enter a range such as `14-19` → choose answer control → create controls. Matching/choice contexts may use batch A–J options; edit their meaning against the visible original. Set instructions/word limit, paste numbered Answer Key → preview unique matches → confirm → validation/preview → install → practice. Missing keys remain ungraded warnings, not guessed answers. Missing images/invalid IDs/invalid answer contracts remain blocking errors.

In Reading, each Pane chooses its own Passage/group/range/question. Images have independent 100–300% zoom and a scroll viewport; controls, question navigation and save status stay separate. Text highlighting applies to structured or saved OCR text, not pixels. A note is the existing text annotation's note; flag remains Session state.

## Existing answer primitives retained

| IELTS forms | Existing input contract |
| --- | --- |
| TRUE/FALSE/NOT GIVEN; YES/NO/NOT GIVEN | Three-value radios |
| Single choice; multiple choice | Choice / bounded unordered choices, existing scoring contract |
| Matching headings/information/features/sentence endings | Matching options and reuse policy |
| Sentence/summary/note/table completion | Existing fill/text inputs, structured blank binding where available |
| Flow-chart completion; diagram label completion; short answer | Text or matching controls beside the original figure |

No new AI/OCR-derived answers or image hotspot semantics are introduced. Arbitrary merged/nested tables and maps are displayed as original regions, not automatically reconstructed into HTML. Reading module version 4 is only the visual data gate, not a separate page or architecture; old module 1/2/3 and draft identities remain compatible (ADR 0005).

## Evidence boundary and files

- Tests and first build: `tmp/visual-acceptance-20260912/` (retained, ignored by Git).
- Original generator: `samples/visual-pdf-fixtures/generate.py`; output PDFs and page PNGs: `output/visual-pdf-fixtures-20260912/`.
- First native workspace: `D:\IELTS-Workbench-Visual-Acceptance-20260912`, SQLite at its root. A and C passed native import/answer and resource/annotation IPC read-back after a complete process exit. C OCR: 8466 ms, confidence 95%, bundled same-origin worker/core/English model only. First-run screenshots/JSON: `output/playwright/visual-20260912/`.
- Final-run workspace and evidence will be recorded after source-fix rebuild, separately from this first-run workspace. No old learning database is used for acceptance.
- Native automation attaches to the Release's actual WebView at `http://tauri.localhost` through process-local CDP. PDF selection operates the native Windows dialog. It does not use Vite, a browser clone or mock IPC. Screenshots show the actual WebView content (not an OS title-bar capture).

## Known bounds

- Offline English/Latin OCR only; quality depends on scan resolution, orientation, noise and fonts. 90-second cancellable jobs; 12 MP canvas cap. A warning/failed OCR does not prevent image import.
- Captures: PNG only, 8 MiB/12 MP/6000-pixel edge; maximum 100 saved assets per draft. Draft setting metadata/text remains capped at 240 KiB; split very large documents into sensible ranges. OCR attached to a visual block is capped at 20000 characters.
- Basic two-column order is heuristic, not a probability or semantic guarantee. Ambiguous multiple columns need manual region selection or snapshots; there is no OCR layout reconstruction promise.
- Automatic recognition is limited to existing explicit text conventions. The user still sets/reviews groups, controls, options, word limits and keys. There is no automatic arbitrary region-to-table/list conversion or all-in-one OCR understanding.
- Original PDFs/captures/unused assets and prior releases are retained. Runtime blob URLs are transient presentation handles only; persistent references are hash-based workspace asset IDs/relative paths.
- The executable embeds PDF worker, OCR worker/core/model and frontend resources. The chosen workspace (SQLite, packs/media, drafts/imports) must remain available separately. WebView2 is the already installed Windows runtime.
