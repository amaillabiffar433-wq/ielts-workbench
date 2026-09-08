# IELTS Workbench 执行计划

更新日期：2026-09-08（Reading PDF 人工结构化导入开发中）

## 当前执行切片：Reading PDF 人工确认式多 Passage / 多题组结构化导入

恢复基准为 `D:\Projects\雅思or算法软件项目`、分支 `feat/pdf-import-mvp`、起始 HEAD `174d89266bef4f4816fd075b3614709fb87325d6`；恢复时工作树干净。本轮在现有 Import Center、IELTSPack v1 和 Repository 架构上增量扩展，不做 OCR、样本特判或复杂版面自动识别，也不改变已完成的 Reading 练习页。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| SI1 | 复核 PDF 适配器、题包 schema、Repository/SQLite/IPC、关闭保存与现有测试边界 | 已完成：确认现有 MVP 仅生成单 Section/单题组，草稿只存在于 React 内存，稳定领域 ID 到最终构建时才生成 |
| SI2 | 建立带来源快照与一次生成稳定 ID 的结构化草稿模型，实现片段分配、Passage/题组/题目编辑及校验/预览 | 已完成：支持任意 Passage、显式题组/题目成员、同页拆分/跨页合并、重排/移动、阻塞错误与警告；不支持题型必须人工改为现有类型 |
| SI3 | 通过现有 Repository 增加 SQLite 草稿持久化、恢复、SHA-256 重选核验、明确丢弃与安装失败保留 | 已完成：结构化草稿经 Repository settings 写入工作区 SQLite；关闭前刷新、恢复不预写默认值、重选 SHA 核验、显式丢弃和安装失败保留均已接入 |
| SI4 | 将结构化流程接入现有 PDF 导入页，同时保留简单单 Passage 路径；补齐至少 10 类自动化测试 | 已完成：简单路径保留；新增 18 个模型测试和 2 个页面流程测试，覆盖稳定 ID、编辑/移动、来源恢复、答案映射、阻塞校验、草稿持久化及失败保留 |
| SI5 | 生成原创多页文本层 PDF、生成脚本和预期结构，走正常导入链路完成桌面验收 | 进行中：7 页原创文本层 PDF 含 3 Passage、每篇 2 题组、Q18 位于 Passage 3；逐页渲染检查与浏览器正常导入链路已通过，原生 Release 验收待完成 |
| SI6 | 连续两次前端测试，并执行 lint、Vite build、Cargo test | 已完成：前端连续两次 28 文件、163/163；lint、2004-module Vite build、Cargo 26/26 通过 |
| SI7 | 单文件备份旧 EXE，构建并独立启动新 Release；在全新 D 盘工作区完成退出/重启恢复证据 | 待开始 |
| SI8 | 增量更新状态/工作日志/桌面验收/导入文档并建立小型本地提交 | 进行中：实现、测试与浏览器链路证据已回写；待补 Release 原生证据与最终提交 |

发布边界：沿用当前版本，仅生成本地 Windows Release EXE；不生成或安装 MSI/NSIS，不创建 tag/GitHub Release，不推送远程，不删除旧 Release、数据库、题包或验收资料。

## 已完成切片：Reading 按稳定 questionGroupId 选择题组

恢复基准为 `D:\Projects\雅思or算法软件项目`、分支 `feat/pdf-import-mvp`、起始 HEAD `a19e22358c3e6ce9dcb45dadcb39d91e003a6f2f`；恢复时工作树干净。本轮仅在现有 Reading 题目模式中增加题组选择，不改变题包 schema、答案/标记身份、评分范围或 PDF 解析能力。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| G1 | 读取规则、领域 schema、题组模型、Pane 状态及持久化实现，确认稳定 ID 与兼容性边界 | 已完成：IELTSPack v1 的前端与 Rust 校验均要求稳定且全局唯一的 `questionGroupId`；不存在合法但缺失该 ID 的 v1 题组 |
| G2 | 以 `questionGroupId` 增量实现题组筛选、紧凑下拉、双 Pane 独立选择与安全状态恢复 | 已完成：筛选和持久化均保存稳定题组 ID；失效 ID 保持题组模式并回退至首个有效题组 |
| G3 | 补齐非连续题号、同 Passage 多题组、双 Pane 同步、无效 ID 回退及旧模式回归测试 | 已完成：新增 8 项测试，覆盖 ID 精确筛选、非连续题号、旧 v1 状态/单 Passage 题包和双 Pane 同步 |
| G4 | 连续两次前端测试，并执行 lint、Vite build 与 Cargo test | 已完成：两次前端回归均为 27 文件、143/143；lint、2002-module Vite build、Cargo 26/26 通过 |
| G5 | 备份当前 EXE，生成不含安装包的新 Release，在独立 D 盘工作区完成原生退出/重启验收 | 已完成：新 EXE 在 1420 关闭时独立启动；稳定题组、双 Pane 答案同步、SQLite 和一次退出/重启恢复通过 |
| G6 | 回写 CURRENT_STATE、WORK_LOG、DESKTOP_ACCEPTANCE 与 Reading 验收记录，建立小型本地提交 | 已完成：功能提交 `1b141d8`；最终验收证据已回写四份状态文档，未 push、未打 tag |

