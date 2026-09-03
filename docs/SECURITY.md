# IELTS Workbench 安全与隐私模型

本文是 Phase 0–1 的安全基线。它同时约束 React、Tauri commands、Rust 文件/SQLite 层、题包导入和测试。新增文件权限、网络访问、AI Provider、资源协议或外部格式前，必须更新本文并重新检查 capability、CSP 和日志边界。

## 1. 安全目标

- 核心 Listening/Reading/Writing 在无网络时可用。
- 只访问用户明确选择的工作区，以及用户本次明确选择用于预览/导入的源文件夹。
- 题包安装后只读，用户状态只写入工作区 SQLite。
- renderer 不获得任意文件系统、SQL、shell、网络或秘密访问能力。
- 路径穿越、symlink/junction/reparse-point 越界与重复 pack 覆盖被拒绝。
- Exam 模式不能访问 AI、答案、transcript 或被禁止的播放控制。
- 日志不包含 API Key、完整作文、完整题目、长选择文本或不必要的敏感绝对路径。
- 默认不上传题包、媒体、答案、作文或标记，不包含遥测和广告。

## 2. 信任边界与威胁模型

### 2.1 受信任层

Rust/Tauri 本地层负责：

- 当前工作区解析与可写性检查；
- 路径规范化和边界校验；
- SQLite 连接、迁移、事务和参数化查询；
- pack 重新校验、复制和登记；
- 本地媒体的受限读取；
- bootstrap 配置；
- 未来的网络请求与操作系统安全凭据访问。

“Rust 代码”本身不自动等于安全。每个 command 仍需使用窄 DTO、验证 ID/路径/长度/枚举，并返回不泄漏内容的结构化错误。

### 2.2 不受信任输入

- renderer 发来的所有 IPC 参数；
- 用户选择的 pack 文件夹及其中全部 JSON、媒体、文件名和链接；
- 用户输入的答案、annotation note 与作文；
- bootstrap 中保存的旧工作区路径；
- 未来 AI Provider 的响应；
- 被其他程序修改、移动或替换的工作区文件。

### 2.3 主要风险

- `../`、绝对路径、UNC/盘符、大小写或 symlink/junction 导致工作区越界；
- 预览后修改源目录，在安装时绕过校验（TOCTOU）；
- renderer 获得宽泛 fs/shell/http 权限；
- 恶意题包通过 HTML、URL、超大文件或伪造 MIME 执行脚本/耗尽资源；
- SQLite 迁移失败或重复安装覆盖用户数据；
- 日志/错误回显完整作文、题目、API Key 或用户目录；
- 仅在 UI 隐藏按钮但 service 仍允许 Exam 调用 AI；
- 本地媒体协议暴露整个磁盘路径范围。

## 3. 默认离线与网络策略

Phase 0–1 不实现真实 AI Provider，也不需要常驻网络：

- 不加载远程页面、脚本、字体、图片、音频或 iframe；
- 不抓取、代理、热链第三方考试站点；
- 不添加 analytics、crash upload、广告、在线账户或自动上传；
- `DisabledAiProvider` 可以返回“尚未配置”，但不得发起请求；
- 导入、练习、保存、Review 与设置不得依赖网络可用性。

未来增加 AI 时必须是用户显式触发的 opt-in 操作，经过 Rust 网络层，并在发送前显示可读的 context preview。网络 provider 不得成为普通导入或做题的硬依赖。

## 4. 工作区与路径验证

### 4.1 工作区初始化

1. 用户通过系统目录选择器明确选择根目录。
2. Rust 要求输入是绝对目录；创建必要目录后取得平台规范化路径。
3. 使用工作区内随机、应用自建的 probe 文件验证可写，成功后立即删除。
4. 建立 `workspace.json`、固定子目录和 SQLite；任一步失败都返回明确错误。
5. 只有初始化整体成功后才更新 AppData 中的小型 bootstrap 路径。
6. 不可用的旧工作区不得触发在 AppData 或默认 C 盘静默新建替代数据库。

工作区可以位于 C 盘或其他盘，但必须是用户明确选择；应用不得自行把大型数据锁定在 C 盘。

### 4.2 后代路径解析

任何 pack/media/import 内部路径至少执行以下检查：

1. 拒绝空路径、NUL、绝对路径、Windows Prefix/盘符/UNC、RootDir、ParentDir (`..`) 和 CurrentDir (`.`) component。
2. JSON 中只接受 `/` 分隔的相对路径。
3. 先规范化允许的根目录。
4. 对已存在目标规范化完整目标；对待创建目标规范化其最近已存在父目录。
5. 以平台正确的方式确认规范化结果仍是根目录后代。
6. 检查 symlink、junction 和其他重解析点；任何指向根外的链接都拒绝。
7. 文件创建使用应用生成的固定/随机文件名，避免跟随攻击者在检查后替换的目标。

