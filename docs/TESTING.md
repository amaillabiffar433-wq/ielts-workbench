# IELTS Workbench 测试与验收

本文定义 Phase 0–1 的最小测试矩阵、真实桌面手工验收和报告规则。测试的目标不是只让静态页面渲染，而是证明“工作区 → 题包 → Session → 跨 Pane 状态 → SQLite → 重启恢复”的纵向链路。

## 1. 当前环境与验证状态

2026-09-02 环境检查：

| 项目 | 当前结果 | 能力影响 |
| --- | --- | --- |
| Node.js | `v24.14.0` | 可运行 npm/TypeScript 工具 |
| npm | `11.9.0` | 可安装锁定依赖并运行 scripts |
| Git | `2.54.0.windows.1` | 可用 |
| WebView2 Runtime | `152.0.4191.53` | 桌面 WebView 前置项可用 |
| `rustc` | 不在 PATH | Rust 编译/测试阻塞 |
| `cargo` | 不在 PATH | Tauri dev/build 阻塞 |
| MSVC C++ toolchain / Windows SDK | 未检测到可用组合 | Windows Tauri 链接/打包阻塞 |

本文列出的命令是验收要求，不代表已经运行成功。实际执行记录与退出码统一写入 [EXECUTION_PLAN.md](EXECUTION_PLAN.md)；未在该文件中记录成功的命令不得称为通过。renderer 浏览器预览也不能替代 Tauri/SQLite 手工验收。

## 2. 测试分层

### 2.1 纯领域单元测试

无 DOM、无 Tauri、无真实磁盘，测试 Zod schema、ID/路径规则、答案评分、TextAnchor 和 word count。运行快、失败定位清晰。

### 2.2 Store/repository 测试

使用与桌面实现相同的 TypeScript repository interfaces 和新的 in-memory repository 实例。每个测试独立创建 store/repository，禁止共享全局残留。验证 canonical Session 状态、upsert、错误状态和写作版本语义。

### 2.3 React 组件/集成测试

使用 Vitest、jsdom、Testing Library 与 user-event。通过角色、label 和可访问名称查询；不以 CSS class 或实现内部 state 作为主要断言。

### 2.4 Rust 单元/集成测试

使用临时目录和临时 SQLite，验证路径、工作区初始化、迁移、repository 和 pack 安装。不得读写用户真实工作区。Windows 无权限创建 symlink 时，相应测试应明确 skip 原因，并保留无需 symlink 的 `..`/绝对路径越界测试。

### 2.5 真实桌面手工验收

必须通过 `npm run tauri dev` 或构建产物操作真实系统目录选择器、Rust commands、SQLite 和本地媒体。`npm run dev` 只验证 renderer，不算桌面流程通过。

## 3. TypeScript / React 必测项

### 3.1 `IELTSPack v1`

1. 完整原创 demo manifest + Reading/Listening/Writing 被接受。
2. `schemaVersion !== 1` 被拒绝。
3. manifest 缺少必填字段、重复 module 或重复稳定 ID 被拒绝。
4. media `relativePath` 含绝对路径、`..`、反斜杠或盘符时被拒绝。
5. Test 的 `moduleIds` 悬空/重复，或题包出现全局重复稳定 ID 时产生语义错误。
6. media 引用不存在或 kind 不匹配时产生错误。
7. 无效 manifest 在 Import Center 显示可访问的错误摘要和字段路径，不进入确认安装状态。

### 3.2 Question discriminated union

1. single choice、true/false/not-given、short answer 与 fill blank 的正确 fixture 均被接受。
2. single choice 缺少 `options` 或 `correctOptionId` 被拒绝。
3. `correctOptionId` 不在 options 中被语义校验拒绝。
4. short answer 携带错误 variant 字段或空 `acceptableAnswers` 被拒绝。
5. QuestionRenderer 对四类题给出键盘可操作且有 accessible name 的控件。

### 3.3 答案与双 Pane

