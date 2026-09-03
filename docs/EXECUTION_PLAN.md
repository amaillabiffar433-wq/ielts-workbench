# IELTS Workbench 第一轮执行计划

更新日期：2026-09-03（继续按仓库现场恢复；启动 Reading PDF 辅助导入 MVP）

## 当前执行切片：Reading PDF 辅助导入 MVP

本切片在现有 React/Tauri 架构和已完成页面之上增量实施，不重新初始化工程，也不重做 Reading、Library 或 Import Center。自动化测试仅使用原创/人工构造内容；来自个人网盘的 PDF 只允许进入被 Git 忽略的 `local-data/import-samples/`，不得上传、移动、重命名或提交。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| A | 复核仓库、Git、时间线、文档与现有导入边界；重跑 lint/test/build | 已完成：18 个测试文件、88 项测试、生产构建均通过 |
| B | 强化 `.gitignore`，建立首次稳定前端基线提交，并创建 `feat/pdf-import-mvp` 分支 | 进行中 |
| C | 只读检索并下载至多 1–2 个个人网盘 PDF；验证加密、文本层和页面提取 | 待执行；若连接器不提供读取能力则如实记录阻塞 |
| D | 增量实现 PDF 文件输入、逐页文本预览、页码范围、半自动分段、人工校正和答案键解析 | 待执行 |
| E | 通过现有 repository/IELTSPack/Library/Reading 链路保存、重开和练习；补足测试与文档 | 待执行 |
| F | 复核 Windows Rust/Tauri 前置条件，执行最终 lint/test/build 与浏览器冒烟并提交功能 | 待执行 |

安全边界：不做 OCR；不把 PDF 原文写入测试夹具或 Git；不在 renderer 的 `localStorage` 保存学习内容；不新增 Web 服务、账户系统或数据库旁路。桌面文件系统与 SQLite 仍由 Rust/Tauri adapter 负责，Web/Vite 仅提供可测试的本地内存适配器。

## 恢复结论

本文件在恢复前仍停留在 2026-09-01 的“脚手架进行中”，但当前目录已经包含 React/Tauri 工程、领域 schema、repository、SQLite 迁移、工作区与题包 Rust 实现、原创 demo、各功能页面和测试。恢复时没有重新初始化脚手架，也没有删除、重置或覆盖现有成果。

由于仓库仍是 unborn `master`（0 commit），全部项目文件都是 untracked，普通 `git log`/`git diff` 无法提供上一轮基线。只读取证进一步确认 `.git/refs/codex/turn-diffs` 中存在 2026-09-02 09:48 的自动树快照；该快照的 186 个文件与恢复开始时工作区逐 blob 一致。进度判断同时依据文件内容、修改时间、现有 Playwright 记录和本次重新执行的构建结果。

文件时间线显示：最后一批 Rust 题包实现修改于 2026-09-02 09:33，`dist/` 于 09:34 重新生成。因此断点位于 Phase 0–1 收尾验证与文档回写，而不是工程初始化。恢复前旧计划已原样备份到 `output/recovery-backup-20260902-095231/docs/EXECUTION_PLAN.md`。

## 当前环境

| 项目 | 检查结果 | 状态 |
| --- | --- | --- |
| 操作系统 | Windows，PowerShell | 可用 |
| Git | `2.54.0.windows.1`；0 commit，全部成果未跟踪 | 可用，但尚无普通提交基线 |
| Node.js | `v24.14.0` | 可用 |
| npm | `11.9.0` | 可用 |
| Tauri CLI | `tauri-cli 2.11.4` | CLI 包存在 |
| Rust / Cargo | 不在 PATH，默认 `%USERPROFILE%\.cargo\bin` 也不存在 | 阻塞 Rust 编译与测试 |
| Microsoft C++ Build Tools | `tauri info` 未检测到含 MSVC/Windows SDK 的 Visual Studio 或 Build Tools | 阻塞 Windows Tauri 打包验收 |
| WebView2 Runtime | `151.0.4129.107` | `tauri info` 已检测 |

当前实现已远超最初环境记录。starter pack 仍只作需求材料；未复制任何未授权参考仓库代码或内容。

## 架构决策

1. 使用 Tauri 2 + React + TypeScript + Vite，保留系统标题栏；不引入本地 HTTP 后端。
2. Rust 负责工作区选择后的路径验证、目录初始化、SQLite、题包安装、本地媒体读取和 IPC 边界；React 只通过 repository/service 接口访问这些能力。
3. `IELTSPack v1` 是只读源数据；答案、标记、草稿和版本写入用户工作区中的 SQLite。
4. 浏览器开发与单元测试使用同一 repository 接口的 in-memory 实现；桌面运行使用 Tauri 实现。
5. Reading 两个 Pane 只保存视图状态；答案键为 `sessionId + questionId`，标记锚定 `blockId + offsets + quote/prefix/suffix`。
6. demo 内容完全原创；AI 第一轮只提供禁用 provider 和可见上下文预览，不联网、不保存密钥。

详细理由记录在 `docs/decisions/` 下的 ADR。