不要使用字符串前缀比较，例如 `candidate.startsWith(rootString)`；`D:\data2` 不是 `D:\data` 的后代。边界检查必须基于规范化 Path component，并有 Windows 测试。

### 4.3 导入源

用户明确选择的导入源是一次性读取边界，不会自动成为永久 capability scope：

- 预览只读，不写工作区或源目录。
- 安装确认时重新打开并完整复验 schema、引用、hash、MIME、大小和路径边界。
- 拒绝源内越界 symlink/reparse point。
- 复制到 `packs/` 下应用创建的临时目录，成功后原子改名。
- 相同 pack ID 返回冲突；不覆盖现有目录或 `installed_packs`。
- 复制失败时只清理本次由应用创建且已经验证位于工作区内的临时目录。
- 安装成功后不保留外部源绝对路径；数据库登记工作区内相对路径。

## 5. Tauri capability 最小授权

Phase 0–1 的 renderer 只需要基础窗口/事件能力和系统目录选择器。建议 capability 仅包含实际调用的 `core` 权限与 `dialog:allow-open`，并按窗口限定；不授予：

- 通用 filesystem read/write；
- shell/process execution；
- arbitrary URL opener；
- HTTP client；
- remote window/navigation；
- clipboard、global shortcut、notification 或 updater 等未使用权限。

所有工作区文件操作走自定义 Rust commands，commands 内再次校验。引入 Tauri plugin 不能只因依赖已安装就授予其默认宽权限；capability 必须与实际调用逐项对应。

如果本地媒体使用 asset/custom protocol：

- 不允许 `$HOME/**`、磁盘根或任意绝对路径 scope；
- URL 只携带 pack/media 的稳定 ID，不暴露任意文件参数；
- Rust 从已安装 manifest 解析媒体路径并执行工作区边界检查；
- 响应设置准确 MIME、`nosniff` 思路并拒绝 HTML/script；
- 临时 Blob URL 使用后 revoke。

几秒的 demo 媒体可以通过受限 Rust command 返回 bytes/Blob 验收。该方式不代表大音频的最终传输设计，扩大媒体规模前需性能与内存审计。

## 6. CSP 与窗口内容

应用窗口不导航到远程页面，保留标准操作系统标题栏。Phase 0–1 的 CSP 基线：

```text
default-src 'self';
connect-src ipc: http://ipc.localhost;
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' asset: data: blob:;
media-src 'self' asset: data: blob:;
font-src 'self' data:;
object-src 'none';
frame-src 'none';
base-uri 'none';
form-action 'none'
```

说明：

- `connect-src` 仅保留 Tauri IPC 所需 scheme/host，不加入 `https:` 通配。
- `'unsafe-inline'` 仅限 style，以兼容受控组件的动态布局；`script-src` 不允许 inline/eval。
- 若最终实现不使用 `asset:`、`data:` 或 Blob，应从对应 directive 删除。
- 不允许 `*`、任意远程域、`unsafe-eval` 或远程字体。
- 每次增加协议/provider 都要根据最终 Tauri 配置与开发/生产行为重新验证，本文示例不能替代实际配置审计。

题包文本使用 React 文本节点渲染，不解析 HTML/Markdown 中的原始 HTML。外部链接在 Phase 1 不渲染为可点击远程导航。

## 7. IPC 与数据校验

- command 使用单一命名 input DTO，而不是大量松散参数。
- Serde DTO 使用 camelCase 映射和拒绝未知字段；字符串 ID、枚举、长度和数值范围均校验。
- renderer 调用前用 Zod 校验输入，收到结果后再次用 Zod 校验输出。
- Rust 校验是最终权限边界，不能因为前端已校验而省略。
- SQL 使用参数绑定；表名、排序字段等不可绑定项只从内部 enum 映射。
- command error 返回稳定 `code`、面向用户的简短 `message` 和可选 `field`；不得回显完整作文、题目 JSON、API Key 或敏感绝对路径。
- 大文本不写入普通 debug 日志。必要的诊断记录 ID、长度、hash/短指纹和错误码。
- 并发保存使用事务或明确顺序，旧请求完成不能把 UI 的较新文本标成旧版本已保存。

## 8. SQLite 与迁移

- 主连接只打开当前已验证工作区中的固定数据库名。
- 每个连接开启 `PRAGMA foreign_keys = ON`。
- 查询参数化；答案、草稿使用唯一约束和显式 upsert。
- 迁移使用事务并记录 `schema_migrations`；重复运行幂等。
- 数据库 schema 新于应用支持版本时拒绝继续打开写入流程。
- migration v3 的 trigger 阻止对非 `in-progress` Session 继续写答案、标记、草稿或写作版本；repository 同时给出可读冲突错误。
- 未来破坏性迁移前在 `backups/` 创建并验证备份。备份失败则中止。
- 新于应用支持的 schema 不得继续写入。
- pack JSON 不因保存答案/标记/作文而变化。
- writing submit/manual version 只新增；AI 或 autosave 不覆盖历史版本。

