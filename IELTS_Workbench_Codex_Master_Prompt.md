# 交给 Codex 的第一轮主提示词

你是这个项目的首席桌面端架构师、全栈实现者和测试负责人。请在**当前目录**开始实现项目，不要只输出方案。

项目暂定名：`IELTS Workbench`。

目标是构建一个 Windows 优先、以后可扩展到 macOS 的本地桌面 GUI 应用。它当前只服务 IELTS Academic 的 Listening、Reading、Writing，未来可能扩展算法学习，但本轮不要为了未来进行过度抽象。

---

## 0. 开始前必须执行

1. 先检查当前目录已有内容；不要删除、覆盖或重置任何不属于你本轮创建的文件。
2. 读取根目录中的：
   - `AGENTS.md`
   - `PROJECT_SPEC.md`
   - `REFERENCE_AUDIT.md`
3. 检查开发环境并记录结果：

```powershell
node --version
npm --version
rustc --version
cargo --version
git --version
```

4. Windows 下还要检查 Tauri 所需的 Microsoft C++ Build Tools 与 WebView2 是否可用。不要未经许可擅自安装系统级依赖；缺少时：
   - 明确记录缺失项；
   - 继续完成仍可完成的源码、测试和文档；
   - 给出用户可执行的安装步骤。
5. 如果当前目录不是 Git 仓库，则初始化 Git；不要 push 到远端。
6. 创建并持续维护 `docs/EXECUTION_PLAN.md`，至少包含：
   - 当前环境；
   - 架构决策；
   - 任务分解；
   - 完成状态；
   - 验证结果；
   - 已知问题。
7. 不要等待我逐个确认普通实现细节。遇到非关键分歧时选择合理默认值，并把理由写入 `docs/decisions/` 下的 ADR。

---

## 1. 不可违背的产品约束

### 1.1 它必须是桌面应用

使用：

- Tauri 2；
- React；
- TypeScript；
- Vite；
- Windows 优先；
- 使用系统 WebView 渲染应用内部 GUI；
- 产物应能构建为独立桌面可执行程序，不要求用户打开浏览器，不运行 Spring Boot/MySQL/Web 服务器。

第一版保留 Windows 标准窗口标题栏，不要现在自制无边框标题栏。应用内部界面必须有自己的 App Shell、侧边栏、工具栏、双窗格和设置页，而不是把远程网页嵌入 WebView。

### 1.2 Local-first / Offline-first

除未来用户主动使用 AI 外，核心功能必须完全离线：

- 浏览本地题包；
- 做题；
- 音频播放；
- 作文；
- 标记；
- 自动保存；
- 历史记录；
- 复盘。

第一版不做：

- 注册登录；
- 云端账户；
- Spring Boot；
- MySQL；
- 在线题库；
- 远程内容抓取；
- 自动上传用户文件；
- 遥测与广告。

### 1.3 版权与代码来源

- 不把 Cambridge IELTS 真题、音频、图片、答案或扫描件加入仓库、示例数据或构建产物。
- 不实现对盗版网站的抓取、代理或热链。
- 示例题包必须由你原创，文本、问题、音频和图片都不得复制真实 IELTS/Cambridge 内容。
- `REFERENCE_AUDIT.md` 中的候选仓库目前没有得到可依赖的明确开源许可证确认。不得 clone 后直接修改、不得复制源代码或资源。只可把它们当作产品行为参考，独立实现本项目。
- 在 README 中写明本项目并非 IELTS、Cambridge、British Council 或 IDP 官方产品。

### 1.4 数据不应被锁在 C 盘

用户习惯把项目和大文件放在非 C 盘。第一次启动时必须让用户选择一个**学习工作区目录**，例如：

```text
D:\IELTS-Workbench-Data
```

大文件和用户核心数据放入该目录。允许系统 AppData 中只保留非常小的 bootstrap 配置，例如“上次选择的工作区路径”，但不得把题库、音频、图片和主数据库偷偷存到 C 盘。

目标工作区结构：

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