发布边界：本轮沿用 `0.1.0`，只生成和启动本地 Windows Release EXE；不生成或安装 MSI/NSIS，不创建 changelog/tag/GitHub Release，不推送远程，也不清理旧 Release、数据库或验收资料。

## 已完成切片：Reading 多 Passage、题段与单题选择

恢复基准为 `D:\Projects\雅思or算法软件项目`、分支 `feat/pdf-import-mvp`、起始 HEAD `f7fd42af1584714f1b681f1662ce01a4f799b76e`；恢复时工作树干净。现有题包、SQLite、原创 PDF/音频/图表及上一版 Release 均只读保护，不重新迁移、不删除 C 盘副本、不推送远程。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| MP1 | 读取规则与真实实现，确认 Reading Section、题组、题目、答案、标记和设置持久化边界 | 已完成：确认旧页面只渲染 `sections[0]`，题目则跨全部 Section 展开；答案和标记已使用稳定领域 ID |
| MP2 | 实现 Passage/题目范围选择、稳定题号、题组上下文、整套正确配对及 Pane 独立状态 | 已完成：Pane 状态按 Session 写入现有 settings；题号/ID 分离，导航 DOM ID 按 Pane 区分 |
| MP3 | 新增可经正常安装链路使用的原创三 Passage样本，并补齐要求的自动化测试 | 已完成：`original-multi-passage-pack` 含 3 个 Passage、Question 1–21，Q14–20 跨 Passage，Q18 位于 Passage 3 |
| MP4 | 连续两次标准前端测试、lint、Vite build 和 Cargo test 回归 | 已完成：最终两次 `npm test` 均为 27 文件、135/135；lint、2002-module Vite build、Cargo 26/26 均通过 |
| MP5 | 备份上一版 EXE，构建新 Release，并在新 D 盘工作区完成原生退出/恢复验收 | 已完成：旧 EXE 单文件备份并核验 SHA-256；新 EXE 在 1420 关闭时独立启动，三 Passage、SQLite 与一次完整重启恢复通过 |
| MP6 | 更新 CURRENT_STATE、WORK_LOG、DESKTOP_ACCEPTANCE、READING_AUDIT 并建立小型本地提交 | 已完成：功能源码提交 `91c7e77`；验收文档与最终提交按当前 Git 历史为准 |

发布边界：本轮“Release”指生成并启动本地 Windows 可执行文件；按用户明确要求不做版本号提升、changelog/tag、远程推送或 GitHub Release，也不重复构建或安装 MSI/NSIS。

## 已完成切片：稳定性修复与 Windows 桌面验收

当前仓库为 `D:\Projects\雅思or算法软件项目`，分支 `feat/pdf-import-mvp`，本轮起始 HEAD `a2b43d8f9352f4eae3bc70dcf5dc465c758ae985`。C 盘原副本暂时保留，未经用户确认不删除。

历史桌面验收链路源码提交为 `88e84ab`；本轮稳定性与 Release 源码提交为 `23527b6`。最终文档提交与当前 HEAD 以 `git log -3 --oneline` 为准。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| M1 | 复制到 D 盘并核验 Git、文件数量、字节数和逐文件 SHA-256 | 已完成：662 个文件、3,838,842 字节、差异 0 |
| M2 | 在 D 盘重建依赖和构建产物，验证 Git 与数据完整性 | 已完成：锁文件安装、前端构建及数据哈希均通过 |
| S1 | 复现并修复标准 `npm test` 的默认失败 | 已完成核验：D 盘干净安装后旧超时未复现，未修改测试或超时设置 |
| S2 | 标准 `npm test` 完整连续通过三次，同时 lint/build 通过 | 已完成：最终三次均为 23/23、114/114；lint/build 退出码 0 |
| N1 | 安装并复核 Rust、MSVC、Windows SDK、WebView2 | 已完成：D 盘 Rust minimal + Build Tools；SDK 26100 与 WebView2 可用 |
| N2 | 补齐并实际编译原生 Repository/PDF/媒体/图片链路 | 已完成：`cargo check` 通过，`cargo test` 24/24；首次编译问题已最小修复 |
| A1 | Rust、Tauri dev、SQLite 和两轮重启验收 | 已完成：独立 D 盘工作区、原生 PDF、Reading/Listening/Writing、快速关窗及两轮重启均通过 |
| R1 | Release 构建、独立启动和安装包产物核验 | 已完成：标准 Tauri build 退出码 0；EXE/MSI/NSIS 均生成，Release 独立启动和 SQLite 恢复通过；未安装 |

