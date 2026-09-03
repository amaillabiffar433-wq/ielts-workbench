# IELTS Workbench

IELTS Workbench 是一个 Windows 优先、local-first / offline-first 的 IELTS Academic 桌面学习工作台。当前产品范围是 Listening、Reading 与 Writing；界面使用 React + TypeScript，桌面壳与受信任的本地能力使用 Tauri 2 + Rust，用户状态存入其明确选择的工作区中的 SQLite。

> 非官方声明：本项目不是 IELTS、Cambridge、British Council 或 IDP 的官方产品，也不受这些机构认可、赞助或维护。仓库不得包含 Cambridge IELTS 书籍、真题、答案、音频、图片、扫描件或 transcript。示例材料必须完全原创。

## 当前阶段

当前是 Phase 0–1 的桌面纵向切片，目标包括：

- Tauri 标准桌面窗口与自有 App Shell；
- 首次启动选择并初始化本地学习工作区；
- 工作区内的 SQLite 迁移与持久化；
- `IELTSPack v1` schema 与原创 demo pack；
- Library 和安全的 JSON 文件夹导入入口；
- Reading 双 Pane，以及跨 Pane 共享的答案与文字标记；
- Listening 本地音频与基础答题；
- Writing 草稿自动保存、手动版本和提交快照；
- Review、Settings 与禁用状态的 AI Provider 接口；
- TypeScript/React 与 Rust 测试、文档和真实构建记录。

本阶段不做 Speaking、云同步、登录、多用户、爬虫、完整 Cambridge 题库、OCR 全流程、真实 AI 联网、AI 自动改写作文、手写 Canvas 或自定义无边框窗口。

完成状态和已经实际运行的命令以 [执行计划](docs/EXECUTION_PLAN.md) 为准。页面或源码文件存在不等于相应流程已经通过桌面端验收。

## 技术架构

```text
React / TypeScript UI
        │ repository/service interfaces
        ├─────────────── in-memory implementation（单元测试与 renderer 开发）
        │
        └─ Tauri invoke（Zod + Rust DTO 双边校验）
                         │
                         ├─ workspace/path boundary
                         ├─ SQLite migrations/repositories
                         ├─ pack installation
                         └─ local media access
```

核心边界：

- 题包是安装后只读的源数据；答案、标记、Session、草稿和版本是 SQLite 中的可变用户数据。
- Rust 拥有工作区、路径校验、数据库、媒体和未来网络/密钥能力。React 组件不得直接访问 SQL 或任意文件路径。
- Reading 两个 Pane 只保存选择内容、滚动位置、宽度和焦点等视图状态。答案的身份是 `sessionId + questionId`；标记锚定稳定 `blockId`，不锚定 Pane、DOM 节点或像素。
- 核心练习默认不联网。Exam 模式不显示 AI、答案、transcript 或被禁止的播放控制。

架构理由见 [ADR](docs/decisions/)，数据契约见 [DATA_FORMAT.md](docs/DATA_FORMAT.md)，安全边界见 [SECURITY.md](docs/SECURITY.md)。

## Windows 开发环境

需要：

- Node.js 与 npm；
- Rust stable MSVC toolchain（`rustc`、`cargo`）；
- Visual Studio 2022 Build Tools 的“使用 C++ 的桌面开发”工作负载，以及匹配的 Windows SDK；
- Microsoft Edge WebView2 Runtime；
- Git。

2026-09-01 的当前机器检查结果：Node.js `v24.14.0`、npm `11.9.0`、Git `2.54.0.windows.1` 与 WebView2 `151.0.4129.107` 可用；`rustc`/`cargo` 不在 PATH，且未检测到可用的 MSVC C++ toolchain。因此当前环境不能验证 Rust 测试、`tauri dev` 或 Tauri 安装包。此处是环境事实，不是构建成功声明。

不要为本项目更改全局 npm/Rust 配置，也不要未经用户许可自动安装系统级依赖。补齐工具链后可检查：