SQLite 必须能够打开用户所选工作区中的数据库文件。优先在 Rust 侧使用 `rusqlite`（或同等级、可解释的本地 SQLite 方案）实现 `StorageService` 和迁移，不要因为方便而把主数据库强制放到 Tauri AppConfig。

---

## 2. 技术栈和依赖原则

推荐基础栈：

- Tauri 2
- React + TypeScript + Vite
- React Router
- Zustand
- Zod
- `react-resizable-panels`
- Lucide React
- CSS Modules 或按功能拆分的普通 CSS
- Vitest + Testing Library
- Rust：Tauri Commands + `rusqlite`
- Tauri 官方 dialog/fs/path 等必要插件

约束：

1. 使用当前环境已有的 npm；不要为了本项目全局安装 pnpm/yarn，也不要擅自改用户全局 npm 配置。
2. 使用当前可用的稳定版本，并提交 lockfile。
3. 不引入大型 UI 框架来替代核心设计。可使用无样式/轻量可访问性 primitives，但视觉应由本项目的 design tokens 控制。
4. 不要把所有业务塞进一个 `App.tsx` 或一个超大 `PracticePage`。
5. 前端只能通过明确的 repository/service 接口访问持久化，不允许组件到处直接调用 SQL/Tauri command。
6. 所有 IPC command 的输入在 Rust 与前端边界处校验。
7. 默认 CSP 不允许任意远程脚本、远程页面或不受控 URL。
8. Tauri capability/permission 采用最小授权。
9. 所有外部文件路径必须规范化并验证，防止越过工作区读取或写入。
10. API Key 未来不得进入 React 源码、localStorage、日志或普通 SQLite 明文字段。

---

## 3. 建议目录结构

可以根据脚手架略作调整，但必须保持功能分层：

```text
.
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ router.tsx
│  │  └─ AppShell/
│  ├─ components/
│  │  ├─ SplitWorkspace/
│  │  ├─ TextDocument/
│  │  ├─ QuestionRenderer/
│  │  └─ common/
│  ├─ domain/
│  │  ├─ pack/
│  │  ├─ session/
│  │  ├─ annotation/
│  │  ├─ writing/
│  │  └─ ai/
│  ├─ features/
│  │  ├─ onboarding/
│  │  ├─ library/
│  │  ├─ import-center/
│  │  ├─ practice/
│  │  │  ├─ reading/
│  │  │  ├─ listening/
│  │  │  └─ writing/
│  │  ├─ review/
│  │  ├─ vocabulary/
│  │  └─ settings/
│  ├─ infrastructure/
│  │  ├─ repositories/
│  │  ├─ tauri/
│  │  └─ storage/
│  ├─ stores/
│  ├─ styles/
│  ├─ test/
│  └─ types/
├─ src-tauri/
│  ├─ src/
│  │  ├─ commands/
│  │  ├─ storage/
│  │  ├─ workspace/
│  │  ├─ security/
│  │  ├─ lib.rs
│  │  └─ main.rs
│  └─ migrations/
├─ samples/
│  └─ original-demo-pack/
├─ docs/
│  ├─ EXECUTION_PLAN.md
│  ├─ DATA_FORMAT.md
│  ├─ SECURITY.md
│  ├─ TESTING.md
│  └─ decisions/
├─ AGENTS.md
├─ PROJECT_SPEC.md
└─ README.md
```

不要机械追求文件数量；关键是领域、UI 和基础设施边界清楚。

---

## 4. 数据设计：题包与用户状态必须分离

### 4.1 不可变题包

定义并用 Zod 校验 `IELTSPack v1`。建议结构：

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

`manifest.json` 至少包含：

```ts
type PackManifest = {
  schemaVersion: 1;
  id: string;
  title: string;
  sourceLabel: string;
  edition?: string;
  language: "en";
  modules: Array<"reading" | "listening" | "writing">;
  createdAt: string;
  attribution?: string;
};
```

核心要求：

- Pack、Test、Module、Section、ContentBlock、QuestionGroup、Question、MediaAsset 都使用稳定 ID。
- 题目用 discriminated union，不要只用一个含大量可选字段的万能对象。
- 第一版支持至少：
  - single-choice；
  - true-false-not-given；
  - short-answer / fill-blank。