数据库文件本身在 Phase 1 不承诺静态加密，因此不得把 API Key 或其他秘密放入普通列。作文、答案仍是私密用户数据：不上传、不写日志，备份由用户工作区边界保护。

## 9. AI、秘密与 Exam 模式

### 9.1 Phase 1

- 只提供 `AiProvider` 接口和 `DisabledAiProvider`。
- 不保存 API Key，不写死模型名，不发起真实请求。
- AI Drawer 在 Study 可显示“尚未配置”；Exam 中按钮、快捷键和 Drawer 都不存在或被服务层拒绝。
- 进行中的 Exam 由持久化 Session 状态锁定，只允许当前模块的 `?mode=exam` 路由或无答案的锁定 Review；Library、其他模块和 `?mode=study` 在子页面挂载前被替换回当前 Exam。
- Reading、Listening、Writing 必须先完成答案/草稿持久化并提交 Session，成功后才解除路由锁。

### 9.2 未来 Provider

- API Key 仅通过 Rust 访问 Windows Credential Manager / macOS Keychain 等操作系统安全凭据存储。
- Key 不进入 React props/state、localStorage、普通 SQLite、日志、错误、Git、测试 fixture 或崩溃报告。
- provider base URL 和 model 可配置，但 URL 必须校验 scheme/allowlist 策略，不能让远程页面进入应用窗口。
- 每次发送前显示 context preview：动作、题目/选择/作文范围、字符数和 provider；用户明确确认。
- 结构化输出经 schema 校验，失败时不修改答案或作文。
- AI suggestion 作为候选记录；只有用户明确接受才产生用户可见编辑，并保留 Original / Suggestion / Reason。
- Exam mode 在 UI、context builder 和 provider/service 三层拒绝调用，不能只隐藏按钮。

## 10. 日志与隐私

允许记录：

- 时间、内部错误码、模块名；
- pack/session/annotation 的稳定 ID（必要时短 hash）；
- 字符数、文件大小、耗时、schema 版本；
- 已脱敏路径，例如盘符 + 最后一级名称或不可逆短 hash。

禁止记录：

- API Key、Authorization header、secret response；
- 完整作文、完整题目、答案键、transcript；
- 用户选择的大段原文、annotation note 全文；
- manifest/module 全文；
- 不必要的用户名、完整绝对路径或工作区文件列表。

用户界面可以显示其明确选择的完整工作区路径；“不记录”不等于“不能向数据所有者显示”。持久化日志应轮转并位于工作区 `logs/`，不自动上传。

## 11. 安全测试门槛

至少覆盖：

- `..`、绝对路径、UNC/盘符和 sibling-prefix 越界；
- 已存在目标与待创建目标的规范化；
- 源目录/工作区 symlink 或 junction 越界（平台允许创建测试链接时）；
- 无效/未知 schemaVersion、重复 ID、缺失媒体、错误 hash/MIME；
- 预览后源改变时安装重新校验；
- 重复 pack ID 不覆盖；
- SQLite 首次迁移、重复迁移、外键和 CRUD；
- Exam 不渲染 AI/答案/transcript/seek/rate，并且 service 拒绝 AI；
- 日志与错误对象不含 fixture 中的 sentinel secret/essay/path；
- CSP/capability 不出现未批准的宽权限。

具体命令和手工验收见 [TESTING.md](TESTING.md)。当前环境缺少 Rust/Cargo/MSVC，因此 Rust、Tauri 与 Windows 打包安全链路尚不能在本机验证；不能把静态代码审阅写成测试通过。

## 12. Reading PDF 辅助导入边界

- 文件必须由用户在当前操作中明确选择；浏览器适配器只持有该 `File` 的内存字节，Tauri 适配器不得获得任意路径读取能力。
- `pdfjs-dist` 在本机按需处理单页画布和文本层；不加载远程 PDF，不热链，不把文本发送到网络，也不自动执行 OCR。
- 前端在生成题包前校验 MIME/扩展名、文件大小、页码范围、题目结构和答案文本。超过 50 MB 给出警告；解析错误只显示概括信息，不记录完整试题文本。
- 源文件身份使用 SHA-256 和有限元数据；不保存绝对路径、百度网盘 token、分享口令或访问凭据。
- Web/Vite 开发回退把状态放入当前 origin 的 IndexedDB，不使用 `localStorage`。它只用于 renderer 开发与测试，不代替桌面工作区的 SQLite 安全边界。
- Tauri 的 `install_generated_pack` 只接受完整且经双端校验的 `manifest + modules` 对象，序列化大小上限为 64 MiB，只允许 Reading/Listening/Writing 固定模块名，并只在已校验工作区下创建应用自有暂存目录。安装仍复用现有防覆盖、路径边界和原子安装检查。
- 真实或私人 PDF、提取文本、页面渲染、数据库和解析缓存由 `.gitignore` 排除；提交前必须同时检查暂存区与已跟踪文件，不能仅依赖扩展名规则。