1. answer store 以 `sessionId + questionId` upsert，第二次更新不产生重复记录。
2. 两个 QuestionRenderer 同时显示同一 question：在第一个控件作答，第二个在同一事件循环立即显示相同答案。
3. 切换 Pane view 不删除答案。
4. repository 写入失败时，UI 显示保存错误且保留可重试的本地输入；不得假装“已保存”。
5. 旧的异步保存晚于新保存完成时，不得把新值/状态回退。
6. 显式练习 URL 的 `packId + testId` 必须先加载精确题包，再按相同身份创建或恢复 Session；加载期间不得渲染旧题包。
7. Session 恢复必须核对 pack/test/module/mode/status；旧设置键只可在完整身份匹配后迁移。
8. StrictMode 下同身份的并发恢复只创建一个 Session；旧 pack/session 请求与旧 submit 均不得覆盖较新的活动身份。

### 3.4 TextAnchor 与 annotation

1. 同 block selection 正确生成 `blockId/start/end/quote/prefix/suffix`。
2. 空 selection 和跨 block selection 被明确拒绝。
3. 原文未变时用 offset 直接恢复。
4. 文本前方插入内容后，通过 quote + prefix/suffix 恢复到正确位置。
5. quote 重复且上下文无法消歧时返回 unresolved，不猜第一个。
6. 添加 highlight/underline 后，两个 Passage Pane 立即渲染同一 annotation。
7. 一边删除 annotation，另一边立即消失，repository 中只删除一条记录。
8. yellow/green/blue/pink 与 underline 均有非颜色提示或可访问名称。
9. 重叠 annotation 渲染后，容器 `textContent` 与原文完全相同，字符不丢失、不重复、不乱序。

### 3.5 Writing

使用 fake timers 和 `act`：

1. 连续输入在 1000 ms debounce 窗口内不保存。
2. 时间到后只保存一次最新文本，而不是每次按键保存。
3. 离开 Task/卸载时 flush 或显示未保存状态；行为必须由测试固定。
4. repository 失败显示“保存失败”，重试成功后显示“已保存”。
5. word count 对空白、多空格、换行和常见英文标点有固定结果。
6. 手动保存每次新增 `manual` version。
7. Submit 新增 `submitted` version，后续 autosave 不修改该快照。
8. 新建 store/repository 后能恢复未完成 draft 与历史版本。

### 3.6 Listening、Exam 与 AI

1. Study 模式显示 play/pause、seek 和允许的速度控制。
2. Exam 模式不显示 seek、速度和 transcript；用文本/role 断言，不只看 CSS hidden。
3. Exam 模式不显示 AI 按钮、Drawer、快捷入口或答案键。
4. 进行中的 Exam 从 Library、其他模块或同模块 `?mode=study` 进入时，在目标页面挂载前回到当前 `?mode=exam`；直接 Review 只显示锁定状态，不读取答案/解析。
5. Listening Exam 进入时从 0:00、1× 开始，禁止 seek，播放结束后禁止 replay，并提供可访问状态。
6. DisabledAiProvider 明确返回未配置状态，不进行 fetch。
7. 没有网络或把 `fetch` 设为失败时，Library、Reading、Listening 本地媒体、Writing 和保存测试仍成功。
8. Session repository 失败时，Reading、Listening、Writing 显示真实错误和可操作的重试入口，不产生未处理 rejection 或永久 loading。
9. Listening 的媒体先完成、Session 后完成时，Exam 音频仍在节点挂载后重置为 0:00、1×，`ended` 后禁用重播。

### 3.7 App Shell 与可访问性

1. loading、empty、error 与 save 状态均有用户可读文本。
2. Top Navigation、toolbar、Pane selector、Question navigation、Submit 均可用键盘到达并具有 visible focus。
3. 题目未答/已答/标记/错误状态不仅靠颜色区分。
4. Exam destructive submit 与工作区重新选择有确认。
5. 1280×800 不遮挡核心操作；较小窗口显示可理解的窄布局或滚动，而不是让内容完全消失。
6. 从任意显式题包 Study 路由切换 Reading/Listening/Writing 时，侧栏保留相同 `packId/testId`；Review 返回链接也保留 Session 身份。
7. Review 只按 Session 的 `packId/testId/moduleType` 读取题包；全局 `activePack` 指向另一题包时不得显示或评分该题包内容。

## 4. Rust 必测项

### 4.1 路径与工作区