- 数据格式预留其他 IELTS 题型，但不要本轮实现全部。
- `speaking` 可以只留在远期枚举/文档中，不实现 UI。
- 创建一个完全原创的 demo pack，用来验证 Reading、Listening、Writing。
- 为 demo listening 生成几秒钟的原创测试音频或静音 WAV，只用于验证本地媒体加载；不得复制任何现有考试音频。

### 4.2 用户状态 SQLite

在工作区中的 `ielts-workbench.sqlite3` 保存用户数据，而不是修改题包。

至少设计迁移和 repository：

- `schema_migrations`
- `app_settings`
- `installed_packs`
- `practice_sessions`
- `answers`
- `annotations`
- `writing_drafts`
- `writing_versions`
- `vocabulary_items`
- `ai_runs`

建议关键约束：

- UUID 或同等稳定字符串 ID；
- 外键开启；
- 时间统一 ISO 8601/UTC；
- `answers` 对 `(session_id, question_id)` 唯一；
- `annotations` 不依赖某个 Pane；
- 可恢复未提交 Session；
- 写作自动保存不覆盖历史提交版本；
- 后续迁移可回滚或至少有版本检查与备份。

提供 TypeScript repository interfaces，以及：

- Tauri/Rust 实现；
- 测试用 in-memory/mock 实现。

---

## 5. 共享双窗格的核心逻辑

双窗格是该项目最重要的底层能力。它不是“左边复制一份、右边复制一份状态”，而是两个 View 读取同一份领域状态。

### 5.1 Reading 模式

Reading 工作台必须提供：

- 顶部标题、模式、计时器占位、提交按钮；
- 中间两个可调整宽度的 Pane；
- 两个 Pane 各自有内容选择器；
- 默认独立滚动；
- 分割线可拖动；
- Pane 宽度记住；
- 底部题号导航；
- Practice/Study 与 Exam 两种模式：
  - Exam：左 Passage，右 Questions，隐藏 AI 和答案；
  - Study：两边都可选择 Passage、Questions 或 Whole Test。

第一版允许的自由组合包括：

```text
Passage | Questions
Passage | Passage
Questions | Questions
Whole Test | Whole Test
```

两个 Pane 的滚动位置独立，但答案和标记共享。

### 5.2 答案共享

答案状态键必须是：

```text
sessionId + questionId
```

不得是：

```text
leftPaneQuestionState
rightPaneQuestionState
```

同一个问题同时出现在两个 Pane 时，在一边作答，另一边必须立即同步，并在重启应用后仍能恢复。

### 5.3 文字标记共享

第一版先实现：

- highlight：黄色、绿色、蓝色、粉色；
- underline；
- 删除标记；
- 可选简短 note；
- 刷新/重启持久化；
- 同一内容在两个 Pane 中出现时即时同步。

文字锚点至少包含：

```ts
type TextAnchor = {
  blockId: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  prefix: string;
  suffix: string;
};
```

要求：

- 锚点属于稳定 `ContentBlock`，不属于 Pane。
- 第一版可限制一次选择位于同一个 block 内；跨 block 选择应明确阻止或拆分，不能静默产生错误坐标。
- 渲染时先用 offset，若内容版本变化则尝试 `quote + prefix + suffix` 恢复。
- 不保存像素坐标。
- 同一个 annotation 在两个 Pane 中只是被渲染两次，不复制记录。
- 处理重叠 annotation 时不得破坏文本顺序。
- 为锚点创建、恢复、删除和双窗格同步编写测试。

不要在第一阶段做自由手写 Canvas。等文本标记稳定后再扩展 `AudioAnchor`、`ImageAnchor` 和手写层。

---

## 6. 第一轮应实现的页面

### 6.1 Onboarding / Workspace Picker

第一次启动：

1. 解释本地优先；
2. 让用户选择工作区；
3. 验证可写；
4. 初始化目录和 SQLite；
5. 安装原创 demo pack；
6. 进入 Library。