## 任务分解与状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 需求、仓库、环境与 starter pack 审计 | 已完成 |
| 1 | 工程脚手架、设计 tokens、路由与 App Shell | 已实现；Node 构建通过，真实 Tauri 窗口未验证 |
| 2 | Pack/Question/Anchor schema、repository 接口与 in-memory 实现 | 已实现并有 TypeScript 测试 |
| 3 | Rust 工作区初始化、SQLite 迁移、repository、媒体与导入命令 | 源码与 Rust 测试已存在；因 Rust/Cargo 缺失未编译运行 |
| 4 | Onboarding、Library、Import Center v0 | 已实现并有组件测试；真实目录选择/安装仍待桌面验收 |
| 5 | Reading 双 Pane、答案和文字标记共享 | 共享答案、唯一 DOM ID、确定性题号导航和真实页面回归已完成；多 Passage/题段自由选择仍是后续功能 |
| 6 | Listening v0、Writing v0、Review、Settings、AI 占位 | Writing 待保存草稿已覆盖 Task/模式/卸载边界；Listening Exam 生命周期和 Review 题包身份已加固并测试 |
| 7 | 原创 demo pack、前端测试、Rust 测试 | demo 与两端测试源码已存在；18 个文件、88 项 TypeScript 测试通过，Rust 测试未运行 |
| 8 | README、数据格式、安全、测试与 ADR 文档 | 文档主体已存在；本执行计划已按现场恢复并继续更新 |
| 9 | lint/test/build/Tauri build 与手工 QA | lint/test/Vite build 通过；本次浏览器 GUI 冒烟通过，Rust/Tauri 与真实 SQLite 流程被环境阻塞 |

## 当前续作切片

本次断点续作切片已完成：

1. Writing 的 debounce 草稿在切换 Task、切换模式和卸载页面前会串行落盘；失败时保留原任务与文本并允许重试。
2. Library、App Shell、三类练习页和 Review 使用稳定 `packId`/`testId`；显式 Pack 路由加载期间不暴露旧题包，Review 不会使用其他 `activePack` 评分。
3. Session 恢复键包含完整身份并兼容旧键；同身份在途请求去重，不同身份和旧提交均不能覆盖较新的页面 Session；三页恢复失败均显示可重试错误。
4. Reading 两个 Questions Pane 使用窗格级唯一 DOM ID，题号导航可确定滚动/聚焦，真实页面测试覆盖双 Pane 即时同步。
5. Listening Exam 在异步 Session 挂载后可靠重置音频，结束后禁止重播；切入 Exam 前先停止 Study 音频。
6. 已重跑 lint、全部 TypeScript 测试、生产构建与浏览器 GUI 冒烟；Rust/Tauri 继续如实标记为环境阻塞。

## 验证结果

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `Get-Location` | 0 | `C:\Users\Exming\Documents\雅思or算法软件项目` |
| `Get-ChildItem -Force` | 0 | 确认现有 `.git`、`src`、`src-tauri`、`docs`、`samples`、`dist`、`node_modules` 等均存在 |
| `git status --short --branch` | 0 | `No commits yet on master`；全部项目成果未跟踪 |
| `npm run lint` | 0 | 最终全量 ESLint 无警告、无错误 |
| `npm test` | 0 | 最终 Vitest 18/18 个文件、88/88 项测试通过，约 19.95 秒 |
| `npm run build` | 0 | 最终 `tsc --noEmit` 与 Vite 8.2.2 构建通过；1981 modules transformed |
| Playwright CLI 本地 GUI 冒烟 | 0 | `#/practice/reading?packId=original-demo-pack&testId=demo-test-01&mode=study` 可渲染；侧栏身份保留、双 Pane 答案同步；控制台 0 error / 0 warning |
| `npm run tauri -- info` | 0 | CLI 可运行；明确报告 Rust、Cargo、rustup 与 MSVC/SDK Build Tools 缺失，WebView2 可用 |
| `rustc --version` / `cargo --version` | 不可执行 | 命令不存在；属于环境前置条件缺失 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 未运行 | Rust/Cargo 缺失，不宣称通过或失败 |
| `npm run tauri build` | 未运行 | Rust/Cargo/MSVC 链路未就绪，不宣称通过或失败 |

## 已知问题

1. 当前缺少 Rust/Cargo，无法验证 Rust 单元测试、Tauri dev/build、真实目录选择、SQLite 重启恢复和本地媒体 IPC。
2. 当前仓库尚无首个 Git 提交；本轮不会擅自提交、建远程或推送。任何现有文件修改前保留时间戳备份。
3. 本次新增 `output/playwright/recovery-reading-shared-pane-20260902.png`，只证明 Vite renderer 的身份路由和双 Pane 交互，不等同于真实 Tauri 桌面验收；历史 localhost/Vite 断线记录也不能当作离线桌面能力证明。
4. 首次真实桌面手工验收需要安装 Rust stable MSVC、Cargo、Visual Studio C++ Build Tools/Windows SDK，并使用专门的非 C 盘测试工作区，不能指向真实学习数据。
5. 不加入 Cambridge 真题、答案、音频、图片、扫描件或 transcript；所有自动化测试继续使用原创 demo 和人工构造 fixture。

## 完成定义

- TypeScript 编译、lint、单元/组件测试和 Vite 构建实际通过。
- Rust 源码、迁移与测试齐全；环境恢复后实际执行 `cargo fmt`、`cargo clippy`、`cargo test` 与 Tauri build。
- 核心界面存在 loading、empty、error、save 状态，并支持键盘 focus。
- 真实 Tauri 流程验证工作区、SQLite、题包安装、共享 Pane、Listening 媒体和 Writing 重启恢复。
- 文档明确本轮完成项、未完成项、安全边界和可复现命令。
