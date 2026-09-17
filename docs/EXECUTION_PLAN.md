# IELTS Workbench 执行计划

## 2026-09-17：IELTS Personal Operating System 产品级重构

本轮唯一源码工作副本为 `D:\Projects\雅思or算法软件项目`，分支 `codex/product-os-rebuild`。开始实现前已创建完整 Git bundle、工作树 patch 与逐文件副本备份：`D:\IELTS-Workbench-Backups\20260917-090322-pre-product-os-rebuild-complete`；原有 2026-09-16 P0 工作先通过 242 项前端测试、lint、Vite build 与 38 项 Rust 测试，再以 `f085806` 建立可回退检查点。`D:\downloads\雅思`、DDDD 安装器、用户工作区与 Obsidian 库均按只读源处理，任何学习记录写入必须经过独立实现与定点验证。

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| R0 | 审计 Git/工作树/历史成果，备份未提交修改并建立重构分支 | 已完成 |
| R1 | 只读扫描 `D:\downloads\雅思`，生成 SHA-256 清单、重复项统计与 Cambridge 4–20 可导入性报告 | 已完成；889 个文件、14.228 GiB，未发现 Cambridge 21，扫描版 PDF 需 OCR + 人工确认 |
| R2 | 对 DDDD 安装器做合法静态审计，记录可借鉴产品行为与明确拒绝移植的在线/账号设计 | 已完成静态解包；未运行程序、未登录、未访问私有接口；证据写入 `docs/rebuild/02-dddd-analysis.md` |
| R3 | 建立 `docs/rebuild/00`–`10` 的现状、数据、IA、设计、体验、迁移和验收基线 | 已完成；包含用户要求的精确文件名与最终证据 |
| R4 | 重建 English-first 顶层 IA：Home / Library / Review / Progress / Settings，并保留稳定领域 ID 与现有仓储层 | 已完成；Home/Progress 使用真实 repository 聚合 |
| R5 | 完成 Reading 54/46 工作台、双击复位、键盘/标记/生词/自动保存与三层结果体验 | 已完成并通过原生提交/回源验收 |
| R6 | 完成 Listening Exam/Study、位置恢复、±5 秒、波形/转写/精听能力的数据与 UI 边界 | 已完成；Exam 泄漏边界与 Study 开关均有测试 |
| R7 | 建立 Review 调度、Progress 真实统计、Obsidian 日报导出和对应 SQLite migration | 已完成；migration 0005、Review 事件、真实统计与 Obsidian 写后 hash 均已验收 |
| R8 | 构建 Cambridge 私有导入管线，先以 C20 Test 1 做 OCR/人工校核闭环，再按可验证范围扩展 | 现有统一 IELTSPack/PDF/OCR 管线已保留并补全证据边界；C17 已验证，C20 因缺可靠 Answer Key/Transcript 不作伪评分导入 |
| R9 | 全量测试、Release 构建、隔离工作区原生验收、1366/1920 截图与 SQLite/文件审计 | 已完成；47/47 前端文件、258/258 测试、41/41 Rust、Release EXE、18 张双尺寸页面截图 + 1 张原生窗口证据 |

验收硬边界：不运行或逆向绕过 DDDD 的认证/加密；不复制其源码、资源或视觉资产；不提交 Cambridge 内容；不把 Vite 预览当桌面验收；不使用假进度、假统计或模拟原生证据；每次 schema 变化均以新 migration、旧库升级测试和回滚备份为前提。

## 2026-09-16：日常使用前 P0 收尾（题目标记、词汇、Cambridge 书架）

