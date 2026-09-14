# Contributing

## Development setup

The project requires Node.js and npm. Native Tauri development additionally requires Rust stable MSVC, Visual Studio C++ Build Tools, a Windows SDK and WebView2.

```powershell
cd D:\Projects\雅思or算法软件项目
npm install
npm run lint
npm test
npm run build
```

After the Rust toolchain is available:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

## Change guidelines

- Keep learning data local-first and preserve the user-selected workspace boundary.
- Do not commit user workspaces, local databases, private materials, API keys, build output or copyrighted Cambridge IELTS content.
- Test both loading/error states and persistence/recovery behavior for affected flows.
- Use focused conventional commit messages such as `feat(reading): ...` or `fix(workspace): ...`.

## Pull requests

Describe the affected desktop flow, exact test commands and whether the result was verified in the renderer, native Tauri window or only through source-level tests.