1. 明确选择的可写绝对目录被接受并规范化。
2. 相对根路径、文件而非目录、只读/不可写目录被拒绝。
3. 初始化创建 `workspace.json`、数据库和 `packs/imports/themes/backups/logs`。
4. `safe/path` 被解析为工作区后代。
5. `../outside`、绝对外部路径、UNC/盘符、sibling prefix（如 `data2` 冒充 `data`）被拒绝。
6. 已存在目标和待创建目标都不能经 symlink/junction/reparse point 越界。
7. 旧 bootstrap 指向缺失目录时返回可恢复错误，不在默认目录静默创建数据库。
8. 日志/command error 不包含 fixture 中设置的完整敏感路径 sentinel。

### 4.2 SQLite 与迁移

1. 首次打开空工作区应用 migration v1，所有要求表存在。
2. 重复运行 migration 不重复记录、不报错，schema 保持一致。
3. `PRAGMA foreign_keys` 实际为 ON。
4. pack/session CRUD 与外键约束生效。
5. answers 对 `(session_id, question_id)` 唯一，upsert 更新原行。
6. annotation insert/list/delete 使用同一记录，按 session/block 查询正确。
7. writing draft upsert 只更新 current draft；两个 version insert 均保留不同快照。
8. 数据库 schema 新于应用支持版本时拒绝写入。
9. 破坏性 migration 的备份失败 fixture 会中止迁移；Phase 1 若无破坏性 migration，保留 helper 测试或明确延后。
10. 已提交/已放弃 Session 的答案、标记、草稿和新写作版本被 repository 与数据库 trigger 拒绝。

### 4.3 Pack 与媒体

1. 原创 demo pack 初始化仅安装一次，重复启动不覆盖。
2. 无效 JSON、未知 schema、重复 ID、缺失媒体和越界引用被拒绝。
3. 相同 pack ID 不覆盖已安装目录/数据库记录。
4. 预览后修改源文件，安装阶段重新校验并拒绝。
5. 失败安装不留下已登记 pack 或不完整正式目录。
6. media command 只接受稳定 pack/media ID，并拒绝任意路径。
7. 返回 MIME 与声明/文件类型一致；非允许类型被拒绝。

### 4.4 Repository CRUD 与错误

1. start-or-resume 返回同一未提交 Session；已提交 Session 不被当作未完成稿恢复。
2. command DTO 拒绝空/超长 ID、未知 enum 和未知字段。
3. SQL 注入字符串仅作为参数值，不改变 schema/查询。
4. 错误返回稳定 code，不回显题目、作文、API Key 或完整源 JSON。

## 5. 手工桌面验收脚本

前置条件：安装 Rust stable MSVC、Cargo、Visual Studio C++ Build Tools/Windows SDK；使用一份专门的非 C 盘测试工作区，不指向真实学习数据。

1. 执行 `npm install`。
2. 执行 `npm run tauri dev` 并确认出现标准 Windows 标题栏和应用内 App Shell。
3. 首次启动解释 local-first，并要求选择工作区；取消时不写数据。
4. 选择非 C 盘空测试目录，确认固定目录、`workspace.json` 和 SQLite 被创建。
5. Library 显示完全原创的 demo pack，且没有伪造 Cambridge 4–21。
6. 进入 Reading，调整双 Pane 比例，关闭并重开后比例恢复。
7. 两边选择同一 Passage；左边标黄同一 block 内的词句，右边立即出现。
8. 右边删除该标记，左边立即消失。
9. 两边选择 Questions；一边作答，另一边立即同步。
10. 关闭应用再打开，未完成 Session、答案和 Pane 比例恢复。
11. 再次建立标记，重启后标记恢复；跨 block selection 给出明确提示。
12. Listening 播放工作区 demo WAV；Study 可 seek，Exam 不显示 seek/倍速/transcript。
13. Writing 连续输入，观察“保存中 → 已保存”；重启恢复未完成稿。
14. 手动保存两次并 Submit，Review 中看到独立、不可变的版本快照。
15. Exam 模式看不到 AI、答案或任何绕过入口。
16. 断开网络/阻止网络访问后，重复 Library、Reading、Listening、Writing 与保存流程。
17. Import Center 选择无效 pack，确认只显示错误且工作区没有正式安装记录；选择合法副本并确认安装。
18. 尝试再次导入相同 pack ID，确认明确拒绝且原 pack/hash 未改变。
19. 打开 Settings，确认显示当前工作区、主题/字号/行距，AI Provider 显示未配置。
20. 在 1280×800 和 1920×1080 检查阅读、焦点、滚动、分隔线和底部题号导航。