工作副本为 `D:\Projects\雅思or算法软件项目`；`D:\IELTS-Workbench*` 是工作区/验收数据，不作为源码目录。开始前保留现有 4 个未提交的 completion inline 修复，并建立只读 Git 快照引用 `refs/codex-snapshots/20260916-pre-daily-use`（`0f5e01f62898ba7fe23aabf673c77eb3f1bee540`）。正式学习工作区 `D:\IELTS-Workbench` 仅用于修改前只读复现，数据库 SHA-256 在启动前后均为 `49FEC6255B349AA022D086CAF53E3B1A4A6E6C0E12FD1DCDA88FEA8F83AB0CFF`；后续写入验收一律使用隔离副本。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| F1 | 原生 Release 复现书库、Reading/Listening、题号导航、题目标记、提交状态与 Cambridge 17 Test 2 Passage 1；审计现有题包、SQLite、导入、媒体、词汇/封面能力 | 进行中：已确认原生 `http://tauri.localhost`、正式工作区 4 个题包和 Cambridge 17 Reading/Listening；书库仍为题包列表，词汇入口尚无完整实现 |
| F2 | 将题目标记改为题目内轻量操作，补齐全部/未答/已标记筛选、下一标记跳转、未提交/提交后状态语义和高 DPI/缩放布局 | 待开始 |
| F3 | 新增有 migration 的词汇持久化、选词轻浮层、来源上下文、状态/备注、独立紧凑词汇页、Markdown/JSON/CSV 导出及回到原文 | 待开始 |
| F4 | 将 Library 改为 Cambridge 书架优先，按书聚合 Test/Module/Passage，提供继续学习和封面缓存/fallback；不合并不同来源题包内容 | 待开始 |
| F5 | 补齐 Reading/Listening 基础批改与复盘入口的范围内缺口；保持首次提交不可变和提交前不泄露答案 | 待开始 |
| F6 | 全量 typecheck/build、lint、前端测试、Rust/迁移/重复导入/删除前校验测试；构建 no-bundle Release | 待开始 |
| F7 | 在隔离 D 盘工作区原生验收 Cambridge 17 Test 2 Passage 1 Q1–13、标记/生词重启恢复、书架/导航/复盘，并审计 SQLite 与长期资源引用 | 待开始 |
| F8 | 等待用户明确提供下载目录后，再扫描、分类、去重、导入、重启校验和按逐文件白名单清理；未提供前不猜路径、不删除 | 阻塞于用户路径，其他工作继续 |

硬边界：不联网获取、生成或补写 Cambridge 真题；不修改/提交私有题包、数据库或媒体；不删除任何源文件；不把 Vite 或 mock IPC 当原生验收；数据库变更必须新 migration、事务化并覆盖旧库升级测试。

## 2026-09-12：Structured + Visual Fidelity 双模式 PDF 导入

本轮以 `BUILD_STATUS.md` 为实时断点记录。保留上一轮所有未提交 UI 成果与已验证 EXE。

- [x] 复核 Reading/PDF/Repository/Rust 的实际边界，确认可复用答案/评分/草稿链路。
- [x] P0 代码：托管图片资源 + 稳定 Snapshot/Figure 上下文 + 框选/缩放 + 快速建题/校验/安装（原生闭环待下方验收）。
- [x] P1 代码：离线英文 OCR、扫描页检测、页/区域 OCR 进入人工编辑（运行时待原生验收）。
- [x] P2 代码：基础单/双栏排序及置信度、手动栏区域提取，复杂版面建议保真兜底。
- [x] P3/P4：沿用常见 IELTS 答案基础类型，加原图上下文、批量题号/字母选项、正文合并/拆分；不新建平行答案/评分架构。
- [ ] 六类原创 fixtures、全量前端/Rust/lint/build、no-bundle Release 原生完整退出/恢复。
- [ ] 回写数据/安全/验收文档及 BUILD_STATUS；仅本地必要提交，不 push/tag/安装。

硬边界：不从网络获取真题、不提交私有 PDF/图像/数据库；Cambridge 十分钟实测缺少用户材料时不得宣称 Done。OCR/复杂布局低置信度只警告，资源缺失、非法 ID/路径及不可作答结构仍阻断。

## 2026-09-12：统一顶部导航与纸张阅读工作台

恢复基准：`47f7320ed143888fae4c4098afb087d9dd5d8e2d`，`feat/pdf-import-mvp`，D 盘工作树干净。仅调整 UI、布局、样式与窗口展示，不修改题包、Session、Repository、评分、导入与 SQLite。

