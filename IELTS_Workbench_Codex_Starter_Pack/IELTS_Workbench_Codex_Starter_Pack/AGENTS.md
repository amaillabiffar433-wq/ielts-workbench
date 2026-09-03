# AGENTS.md — IELTS Workbench

## Mission

Build a Windows-first, local-first IELTS Listening/Reading/Writing desktop application with Tauri 2, React, TypeScript, Rust, and SQLite. The app must have its own desktop GUI and remain usable offline. Future algorithm-study support is possible, but current code must not overgeneralize prematurely.

## Non-negotiable rules

1. This is a desktop app, not a hosted website. Do not introduce Spring Boot, MySQL, login, cloud accounts, telemetry, ads, or a required local HTTP backend.
2. Never commit Cambridge IELTS books, questions, answers, audio, images, scans, transcripts, or other copyrighted test content.
3. Do not scrape or hotlink third-party test sites.
4. Do not copy source code or assets from reference repositories unless a valid license is verified and attribution/obligations are documented. Current reference repositories are behavioral references only.
5. Keep immutable question packs separate from mutable user data.
6. Stable domain IDs are the source of truth. Pane position, DOM nodes, pixels, and screen coordinates are never identity.
7. Answers and annotations belong to sessions/content, never to a left or right pane.
8. Large data and the main SQLite database live in the user-selected workspace, not silently in C:\AppData.
9. Core practice works offline. Network access is opt-in and only for explicitly invoked AI features.
10. API keys must never be stored in renderer source, localStorage, logs, Git, or plaintext settings.
11. Exam mode must not expose AI, answers, transcript, or forbidden playback controls.
12. AI suggestions never silently modify an essay or answer.
13. Do not claim tests/builds passed unless the command was actually run and succeeded.

## Read before work

Always read:

- `PROJECT_SPEC.md`
- `docs/EXECUTION_PLAN.md` when present
- relevant ADRs in `docs/decisions/`
- `docs/DATA_FORMAT.md`
- `docs/SECURITY.md`

For multi-step work, update `docs/EXECUTION_PLAN.md` before coding and keep status current.

## Standard commands

Prefer the repository scripts. Expected commands:

```powershell
npm install
npm run dev
npm run tauri dev
npm run lint
npm test
npm run build
npm run tauri build
```

Do not change global npm/Rust configuration without explicit user approval. Do not install system-wide dependencies automatically.

## Architecture

- Frontend: React + TypeScript + Vite.
- Desktop shell/native capabilities: Tauri 2.
- Rust owns workspace access, path validation, SQLite, future network calls, and secret access.
- Frontend components use repository/service interfaces rather than raw Tauri calls.
- Use Zod for external JSON and IPC-facing frontend validation.
- Use a versioned `IELTSPack` schema.
- Use discriminated unions for questions and anchors.
- Use migrations for SQLite.
- Provide mock/in-memory repository implementations for tests.
- Keep components focused. Split files that become difficult to reason about; do not create a monolithic practice page.
- Prefer explicit domain names over generic `data`, `item`, or `handler`.

## Shared-pane rules

- Both panes read the same canonical document, answer store, and annotation store.
- Pane state contains only view concerns: selected view, scroll position, width, focus.
- Text annotations use `blockId`, offsets, quote, prefix, and suffix.
- First implementation may restrict selection to one stable content block.
- No pixel-coordinate persistence.
- A change made in one pane must be observable in the other without reload.

## Data and privacy

- Normalize and validate every user-selected path.
- Reject attempts to escape the workspace.
- Minimize Tauri permissions and CSP.
- Do not load remote pages in the app window.
- Logs must omit API keys and avoid full essays/test texts.
- Back up before destructive migrations.
- Question packs are read-only after installation; user state goes to SQLite.

## UI quality

- The product should look like a desktop learning tool, not a landing page.
- Use a standard OS title bar in the first release.
- Support keyboard navigation and visible focus.
- Do not rely only on color for state.
- Show autosave/error/loading states.
- Optimize reading typography before decorative effects.
- Custom backgrounds and glass effects are later enhancements, not an excuse to delay core usability.

## Testing and definition of done

A task is done only when:

1. Code compiles/type-checks.
2. Relevant unit/component/Rust tests pass.
3. The affected user flow is manually exercised where possible.
4. Error and empty states exist.
5. Documentation is updated.
6. Security/privacy constraints still hold.
7. Actual commands and results are reported.

When blocked by a missing Windows/Tauri prerequisite, complete all unblocked work and document the exact blocker. Never replace implementation with a promise to finish later.

## Work style

- Inspect before editing.
- Preserve existing user work.
- Choose sensible defaults for minor decisions and record important decisions as ADRs.
- Make small, coherent changes.
- Avoid unrelated refactors.
- Never push to a remote unless explicitly asked.
- At the end of each task, summarize files changed, tests run, results, remaining risks, and the next highest-value step.