手工记录至少包含：应用版本/commit、Windows 版本、工作区盘符（不记录私人路径）、每一步结果、截图或错误摘要、数据库重启前后记录计数。

## 6. 构建与检查命令

仓库 scripts 的非交互检查：

```powershell
npm install
npm run lint
npm test
npm run build
```

其中：

- `npm test` 必须是一次性 `vitest run`，不能留下 watch process；
- `npm run build` 应同时执行 TypeScript no-emit 检查与 Vite production build；
- lockfile 变化应被审阅，禁止修改全局 npm 配置。

Rust/Tauri 工具链可用后：

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

如果任一命令失败：

- 报告精确命令、退出码和关键错误；
- 区分代码失败、测试失败与环境前置条件缺失；
- 完成所有仍可运行的检查；
- 不把“源码存在”“Vite build 成功”或“WebView2 已安装”表述为桌面打包成功。

## 7. 测试数据与隔离

- 只使用仓库的完全原创 demo 与人工构造的最小 invalid fixtures。
- 不把真实 Cambridge/IELTS 题目、答案、音频、图片、扫描件或 transcript 放入 fixture、snapshot、日志或构建产物。
- 每个 Rust 测试使用新临时目录；每个 TypeScript 测试使用新 repository/store。
- 测试不访问网络，不依赖用户 AppData/真实工作区，不修改全局 npm/Rust 配置。
- 时间用 fake clock；UUID 可注入固定 generator；写作 debounce 使用 fake timers。
- 测试结束清理本次创建的临时资源。删除前验证目标是测试 temp root 的后代。

## 8. Definition of Done

一个功能只有同时满足以下条件才可标记完成：

1. TypeScript 编译和相关 lint 通过。
2. 相关领域、store、组件与 Rust 测试实际运行成功。
3. 受影响的真实 Tauri 用户流程在可用环境中手工执行。
4. loading、empty、error、保存失败与恢复状态存在。
5. 键盘和 focus 行为可用，不只靠颜色传达状态。
6. 数据格式、安全与执行计划文档已更新。
7. 没有扩大文件、网络、日志、版权或 Exam 模式边界。
8. 交付报告列出真实命令/结果、未完成项和风险。

因 Rust/MSVC 缺失而暂时不能运行桌面链路时，可以完成并报告未阻塞的 TypeScript、源码和文档工作，但该功能仍应标记为“Rust/Tauri 未验证”，而不是“已完成”。

## 9. Reading PDF 辅助导入回归

新增自动化测试必须使用极短原创文本或人工构造的 `File`/页面对象，不提交私人 PDF。覆盖范围包括：

- PDF 文件类型、文件大小提示和 1-based inclusive 页码范围；
- 定位文本片段合并、Passage 标题/正文、题号与选项识别；
- `TRUE/FALSE/NOT GIVEN`、单项选择、简答/填空与 unsupported 回退；
- Answer Key 按题号解析、无法解析行保留；
- SHA-256、导入 manifest、来源页/原始块保留与重复导入检测；
- 无答案键时老数据/导入数据兼容，Review 显示未评分；
- repository 安装、IndexedDB 快照恢复和 Tauri `install_generated_pack` 调用契约；
- 导入向导的文件拒绝、提取、人工答案应用与成功入口。

本轮人工 PDF 样本 `local-data/import-samples/original-reading-pdf-mvp.pdf` 为三页原创材料。每次需要真实文件验收时执行：

```powershell
pdfinfo local-data/import-samples/original-reading-pdf-mvp.pdf
pdftotext -layout local-data/import-samples/original-reading-pdf-mvp.pdf tmp/pdfs/original-reading-pdf-mvp.txt
pdftoppm -png -r 144 local-data/import-samples/original-reading-pdf-mvp.pdf output/pdf/original-reading-pdf-mvp-page
Get-FileHash -Algorithm SHA256 local-data/import-samples/original-reading-pdf-mvp.pdf
```

所有渲染页都要目视检查截断、重叠和不可读字符。随后在 Vite 页面完成：载入 PDF → 单页预览 → 选择页 1/2/3 → 提取与人工校正 → 应用答案 → 导入 → Reading 作答/标记 → 刷新恢复 → 原创 demo 回归。关闭本地开发服务后才算 smoke test 收尾。
