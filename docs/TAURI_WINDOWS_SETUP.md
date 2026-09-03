# Windows Tauri 2 环境准备

## 当前机器检查（2026-09-03）

| 组件 | 结果 |
| --- | --- |
| Node.js / npm | `v24.14.0` / `11.9.0`，可用 |
| Git | `2.54.0.windows.1`，可用 |
| 项目 Tauri CLI | `2.11.4`，`npm run tauri -- info` 可运行 |
| Tauri JS API | `2.11.1` |
| WebView2 Runtime | `152.0.4191.53`，Tauri CLI 已检测 |
| `rustc` / `cargo` / `rustup` | 未安装或不在 PATH |
| MSVC C++ Build Tools | Tauri CLI 未检测到可用安装 |
| Windows SDK | 未检测到可与 MSVC 配合的 SDK |

因此当前只能验证 Web/Vite renderer。Rust 测试、`tauri dev`、真实工作区/SQLite 导入和 Tauri 安装包均未验证。

## 安装 Rust stable MSVC

1. 从 [rustup 官方站点](https://rustup.rs/) 下载并运行 `rustup-init.exe`。
2. Windows 上保留默认 MSVC host：`x86_64-pc-windows-msvc`。
3. 安装完成后关闭并重新打开 PowerShell；如果 PATH 仍未刷新，可重启 Windows。
4. 验证：

```powershell
rustup -V
rustc -V
cargo -V
rustup show active-toolchain
```

若误装 GNU toolchain，可显式切回：

```powershell
rustup default stable-msvc
```

## 安装 MSVC 与 Windows SDK

使用 Visual Studio Installer 安装 Visual Studio 2022 Build Tools，勾选“使用 C++ 的桌面开发”（Desktop development with C++）工作负载。至少确认以下组件存在：

- MSVC v143 C++ x64/x86 build tools；
- Windows 10 SDK 或 Windows 11 SDK；
- C++ CMake tools for Windows（推荐，便于依赖构建诊断）。

Tauri 官方 Windows 前置条件说明见 [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)，Microsoft 的命令行 C++ 构建说明见 [Build C/C++ code on the command line](https://learn.microsoft.com/en-us/cpp/build/building-on-the-command-line?view=msvc-170)。不要仅安装 SSMS；它不提供本项目需要的 MSVC 桌面构建链。

在普通 PowerShell 中可先运行 `npm run tauri -- info`。若需要直接检查 `cl.exe`，打开 “Developer PowerShell for VS 2022” 后执行：

```powershell
cl
where.exe cl
```

## 项目验证顺序

安装结束并重新打开终端后，在仓库根目录运行：

```powershell
rustc -V
cargo -V
rustup -V
npm run tauri -- info
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
npm run tauri build
```

`tauri dev` 应在标准 Windows 标题栏的桌面窗口内人工验证：非 C 盘测试工作区、SQLite 初始化、PDF 导入、关闭重开恢复和 Reading 双 Pane。`tauri build` 成功后再检查生成的安装包；WebView2 已存在并不代表这些命令已经通过。

本项目不会自动安装系统级工具，也不会修改全局 npm 或 Rust 配置。
