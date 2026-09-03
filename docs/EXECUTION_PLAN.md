# IELTS Workbench 第一轮执行计划

更新日期：2026-09-03（继续按仓库现场恢复；启动 Reading PDF 辅助导入 MVP）

## 当前执行切片：Reading PDF 辅助导入 MVP

本切片在现有 React/Tauri 架构和已完成页面之上增量实施，不重新初始化工程，也不重做 Reading、Library 或 Import Center。自动化测试仅使用原创/人工构造内容；来自个人网盘的 PDF 只允许进入被 Git 忽略的 `local-data/import-samples/`，不得上传、移动、重命名或提交。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| A | 复核仓库、Git、时间线、文档与现有导入边界；重跑 lint/test/build | 已完成：18 个测试文件、88 项测试、生产构建均通过 |
| B | 强化 `.gitignore`，建立首次稳定前端基线提交，并创建 `feat/pdf-import-mvp` 分支 | 已完成：基线 `bdf9ac7`，功能分支已创建 |
| C | 只读检索并下载至多 1–2 个个人网盘 PDF；验证加密、文本层和页面提取 | 网盘连接器实际仅暴露上传，无搜索/列表/下载能力；未改变网盘。改用被忽略的 3 页原创 PDF 验收解析链 |
| D | 增量实现 PDF 文件输入、逐页文本预览、页码范围、半自动分段、人工校正和答案键解析 | 已实现；支持 TFNG、单项选择、简答/填空与通用回退 |
| E | 通过现有 repository/IELTSPack/Library/Reading 链路保存、重开和练习；补足测试与文档 | 已完成；浏览器刷新后题包、答案和文字标记均恢复 |
| F | 复核 Windows Rust/Tauri 前置条件，执行最终 lint/test/build 与浏览器冒烟并提交功能 | 已完成；Rust/MSVC/SDK 缺失已确认，功能提交使用规定信息且未推送 |

安全边界：不做 OCR；不把 PDF 原文写入测试夹具或 Git；不在 renderer 的 `localStorage` 保存学习内容；不新增 Web 服务、账户系统或数据库旁路。桌面文件系统与 SQLite 仍由 Rust/Tauri adapter 负责，Web/Vite 仅提供可测试的本地内存适配器。

## 恢复结论

本文件在恢复前仍停留在 2026-09-01 的“脚手架进行中”，但当前目录已经包含 React/Tauri 工程、领域 schema、repository、SQLite 迁移、工作区与题包 Rust 实现、原创 demo、各功能页面和测试。恢复时没有重新初始化脚手架，也没有删除、重置或覆盖现有成果。

由于仓库仍是 unborn `master`（0 commit），全部项目文件都是 untracked，普通 `git log`/`git diff` 无法提供上一轮基线。只读取证进一步确认 `.git/refs/codex/turn-diffs` 中存在 2026-09-02 09:48 的自动树快照；该快照的 186 个文件与恢复开始时工作区逐 blob 一致。进度判断同时依据文件内容、修改时间、现有 Playwright 记录和本次重新执行的构建结果。

文件时间线显示：最后一批 Rust 题包实现修改于 2026-09-02 09:33，`dist/` 于 09:34 重新生成。因此断点位于 Phase 0–1 收尾验证与文档回写，而不是工程初始化。恢复前旧计划已原样备份到 `output/recovery-backup-20260902-095231/docs/EXECUTION_PLAN.md`。

## 当前环境

| 项目 | 检查结果 | 状态 |
| --- | --- | --- |
| 操作系统 | Windows，PowerShell | 可用 |
| Git | `2.54.0.windows.1`；基线 `bdf9ac7`，当前 `feat/pdf-import-mvp` | 可用；本轮功能提交完成且未推送 |
| Node.js | `v24.14.0` | 可用 |
| npm | `11.9.0` | 可用 |
| Tauri CLI | `tauri-cli 2.11.4` | CLI 包存在 |
| Rust / Cargo | 不在 PATH，默认 `%USERPROFILE%\.cargo\bin` 也不存在 | 阻塞 Rust 编译与测试 |
| Microsoft C++ Build Tools | `tauri info` 未检测到含 MSVC/Windows SDK 的 Visual Studio 或 Build Tools | 阻塞 Windows Tauri 打包验收 |
| WebView2 Runtime | `152.0.4191.53` | `tauri info` 已检测 |

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
| 2 | Pack/Question/Anchor schema、repository 接口与 in-memory 实现 | 已实现并有 TypeScript 测试；v1 已向后兼容扩展 PDF 来源字段和无答案键状态 |
| 3 | Rust 工作区初始化、SQLite 迁移、repository、媒体与导入命令 | 已增加生成题包暂存/校验/安装命令；因 Rust/Cargo 缺失未编译运行 |
| 4 | Onboarding、Library、Import Center 与 PDF 导入入口 | 已实现并有组件测试；真实目录选择/安装仍待桌面验收 |
| 5 | Reading 双 Pane、答案和文字标记共享 | 共享答案、唯一 DOM ID、确定性题号导航和真实页面回归已完成；多 Passage/题段自由选择仍是后续功能 |
| 6 | Listening v0、Writing v0、Review、Settings、AI 占位 | Writing 待保存草稿已覆盖 Task/模式/卸载边界；Listening Exam 生命周期和 Review 题包身份已加固并测试 |
| 7 | 原创 demo pack、前端测试、Rust 测试 | PDF 测试均为原创/人工构造；21 个文件、106 项 TypeScript 测试通过，Rust 测试未运行 |
| 8 | README、数据格式、安全、测试与 ADR 文档 | 已补充 PDF 导入和 Windows Tauri 环境文档，并回写最终 Node 验证结果 |
| 9 | lint/test/build/Tauri build 与手工 QA | PDF 结构/文本/逐页渲染、浏览器完整闭环和最终 Node 命令已通过；Rust/Tauri 被环境阻塞 |