- [x] 阅读约定、数据格式、安全与相关 ADR；核对页面、Pane 选择、标记笔记、原生窗口及现有验收脚本。
- [x] 提取 TopNavigation，移除全局大侧栏；建立可替换本地壁纸入口和暗红/暖纸主题。
- [x] Reading 增加纯展示单/双 Pane、专注/字体/全屏工具；保留原始 Pane 身份、共享数据、导航与恢复；底部展示已有标记笔记。原生检查后修正专注模式网格行高，并使视图恢复仅依赖 Session 身份，不因计时更新重复挂载。
- [x] Listening / Writing 使用同一导航与纸张布局，保留媒体限制和写作保存流程。
- [x] 新增 11 个 UI 回归；标准 npm test 最终连续两次 215/215，lint、build、Cargo 33/33 全部通过；隔离 D 盘原生 Release 已检查双 Pane/媒体/快速关窗/重启恢复并保存四类真实截图。
- [x] 更新状态、日志与验收文档；`docs/UI_LAYOUT_ACCEPTANCE.md` 集中记录文件清单、实际命令、截图、边界和新 no-bundle EXE 指纹。修改保持未提交供审阅，不 push/tag。

能力边界：现有笔记是文字标记的 note，而非独立 Markdown 编辑器；词汇、翻译、统计等未实现功能不伪装为可用入口。未找到用户提供的火影壁纸，不下载版权图片，仅提供静态氛围底色与单一资源配置入口。既有 light/dark/system 偏好继续有效。旧 Release、用户工作区和 C 盘副本不删除。

更新日期：2026-09-09（Reading 日常可用版合并交付完成）

## 当前执行切片：Reading 日常可用版合并交付

恢复基准为 `D:\Projects\雅思or算法软件项目`、分支 `feat/pdf-import-mvp`、起始 HEAD `dc0aa415050def619b819c68446cdcf7ea7074c9`；恢复时工作树干净。本切片连续完成导入提效、常用题型、完整练习／复盘、工作区与备份恢复，最后统一构建 no-bundle Release。保护旧题包、数据库、草稿、验收资料和旧 EXE；不做 OCR、AI、复杂表格／图形编辑、整体 UI 重做、MSI/NSIS、push 或 tag。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| DU1 | 复核 A-D 相关实现与原创／已授权材料登记，明确可复用能力、实际缺口和兼容边界 | 已完成：确认沿用 IELTSPack/Session/SQLite/双 Pane；范围内未找到用户真实 Reading 试卷，真实材料验收保留为缺少文件 |
| DU2 | 在现有结构化整理器增加批量题目／选项／答案／分配／题组设置及可解释规则建议；所有变更先预览再确认 | 已完成：批量预览/全量确认、歧义阻断、稳定 ID 范围分配、题组默认值和可定位规则候选均已实现并有定向测试 |
| DU3 | 补齐 YNNG、多选、统一匹配配置、摘要／笔记上下文空位，并贯通 schema、Rust 校验、草稿、练习和评分 | 已完成：Reading v3 前端/Rust 双校验、草稿/安装/控件/Review/评分链路贯通；v1/v2 保持兼容 |
| DU4 | 补齐题目状态导航、可靠计时、提交幂等、Review 汇总、历史查看、继续与重新练习隔离 | 已完成：Session 级待检查、Study/Exam 计时、提交确认/幂等、历史/继续/新 Session 重做和可评分汇总已接入 |
| DU5 | 增加明确工作区切换／新建入口及一致性备份、完整性校验、仅恢复到新目录的本地恢复链路 | 已完成：SQLite online backup + 题包/草稿/主题 + SHA-256 manifest；先校验再恢复到唯一新工作区，不覆盖当前数据库 |
| DU6 | 用原创完整 Reading 工程样本覆盖全链路并完成针对性测试；合法真实材料若缺失则单独记录，不以原创样本冒充 | 已完成：3 Passage/40 题原创 v3 题包和 11 页原创文本层 PDF 已生成、双端校验并逐页检查；真实材料未找到并明确区分 |
| DU7 | 源码固定后集中执行全量 npm test、lint、Cargo test、生产构建和 no-bundle Release | 已完成：前端 204/204、lint、Cargo 33/33、2013-module Vite production build 和 `tauri build --no-bundle` 全部退出码 0 |
| DU8 | 在全新 D 盘工作区完成原生导入、练习、提交、历史、重做、备份恢复及交付目录独立启动验收 | 已完成：两个隔离验收工作区覆盖原创题包练习与原创 11 页 PDF 完整导入；提交/Review/历史/新 Session、SQLite 恢复、清单备份/新目录恢复及关窗修复后复验均通过 |
| DU9 | 增量更新状态／导入／备份／验收文档，建立小型本地提交并交付最终 EXE 指纹 | 已完成：功能提交 `4c41ec2`；日常交付 EXE 为 13,193,728 字节，SHA-256 `8BEEAACB85C301EC671157269FFE9D70B954ED895C9E90DA3E4BE909119F17A8`；真实用户 PDF 因未提供而保留为未验收边界 |