该历史切片当时规划的下一步即本页上方 Reading 多 Passage 切片，现已完成。

状态和当前结论以 `docs/CURRENT_STATE.md` 为准；逐次执行记录追加到 `docs/WORK_LOG.md`；原生验收逐项记录在 `docs/DESKTOP_ACCEPTANCE.md`。

## 历史执行切片：Reading PDF 辅助导入 MVP（2026-09-03）

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

历史恢复现场在 2026-09-02 曾是 unborn `master`（0 commit），当时全部项目文件未跟踪，普通 `git log`/`git diff` 无法提供历史基线。该描述只适用于当时现场。当前已经存在基线提交 `bdf9ac7` 和功能提交 `dbfe98a`，不能再把 “unborn master” 作为当前结论。

文件时间线显示：最后一批 Rust 题包实现修改于 2026-09-02 09:33，`dist/` 于 09:34 重新生成。因此断点位于 Phase 0–1 收尾验证与文档回写，而不是工程初始化。恢复前旧计划已原样备份到 `output/recovery-backup-20260902-095231/docs/EXECUTION_PLAN.md`。

## 当前环境

| 项目 | 检查结果 | 状态 |
| --- | --- | --- |
| 操作系统 | Windows，PowerShell | 可用 |
| Git | `2.54.0.windows.1`；基线 `bdf9ac7`，当前 `feat/pdf-import-mvp` | 可用；本轮功能提交完成且未推送 |
| Node.js | `v24.14.0` | 可用 |
| npm | `11.9.0` | 可用 |
| Tauri CLI | `tauri-cli 2.11.4` | CLI 包存在 |
| Rust / Cargo | `rustc 1.98.1`、`cargo 1.98.1`，stable `x86_64-pc-windows-msvc` minimal；home 均在 D 盘 | 可用 |
| Microsoft C++ Build Tools | Build Tools 2022 `17.14.39` 位于 `D:\DevTools\VSBuildTools`；MSVC 14.44 + Windows SDK 10.0.26100.0 | 可用 |
| WebView2 Runtime | `152.0.4191.62` | `tauri info` 与注册表均已检测 |

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
| 7 | 原创 demo pack、前端测试、Rust 测试 | PDF/音频/图表均为原创；23 个文件、114 项 TypeScript 测试连续三次通过，Rust 测试未运行 |
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
| `Get-Location` | 0 | 当前工作目录已切换为 `D:\Projects\雅思or算法软件项目`；C 盘路径仅保留为待确认删除的原副本 |
| `Get-ChildItem -Force` | 0 | D 盘确认 `.git`、`src`、`src-tauri`、`docs`、`samples` 等均存在；依赖和 `dist` 已在 D 盘重新生成 |
| `git status --short --branch` | 0 | 2026-09-05 迁移完成时为干净的 `feat/pdf-import-mvp`，HEAD `dbfe98a`；旧的 `No commits yet on master` 仅是 2026-09-02 历史现场 |
| `npm run lint` | 0 | 最终全量 ESLint 无警告、无错误 |
| `npm test`（D 盘最终标准命令，连续三次） | 0 | 三次均为 23/23 文件、114/114 项通过，总时长 19.36 秒、18.82 秒、20.11 秒；未调整超时、重试或测试选择 |
| `npm run build`（D 盘最终） | 0 | `tsc --noEmit` 与 Vite 8.2.2 构建通过；1991 modules transformed；PDF worker 已输出，仅有既知的 >500 kB chunk 提示 |
| `pdfinfo` / `pdftotext` / `pdftoppm` / `pypdf` / `pdfplumber` | 0 | 原创 3 页样本未加密、有文本层；三页均提取并渲染，逐页目视无截断或不可读字符 |
| Playwright CLI 本地 GUI 冒烟 | 0 | 原创 PDF 载入、单页预览、页 1/2/3 提取、4 题整理/答案、导入、Reading 打开、双 Pane 答案/标记同步、明确刷新恢复和原 demo 回归均通过；控制台 0 error / 0 warning |
| `npm run tauri -- info` | 0 | CLI 可运行；明确报告 Rust、Cargo、rustup 与 MSVC/SDK Build Tools 缺失，WebView2 152.0.4191.62 可用 |
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