设置页可更换工作区，但更换前要警告并提供迁移/只切换选项；第一轮可以先只显示当前工作区和“重新选择”入口。

### 6.2 Library

至少有：

- 最近继续；
- 已安装题包；
- 按 Pack/Test 展开；
- Reading / Listening / Writing 卡片；
- 状态：未开始、进行中、已完成；
- “导入题包”入口；
- 原创 demo pack。

不要伪造 Cambridge 4–21 已内置。

### 6.3 Import Center v0

第一轮只实现安全、可验证的：

- 选择一个 `IELTSPack v1` 文件夹；
- 校验 manifest 和模块 JSON；
- 检查媒体引用；
- 显示错误与警告；
- 预览元数据；
- 用户确认后复制到工作区 `packs/`；
- 数据库登记；
- 重名/重复 ID 处理。

PDF、DOCX、图片 OCR 和 AI 解析仅留界面占位与文档，不要本轮匆忙实现。

### 6.4 Reading

完整实现第 5 节的纵向切片。

### 6.5 Listening v0

至少实现：

- 顶部本地音频播放器；
- Section / Questions 导航；
- 本地媒体加载；
- QuestionRenderer 复用；
- Practice 模式允许 seek；
- Exam 模式 UI 上禁止 seek、改变倍速和显示 transcript；
- 自动保存答案；
- Transcript/时间锚点先留接口，不必本轮完成。

说明：浏览器 `<audio>` 只是渲染组件，文件路径与权限由 Tauri 本地层安全提供。

### 6.6 Writing v0

至少实现：

- Task 1 / Task 2 导航；
- 左侧题目/图片区域；
- 右侧纯文本编辑器；
- word count；
- 800–1200 ms debounce 自动保存；
- 手动保存版本；
- 恢复未完成稿；
- Submit 产生不可变版本；
- AI 不得自动改写文本。

### 6.7 Review v0

至少显示：

- 本次 Session；
- 正确/错误/未答；
- 用户答案与正确答案；
- 按问题跳转；
- Reading 标记数量；
- Writing 版本；
- Listening 错题列表。

不要把非官方换算伪装成正式 IELTS Band。

### 6.8 Settings v0

至少有：

- 工作区信息；
- 浅色/深色/跟随系统；
- 字号、行距；
- 标记颜色语义；
- 数据备份占位；
- AI Provider 配置占位。

自定义背景图、模糊、透明玻璃效果不属于第一轮完成条件，但设计 tokens 需允许后续加入。

---

## 7. AI 架构只搭接口，第一轮不联网

定义清晰接口：

```ts
type AiAction =
  | "lookup_word"
  | "explain_selection"
  | "review_question"
  | "review_listening_mistake"
  | "evaluate_writing"
  | "overall_review";

interface AiProvider {
  id: string;
  displayName: string;
  testConnection(): Promise<ProviderHealth>;
  run<TInput, TOutput>(
    action: AiAction,
    input: TInput,
    outputSchema: unknown,
    signal?: AbortSignal
  ): Promise<TOutput>;
}
```

第一轮要求：

- 提供 `DisabledAiProvider` 或 mock provider；
- AI Drawer 可以打开，但明确显示“尚未配置”；
- Exam 模式彻底隐藏/禁用 AI；
- Context Builder 和“将发送哪些内容”的预览数据结构先定义；
- 不发起任何真实 DeepSeek 请求；
- 不在前端保存 API Key；
- 不写死模型名；
- 不把 AI 作为导入和做题的硬依赖。

后续 DeepSeek 接入必须走 Rust 网络层和安全凭据存储。

---

## 8. GUI 与可访问性

视觉方向：

- 桌面工具软件，而不是营销网站；
- 左侧可折叠导航；
- 内容区留白充足；
- 浅色默认，深色可用；
- Reading 正文以可读性优先；
- 避免大面积渐变、过度圆角、卡片堆叠和网页 Landing Page 风格；
- 使用统一 design tokens；
- 1280×800 可完整工作；
- 1920×1080 有合理扩展；
- 小于最低尺寸时给出可理解布局，不出现内容完全消失。