发布边界：仅在功能合并并通过集中回归后统一构建一次 Release；验收修复导致源码变化时才重建。最终程序复制到新的 `D:\IELTS-Workbench-Releases\daily-use-<timestamp>` 并从该目录启动验证，不覆盖旧版本。

## 当前执行切片：Reading 结构化表格／列表上下文 MVP

恢复基准为 `D:\Projects\雅思or算法软件项目`、分支 `feat/pdf-import-mvp`、起始 HEAD `ed983d8a95c4716b50dbe1d48b012fd83e0c6f2c`；恢复时工作树干净。现有 PDF 人工结构化导入、稳定题组选择、答案／标记、SQLite 与已验证 Release 均保留。本切片只扩展人工题组上下文和表格内作答，不做 OCR、AI、合并单元格、自动版面识别、新题型或整体 UI 重做。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| CT1 | 复核题包／草稿 schema、Rust 安装校验、Reading／Review、标记和 Repository 边界，确定版本规则 | 已完成：结构化上下文改变模块读取语义；采用 manifest v1 + Reading module v2，新版兼容 Reading v1，旧版不承诺读取 v2；草稿 v1 确定性迁移至 v2 |
| CT2 | 实现有稳定 ID 的段落、单层列表、矩形表格与 questionId 单元格绑定；补齐 TS/Rust 双边限制和交叉引用校验 | 已完成：TS/Rust 同时校验尺寸、文本、全局 ID、矩形结构、组内引用、支持题型和单题唯一绑定 |
| CT3 | 在 StructuredImportEditor 增加增删／重排／绑定／解绑与共用练习预览，草稿保存恢复不丢 ID | 已完成：无需手写 JSON；删除/缩小含绑定结构前确认，解绑不删除题目或答案；草稿 v1 自动迁移到 v2 |
| CT4 | 在 Reading 与 Review 复用结构化上下文渲染；内嵌答案共享、筛选保留全表、Pane DOM/导航和标记稳定 | 已完成：单题保留全表且仅目标题可答；双 Pane 共用答案与标记，DOM/导航按 Pane 隔离；Review 复用同一只读组件 |
| CT5 | 新增原创表格／列表 PDF，生成、渲染和目视核验；补齐模型、页面、Review、标记及旧数据回归测试 | 已完成：3 页原创文本层 PDF 已生成、提取并逐页渲染目视检查；覆盖规则表格、列表、Q18、同文单元格和原创答案 |
| CT6 | 最终源码固定后连续两次 `npm test`，并运行 lint、Vite build、Cargo test | 已完成：两次均为 30 文件、177/177；lint、2009-module Vite build、Cargo 29/29 全部通过 |
| CT7 | 单文件备份旧 EXE，no-bundle 构建；在新 D 盘工作区完成真实原生导入、草稿／题包／答案／标记／视图退出重启验收 | 已完成：旧 EXE 单文件备份；新 Release 在 Vite 关闭时独立启动，真实系统文件框、草稿重启、正式安装、表格作答、标记、Pane 和 Review 均通过 |
| CT8 | 回写 CURRENT_STATE、WORK_LOG、DESKTOP_ACCEPTANCE、PDF_STRUCTURED_IMPORT，建立小型本地提交 | 已完成：实现与格式提交 `affa89d`；五份状态/验收文档已回写，未 push、未打 tag |

发布边界：沿用当前应用版本，只生成并启动本地 Windows Release EXE；不生成或安装 MSI/NSIS，不复制整个 target，不推送、不打 tag，不删除旧 Release、旧验收工作区、题包或数据库。

## 当前执行切片：Reading PDF 人工确认式多 Passage / 多题组结构化导入

