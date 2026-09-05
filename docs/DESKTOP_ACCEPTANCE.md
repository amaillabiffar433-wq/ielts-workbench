# IELTS Workbench Windows 桌面验收记录

更新日期：2026-09-05

状态定义：`未开始`、`已实现但未原生验证`、`浏览器验证通过`、`环境阻塞`、`验证失败`、`待人工验收`、`原生验证通过`。

## 验收环境

- 仓库：`D:\Projects\雅思or算法软件项目`
- 分支：`feat/pdf-import-mvp`
- 起始 HEAD：`dbfe98a5ecb596e7f12c4e1318f548227c69af3f`
- 测试工作区：因 Tauri 环境阻塞而未创建；恢复时使用独立、可写的 `D:\IELTS-Workbench-Acceptance`，不得指向用户真实学习数据。

## 验收矩阵

| 项目 | 操作与预期 | 实际结果 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| 原生 Repository 选择 | Tauri 窗口必须使用 `TauriLearningRepository`，失败不得回退 IndexedDB | 工厂逻辑和单元测试确认 Tauri 标记只选择原生实现；未启动真实窗口 | `src/infrastructure/repositories/runtime.test.ts` | 已实现但未原生验证 |
| 工作区与 SQLite | 选择独立 D 盘目录，创建固定目录和数据库 | 未运行；没有新建、删除或清空数据库 | Rust/Cargo、MSVC/SDK 缺失 | 环境阻塞 |
| 原创 PDF 导入 | 原生选择文件、读取字节、解析、安装、重开 | Rust 独占对话框与读取的链路已实现；真实 IPC 未运行 | 原创 PDF SHA-256 已锁定；TS 选择/取消/长度/I/O 边界测试通过 | 已实现但未原生验证 |
| Reading | 答案和标记跨 Pane 同步，重启恢复 | 浏览器既有闭环保留；SQLite 与重启未运行 | 组件与 repository 测试通过 | 环境阻塞 |
| Listening | 播放可听原创音频，验证 Study/Exam 限制 | 4 秒可听音阶已接入；媒体路径和 Exam 策略测试通过，真实扬声器未验收 | WAV SHA-256 `86D7C2CD…40CE6`，PCM 峰值 9175 | 已实现但未原生验证 |
| Writing | 自动保存、版本、提交、Task 1 图片、快速关窗 | Task 1 图表读取/显示测试通过；SQLite、正常快速关窗和提交恢复未运行 | PNG SHA-256 `99305E2F…330D`；图片目视通过 | 已实现但未原生验证 |
| 两轮完整重启 | 正常退出后重新启动两次，恢复题包和用户状态 | 未运行；浏览器刷新证据未冒充原生重启 | Rust/Tauri 环境阻塞 | 环境阻塞 |
| Release 独立运行 | 关闭 Vite 后启动 Release，可加载 PDF worker/媒体/SQLite | 未构建、未启动；Vite 构建只确认 worker 被打包 | `dist/assets/pdf.worker.min-Dswkl-cV.mjs`（被 Git 忽略） | 环境阻塞 |
| Windows 安装包 | 生成安装包；未获授权前不执行系统安装 | 未生成，也未安装 | Rust/Tauri 构建链缺失 | 环境阻塞 |

## 环境恢复入口

本轮只记录，不执行安装。恢复前需要用户明确授权：

1. 按 [Tauri 官方 Windows 前置要求](https://v2.tauri.app/start/prerequisites/)安装 Visual Studio Build Tools 的 **Desktop development with C++** 工作负载，并确认包含 MSVC x64/x86 编译工具和 Windows 10/11 SDK。
2. 使用 [Rust 官方安装入口](https://www.rust-lang.org/tools/install)的 `rustup-init.exe` 安装 Rust stable MSVC，默认主机应为 `x86_64-pc-windows-msvc`；安装后重开终端。
3. 在 D 盘项目目录依次核验：`rustup show`、`rustc --version`、`cargo --version`、`npm run tauri -- info`。
4. 从以下命令恢复，而不是重新审计或重建项目：

```powershell
Set-Location -LiteralPath 'D:\Projects\雅思or算法软件项目'
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

## 原生手工验收步骤

1. 在真实 Tauri 窗口选择 `D:\IELTS-Workbench-Acceptance`，记录实际 `ielts-workbench.sqlite3` 路径和 Repository 类型。
2. 导入 `D:\Projects\雅思or算法软件项目\local-data\import-samples\original-reading-pdf-mvp.pdf`；取消一次选择，再完成一次导入和重开。
3. Reading 左右 Pane 分别操作同一答案和文字标记；查询 SQLite 对应 Session、answer、annotation 记录。
4. Listening 播放 `original-demo-tones.wav`，人工确认四段上行音高，并核对 Study/Exam 控制限制。
5. Writing Task 1 确认柱状图出现，输入正文、等待自动保存、建手动版本、正常快速关闭窗口；重启后验证正文，再创建提交快照。
6. 正常退出并确认应用进程结束，连续完成两轮重新启动与恢复；每轮都核对题包、答案、标记、草稿、版本和媒体。
7. 上述通过后执行 `npm run tauri build`；关闭开发服务器，单独启动 Release 程序并重复 worker/媒体/SQLite 核验。安装包只生成，不在未授权情况下安装。

验收证据必须包含实际数据库路径、读取回的记录摘要、进程退出/启动结果和 Release 文件路径；页面“已保存”提示不能单独作为持久化证据。