交互要求：

- 键盘可访问；
- 明确 focus ring；
- 按钮具有 accessible name；
- 不只用颜色表达题目状态；
- 未保存/自动保存状态可见；
- destructive action 有确认；
- 音频和计时器状态可被辅助技术理解。

---

## 9. 安全与隐私

必须创建 `docs/SECURITY.md`，至少说明：

- 本地文件边界；
- Tauri capability；
- CSP；
- IPC 校验；
- 路径穿越防护；
- API Key 的未来存储方案；
- 日志脱敏；
- AI 发送上下文必须由用户可见；
- Exam 模式不允许 AI；
- 默认不联网；
- 不上传题库和作文。

任何日志不得输出：

- 完整作文；
- 完整题目；
- API Key；
- 用户选中的大量原文；
- 用户绝对路径中的敏感部分（能避免时应归一化）。

---

## 10. 测试与验收

至少编写以下测试：

### TypeScript / React

- IELTSPack schema 正确与错误样例；
- Question discriminated union；
- answer store 同步；
- 双 Pane 展示同一问题时的答案即时同步；
- TextAnchor 创建与恢复；
- annotation 添加/删除后两个 Pane 同步；
- writing debounce autosave；
- Exam 模式不显示 AI；
- Import Center 对无效 manifest 给出错误。

### Rust

- 工作区路径验证；
- 首次迁移；
- 重复迁移幂等；
- repository CRUD；
- 路径越界被拒绝。

### 手工验收

1. `npm install`
2. `npm run tauri dev`
3. 首次启动选择非 C 盘工作区；
4. demo pack 出现在 Library；
5. 进入 Reading；
6. 调整双窗格比例；
7. 两边都显示同一 Passage；
8. 左边标黄一段词，右边即时出现；
9. 右边删除标记，左边即时消失；
10. 两边都显示 Questions；
11. 一边作答，另一边即时同步；
12. 关闭应用再打开，答案、标记、Pane 比例仍在；
13. Listening 能播放本地 demo 音频；
14. Writing 输入后自动保存，重启恢复；
15. Exam 模式看不到 AI；
16. 无网络时上述功能不受影响。

构建与检查命令至少包括：

```powershell
npm run lint
npm test
npm run build
npm run tauri build
```

如果系统依赖导致最后一个命令不能完成，要提供完整错误摘要和可执行修复步骤，不能声称已经构建成功。

---

## 11. README 和交付说明

更新 `README.md`，包含：

- 项目定位与非官方声明；
- Windows 开发依赖；
- 安装与启动；
- 项目结构；
- 数据工作区；
- 题包格式；
- 原创 demo；
- 测试与打包；
- 当前完成范围；
- 后续路线；
- 版权边界。

创建：

- `docs/DATA_FORMAT.md`
- `docs/SECURITY.md`
- `docs/TESTING.md`
- 至少一个架构 ADR：
  - 为什么使用 Tauri；
  - 为什么题包与用户状态分离；
  - 为什么数据库放在用户工作区。

---

## 12. 最终完成条件

本轮结束时，不接受只有静态页面或设计稿。必须尽可能交付：

- 可运行的 Tauri 桌面项目；
- 可见的自有 GUI；
- 本地工作区初始化；
- SQLite 持久化；
- 原创 demo pack；
- Library；
- Reading 双自由窗格；
- 跨 Pane 共享答案；
- 跨 Pane 共享文字标记；
- Listening 基础本地播放器；
- Writing 自动保存与版本；
- Review/Settings 基础页面；
- AI 接口占位；
- 测试；
- 文档；
- 构建结果。

最后向我报告：

1. 创建/修改的关键文件；
2. 实现了哪些验收项；
3. 执行过哪些命令以及真实结果；
4. 哪些项目未完成；
5. 当前已知风险；
6. 下一轮最应该做的一件事；
7. 不要用“应该可以”“理论上通过”代替真实验证。

现在开始：先检查环境和仓库，写 `docs/EXECUTION_PLAN.md`，然后直接实现。