## 当前续作切片

本次 Reading PDF MVP 已完成的源码工作：

1. Import Center 增加独立的 `#/import/pdf` 分步向导，支持文件选择/拖放、按需单页预览、文本层显示和 1-based 页码范围。
2. `pdfjs-dist` 浏览器适配器负责本地 `File`/ArrayBuffer、worker、单页渲染和按页提取；业务解析不依赖 `window`、浏览器 File API 或 Tauri API。
3. 半自动解析保留 Passage 标题/正文、题号、提示、选项、原始文本、来源页和来源块；无法可靠识别的题型回退到可作答文本并标记人工复核。
4. Answer Key 可按题号粘贴应用；无标准答案时 Review 显示“待核对”，不会误判为错误。
5. 导入元数据记录 SHA-256、大小、页码和解析器版本；同一指纹/页码/Passage 的重复导入会被阻止。
6. Browser repository 使用 IndexedDB 保存导入题包和学习状态；Tauri repository 调用 Rust `install_generated_pack`，后者只在工作区内暂存并复用既有校验/安装链。
7. 原创 `original-reading-pdf-mvp.pdf` 为 4,497 bytes、3 页、未加密且有文本层；SHA-256 为 `2CD82AB886E160F4F64996484FE621860AFEEE774B366353902DB936706ABA48`。源 PDF 与渲染产物均被 Git 忽略。

## 验证结果

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `Get-Location` | 0 | `C:\Users\Exming\Documents\雅思or算法软件项目` |
| `Get-ChildItem -Force` | 0 | 确认现有 `.git`、`src`、`src-tauri`、`docs`、`samples`、`dist`、`node_modules` 等均存在 |
| `git status --short --branch` | 0 | `No commits yet on master`；全部项目成果未跟踪 |
| `npm run lint` | 0 | 最终全量 ESLint 无警告、无错误 |
| `npm test` | 0 | 最终 Vitest 21/21 个文件、106/106 项测试通过，约 13.84 秒 |
| `npm run build` | 0 | 最终 `tsc --noEmit` 与 Vite 8.2.2 构建通过；1989 modules transformed；仅有既知的 >500 kB chunk 提示 |
| `pdfinfo` / `pdftotext` / `pdftoppm` / `pypdf` / `pdfplumber` | 0 | 原创 3 页样本未加密、有文本层；三页均提取并渲染，逐页目视无截断或不可读字符 |
| Playwright CLI 本地 GUI 冒烟 | 0 | 原创 PDF 载入、单页预览、页 1/2/3 提取、4 题整理/答案、导入、Reading 打开、双 Pane 答案/标记同步、明确刷新恢复和原 demo 回归均通过；控制台 0 error / 0 warning |
| `npm run tauri -- info` | 0 | CLI 可运行；明确报告 Rust、Cargo、rustup 与 MSVC/SDK Build Tools 缺失，WebView2 可用 |
| `rustc --version` / `cargo --version` | 不可执行 | 命令不存在；属于环境前置条件缺失 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 未运行 | Rust/Cargo 缺失，不宣称通过或失败 |
| `npm run tauri build` | 未运行 | Rust/Cargo/MSVC 链路未就绪，不宣称通过或失败 |

## 已知问题

1. 当前缺少 Rust/Cargo，无法验证 Rust 单元测试、Tauri dev/build、真实目录选择、SQLite 重启恢复和本地媒体 IPC。
2. 首个 Git 基线提交已建立为 `bdf9ac7`，当前功能位于 `feat/pdf-import-mvp`；本轮不建远程、不推送。
3. 本次新增的 `output/playwright/pdf-import-reading-restored-20260903.png` 只证明 Vite renderer 的导入、IndexedDB 恢复和双 Pane 交互，不等同于真实 Tauri 桌面验收；该输出目录被 Git 忽略。
4. 首次真实桌面手工验收需要安装 Rust stable MSVC、Cargo、Visual Studio C++ Build Tools/Windows SDK，并使用专门的非 C 盘测试工作区，不能指向真实学习数据。
5. 不加入 Cambridge 真题、答案、音频、图片、扫描件或 transcript；所有自动化测试继续使用原创 demo 和人工构造 fixture。

## 完成定义

- TypeScript 编译、lint、单元/组件测试和 Vite 构建实际通过。
- Rust 源码、迁移与测试齐全；环境恢复后实际执行 `cargo fmt`、`cargo clippy`、`cargo test` 与 Tauri build。
- 核心界面存在 loading、empty、error、save 状态，并支持键盘 focus。
- 真实 Tauri 流程验证工作区、SQLite、题包安装、共享 Pane、Listening 媒体和 Writing 重启恢复。
- 文档明确本轮完成项、未完成项、安全边界和可复现命令。