```powershell
rustc --version
cargo --version
```

## 安装、开发与构建

在仓库根目录执行：

```powershell
npm install
npm run lint
npm test
npm run build
```

安装 Rust/MSVC 前置条件后，再执行真实桌面流程：

```powershell
npm run tauri dev
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

`npm run dev` 仅启动 renderer 的 Vite 开发入口，便于前端开发；它不是最终产品形态，也不能替代工作区、SQLite、媒体权限与桌面打包验收。每次交付都必须报告命令、退出码与真实结果，不得使用“理论上通过”。

## 数据工作区

首次启动由用户明确选择学习工作区，例如 `D:\IELTS-Workbench-Data`。应用不得把主数据库、题包或媒体静默放入 AppData；AppData 最多保存很小的 bootstrap 信息，例如上次选择的工作区路径。

```text
IELTS-Workbench-Data/
├─ workspace.json
├─ ielts-workbench.sqlite3
├─ packs/
├─ imports/
├─ themes/
├─ backups/
└─ logs/
```

工作区可以位于任意由用户明确选择且可写的位置。应用必须规范化路径、拒绝 `..`/绝对子路径/符号链接越界，并只在工作区或用户本次明确选择的导入源内读写。

## `IELTSPack v1`

题包是一个离线文件夹：

```text
<pack-id>/
├─ manifest.json
├─ modules/
│  ├─ reading.json
│  ├─ listening.json
│  └─ writing.json
└─ media/
   ├─ audio/
   └─ images/
```

所有 Pack、Test、Module、Section、ContentBlock、QuestionGroup、Question 与 MediaAsset 使用稳定 ID。外部 JSON 在预览和安装时均需校验；安装必须重新校验，遇到重复 ID 不覆盖原题包。完整 schema、交叉引用规则、TextAnchor 和 SQLite 表结构见 [DATA_FORMAT.md](docs/DATA_FORMAT.md)。

固定文件名的 v1 明确限定为每个 Pack 一个 Test、每种类型最多一个 Module；多 Test 将通过后续 schema 版本和显式文件映射引入，避免当前 UI/文件解析产生歧义。

## 项目结构

```text
src/                 React/TypeScript：app、domain、features、repositories、stores、tests
src-tauri/           Tauri/Rust：commands、workspace、security、SQLite migrations
samples/             完全原创的 `IELTSPack v1` demo
docs/                 执行计划、数据、安全、测试与 ADR
AGENTS.md             仓库级工作规则
PROJECT_SPEC.md       产品与技术规格
REFERENCE_AUDIT.md    仅供行为参考的候选项目审计
```

## 版权与隐私边界

- 不提交、不分发、不抓取、不热链任何受版权保护的考试内容。
- 没有明确许可证的参考仓库只可用于理解产品行为；不得复制代码、资源或派生实现。
- 用户只能导入自己合法持有并有权使用的本地材料。
- 应用默认不联网，不自动上传题包、作文或选择文本，不包含遥测和广告。
- API Key 未来只能由 Rust 侧通过操作系统安全凭据存储管理，不能进入 renderer、localStorage、日志、Git 或普通 SQLite 明文字段。

## 文档索引

- [执行计划与真实验证状态](docs/EXECUTION_PLAN.md)
- [题包、用户状态与 SQLite 格式](docs/DATA_FORMAT.md)
- [安全与隐私模型](docs/SECURITY.md)
- [测试与手工验收](docs/TESTING.md)
- [ADR 0001：采用 Tauri 2](docs/decisions/0001-use-tauri-2.md)
- [ADR 0002：题包与用户状态分离](docs/decisions/0002-separate-pack-and-user-state.md)
- [ADR 0003：主数据库位于用户工作区](docs/decisions/0003-workspace-owned-database.md)
- [ADR 0004：IELTSPack v1 单 Test 约束](docs/decisions/0004-limit-ieltspack-v1-to-one-test.md)