恢复基准为 `D:\Projects\雅思or算法软件项目`、分支 `feat/pdf-import-mvp`、起始 HEAD `174d89266bef4f4816fd075b3614709fb87325d6`；恢复时工作树干净。本轮在现有 Import Center、IELTSPack v1 和 Repository 架构上增量扩展，不做 OCR、样本特判或复杂版面自动识别，也不改变已完成的 Reading 练习页。

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| SI1 | 复核 PDF 适配器、题包 schema、Repository/SQLite/IPC、关闭保存与现有测试边界 | 已完成：确认现有 MVP 仅生成单 Section/单题组，草稿只存在于 React 内存，稳定领域 ID 到最终构建时才生成 |
| SI2 | 建立带来源快照与一次生成稳定 ID 的结构化草稿模型，实现片段分配、Passage/题组/题目编辑及校验/预览 | 已完成：支持任意 Passage、显式题组/题目成员、同页拆分/跨页合并、重排/移动、阻塞错误与警告；不支持题型必须人工改为现有类型 |
| SI3 | 通过现有 Repository 增加 SQLite 草稿持久化、恢复、SHA-256 重选核验、明确丢弃与安装失败保留 | 已完成：结构化草稿经 Repository settings 写入工作区 SQLite；关闭前刷新、恢复不预写默认值、重选 SHA 核验、显式丢弃和安装失败保留均已接入 |
| SI4 | 将结构化流程接入现有 PDF 导入页，同时保留简单单 Passage 路径；补齐至少 10 类自动化测试 | 已完成：简单路径保留；新增 18 个模型测试和 2 个页面流程测试，覆盖稳定 ID、编辑/移动、来源恢复、答案映射、阻塞校验、草稿持久化及失败保留 |
| SI5 | 生成原创多页文本层 PDF、生成脚本和预期结构，走正常导入链路完成桌面验收 | 已完成：7 页原创文本层 PDF 含 3 Passage、每篇 2 题组、Q18 位于 Passage 3；逐页渲染、浏览器链路和原生 Windows 文件对话框导入均通过 |
| SI6 | 连续两次前端测试，并执行 lint、Vite build、Cargo test | 已完成：前端连续两次 28 文件、163/163；lint、2004-module Vite build、Cargo 26/26 通过 |
| SI7 | 单文件备份旧 EXE，构建并独立启动新 Release；在全新 D 盘工作区完成退出/重启恢复证据 | 已完成：新 EXE 在 Vite 关闭时独立启动；SQLite 草稿恢复、来源重选、正式安装、Q18/标记和 Pane 选择退出重启恢复均通过 |
| SI8 | 增量更新状态/工作日志/桌面验收/导入文档并建立小型本地提交 | 已完成：实现提交 `a6771d6`；Release 原生证据已回写状态、工作日志、验收和导入文档，未 push、未打 tag |

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
# Current slice: compact Reading completion answers (2026-09-15)

| Step | Work | Status |
| --- | --- | --- |
| A | Reproduce the completion-layout defect in the native Reading workbench and identify the invalid block-in-inline rendering path | Complete |
| B | Render completion-bound text answers as compact inline controls without repeating prompts or word-limit text | Complete |
| C | Add focused component coverage, run lint/tests/build, rebuild the Tauri Release, and repeat native visual acceptance | Complete: lint passed; 235/235 full tests and 16/16 focused tests passed; production and Tauri Release builds passed; native Q1-Q5 visual check passed |

# Current slice: product operating-system rebuild (2026-09-17)

| Step | Work | Status |
| --- | --- | --- |
| A | Preserve the live tree, audit the active checkout, local IELTS source library and DDDD installer, and record the evidence boundary | Complete: full Git/worktree backup, SHA-256 material inventory, Cambridge 4–20 coverage audit and static-only DDDD audit recorded under `docs/rebuild/` |
| B | Replace the shell with Home/Library/Review/Progress/Settings, preserve stable practice routes, and make Home/Progress derive from real repository data | Complete; automated and native acceptance passed |
| C | Upgrade Reading/Listening/Review with persisted layout/audio state, verified transcript cues, review scheduling and source audio links while preserving Exam restrictions | Complete; focused and full frontend/Rust gates passed |
| D | Add explicit, scoped Obsidian daily-brief export with backup and hash verification | Complete; native first write and idempotent second export verified |
| E | Back up the live learning workspace, apply migration 0005, run full frontend/Rust/build/no-bundle gates, exercise restart/persistence, and capture native screenshots at 1366×768 and 1920×1080 | Complete; evidence and remaining limitations are recorded in `docs/rebuild/10-acceptance-report.md` |

Safety boundary: the verified Cambridge 17 workspace packs remain private user data outside Git. Cambridge 20 source PDFs/audio were inventoried, but no graded C20 pack will be claimed or installed until OCR text and an authoritative answer key are manually verified.
